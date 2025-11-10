/**
 * 环境变量校验与契约封装（Fail-Fast + 启动摘要）
 */

type ListenerConfig = {
  confirmations: number;
  safeDepth: number;
  pollIntervalSec: number;
  replayFromBlock: number;
};

type EnvConfig = {
  vaultAddress: string;
  chainId: number;
  usdcAddress: string;
  dbFile: string;
  listener: ListenerConfig;
};

export class EnvValidator {
  /**
   * 启动时执行：完成兼容映射、严格校验，并打印启动摘要。
   * 缺失必填键时直接抛错（让进程退出）。
   */
  static validatePaymentConfig(): void {
    this.applyCompatMapping();
    const { errors, config } = this.validateAndBuild();
    if (errors.length) {
      throw new Error(`支付配置校验失败:\n${errors.join('\n')}`);
    }

    // 将归一化后的值回写到 env，便于下游统一读取
    process.env.PAYMENT_VAULT_ADDRESS = config.vaultAddress;
    process.env.PAYMENT_CHAIN_ID = String(config.chainId);
    process.env.USDC_ADDRESS = config.usdcAddress;
    process.env.DB_FILE = config.dbFile;
    process.env.CONFIRMATIONS = String(config.listener.confirmations);
    process.env.LISTENER_POLL_INTERVAL_SEC = String(config.listener.pollIntervalSec);
    process.env.REPLAY_FROM_BLOCK = String(config.listener.replayFromBlock);

    // 同步回写旧键（仅当旧键未设置时），以减少其他模块改动
    if (!process.env.TREASURY_ADDRESS) process.env.TREASURY_ADDRESS = config.vaultAddress;
    if (!process.env.BASE_USDC_ADDRESS) process.env.BASE_USDC_ADDRESS = config.usdcAddress;
    if (!process.env.DB_URL) process.env.DB_URL = config.dbFile;
    if (!process.env.EVENT_CONFIRMATIONS) process.env.EVENT_CONFIRMATIONS = String(config.listener.confirmations);

    // 启动摘要
    this.printStartupSummary(config);
  }

  /**
   * 兼容旧键映射（新键优先）。检测到旧键参与映射时，打印兼容告警。
   */
  private static applyCompatMapping(): void {
    const deprecate = (oldKey: string, newKey: string) => {
      const deadline = this.compatDeadlineStr();
      console.warn(`⚠️  [Compat] 检测到旧键 ${oldKey}，优先使用 ${newKey}。旧键将在 ${deadline} 后移除。`);
    };

    // vault: TREASURY_ADDRESS -> PAYMENT_VAULT_ADDRESS
    if (!process.env.PAYMENT_VAULT_ADDRESS && process.env.TREASURY_ADDRESS) {
      deprecate('TREASURY_ADDRESS', 'PAYMENT_VAULT_ADDRESS');
      process.env.PAYMENT_VAULT_ADDRESS = process.env.TREASURY_ADDRESS;
    }

    // usdc: BASE_USDC_ADDRESS -> USDC_ADDRESS
    if (!process.env.USDC_ADDRESS && process.env.BASE_USDC_ADDRESS) {
      deprecate('BASE_USDC_ADDRESS', 'USDC_ADDRESS');
      process.env.USDC_ADDRESS = process.env.BASE_USDC_ADDRESS;
    }

    // db: DB_URL -> DB_FILE
    if (!process.env.DB_FILE && process.env.DB_URL) {
      deprecate('DB_URL', 'DB_FILE');
      process.env.DB_FILE = process.env.DB_URL;
    }

    // listener confirmations: EVENT_CONFIRMATIONS -> CONFIRMATIONS （未在旧键清单中，但历史存在）
    if (!process.env.CONFIRMATIONS && process.env.EVENT_CONFIRMATIONS) {
      deprecate('EVENT_CONFIRMATIONS', 'CONFIRMATIONS');
      process.env.CONFIRMATIONS = process.env.EVENT_CONFIRMATIONS;
    }
  }

  private static validateAndBuild(): { errors: string[]; config: EnvConfig } {
    const errors: string[] = [];

    const vaultAddress = (process.env.PAYMENT_VAULT_ADDRESS || '').trim();
    if (!vaultAddress) errors.push('PAYMENT_VAULT_ADDRESS 环境变量缺失');
    else if (!this.isValidEthereumAddress(vaultAddress)) errors.push('PAYMENT_VAULT_ADDRESS 不是有效的以太坊地址');
    else if (this.isBlackholeAddress(vaultAddress)) errors.push('PAYMENT_VAULT_ADDRESS 不能是黑洞地址');

    const chainIdRaw = (process.env.PAYMENT_CHAIN_ID || '').trim();
    let chainId = 0;
    if (!chainIdRaw) {
      errors.push('PAYMENT_CHAIN_ID 环境变量缺失');
    } else if (!this.isValidChainId(chainIdRaw)) {
      errors.push('PAYMENT_CHAIN_ID 不是有效的链ID（十进制或0x十六进制）');
    } else {
      chainId = this.parseChainId(chainIdRaw);
      if (!Number.isFinite(chainId) || chainId <= 0) errors.push('PAYMENT_CHAIN_ID 解析失败');
    }

    const usdcAddress = (process.env.USDC_ADDRESS || '').trim();
    if (!usdcAddress) errors.push('USDC_ADDRESS 环境变量缺失');
    else if (!this.isValidEthereumAddress(usdcAddress)) errors.push('USDC_ADDRESS 不是有效的以太坊地址');
    else if (this.isBlackholeAddress(usdcAddress)) errors.push('USDC_ADDRESS 不能是黑洞地址');

    const dbFile = (process.env.DB_FILE || './data/liqpass.db').trim();

    // listener settings
    const confirmations = this.parsePositiveInt(process.env.CONFIRMATIONS, 3);
    const pollIntervalSec = this.parsePositiveInt(process.env.LISTENER_POLL_INTERVAL_SEC, 5);
    const replayFromBlock = this.parseNonNegativeInt(process.env.REPLAY_FROM_BLOCK, 0);

    if (confirmations <= 0) errors.push('CONFIRMATIONS 必须为正整数');
    if (pollIntervalSec <= 0) errors.push('LISTENER_POLL_INTERVAL_SEC 必须为正整数');
    if (replayFromBlock < 0) errors.push('REPLAY_FROM_BLOCK 必须为非负整数');

    const config: EnvConfig = {
      vaultAddress,
      chainId,
      usdcAddress,
      dbFile,
      listener: {
        confirmations,
        safeDepth: confirmations, // 约定：safe_depth = confirmations
        pollIntervalSec,
        replayFromBlock,
      },
    };

    return { errors, config };
  }

  private static parsePositiveInt(v: string | undefined, d: number): number {
    const n = Number((v || '').trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  }
  private static parseNonNegativeInt(v: string | undefined, d: number): number {
    const n = Number((v || '').trim());
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
  }

  /** 地址校验 */
  private static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  private static isBlackholeAddress(address: string): boolean {
    const a = address.toLowerCase();
    return a === '0x0000000000000000000000000000000000000000' ||
           a === '0x000000000000000000000000000000000000dead' ||
           a === '0x0000000000000000000000000000000000000001';
  }

  /** 链ID校验/解析 */
  private static isValidChainId(chainId: string): boolean {
    return /^\d+$/.test(chainId) || /^0x[a-fA-F0-9]+$/.test(chainId);
  }
  private static parseChainId(chainId: string): number {
    return chainId.startsWith('0x') ? parseInt(chainId, 16) : parseInt(chainId, 10);
  }

  /** 启动摘要（脱敏） */
  private static printStartupSummary(cfg: EnvConfig): void {
    const mask = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-4)}`;
    console.log('✅ 支付环境变量校验通过');
    console.log('🔎 契约摘要:');
    console.log(`   chain_id: ${cfg.chainId}`);
    console.log(`   usdc: ${mask(cfg.usdcAddress)}`);
    console.log(`   vault: ${mask(cfg.vaultAddress)}`);
    console.log(
      `   listener: { confirmations: ${cfg.listener.confirmations}, safe_depth: ${cfg.listener.safeDepth}, poll: ${cfg.listener.pollIntervalSec}s, from_block: ${cfg.listener.replayFromBlock} }`
    );
    console.log(`   db_file: ${cfg.dbFile}`);
  }

  private static compatDeadlineStr(): string {
    const ts = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** 读取支付配置（归一化后） */
  static getPaymentConfig(): { vaultAddress: string; chainId: string; usdcAddress: string } {
    return {
      vaultAddress: process.env.PAYMENT_VAULT_ADDRESS!,
      chainId: String(process.env.PAYMENT_CHAIN_ID!),
      usdcAddress: process.env.USDC_ADDRESS!,
    };
  }
}
