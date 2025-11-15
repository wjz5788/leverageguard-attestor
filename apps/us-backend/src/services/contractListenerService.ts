import { JsonRpcProvider, Contract, Log, EventLog } from "ethers";
import { DatabaseManager, db, withTransaction } from "../database/db.js";
import OrderService from "./orderService.js";
import { AlertService } from "./alertService.js";

/**
 * PremiumPaid事件监听服务
 * 监听CheckoutUSDC合约的PremiumPaid事件，自动回填订单状态
 */
export class ContractListenerService {
  private provider: JsonRpcProvider;
  private contract: Contract;
  private db: any;
  private isListening: boolean = false;
  private alertService: AlertService;
  private lastHealthCheck: number = Date.now();
  private orderService?: OrderService;
  private confirmations: number;
  private lastBlockNumber: number = 0;
  private reorganizationDepth: number = 12; // 重组深度阈值
  private reorganizationCheckInterval: number = 60000; // 重组检查间隔（1分钟）
  private reorganizationCheckTimer?: NodeJS.Timeout;

  constructor(orderService?: OrderService) {
    // 从环境变量获取配置
    const RPC = process.env.BASE_RPC ?? "https://mainnet.base.org";
    const CONTRACT_ADDRESS = process.env.CHECKOUT_USDC_ADDRESS ?? "0xc423c34b57730ba87fb74b99180663913a345d68";
    const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS ?? "0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b";
    const USDC_ADDRESS = process.env.BASE_USDC_ADDRESS ?? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

    this.provider = new JsonRpcProvider(RPC);
    this.db = db;
    this.orderService = orderService;
    
    // 初始化告警服务
    const alertConfig = {
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      emailConfig: process.env.EMAIL_CONFIG ? JSON.parse(process.env.EMAIL_CONFIG) : undefined
    };
    this.alertService = new AlertService(alertConfig);
    this.confirmations = Number(process.env.EVENT_CONFIRMATIONS || 3);
    
    // CheckoutUSDC合约ABI（根据你的实际ABI调整）
    const ABI = [
      "event PremiumPaid(bytes32 indexed orderId, address indexed buyer, uint256 amount, bytes32 indexed quoteHash, address token, address treasury, uint256 chainId, uint256 timestamp)",
      "function USDC() public view returns (address)",
      "function treasury() public view returns (address)",
      "function owner() public view returns (address)",
      "function paused() public view returns (bool)",
      "function isOrderProcessed(bytes32 orderId) external view returns (bool)"
    ];

    this.contract = new Contract(CONTRACT_ADDRESS, ABI, this.provider);
  }

  /**
   * 启动事件监听
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      console.log("⚠️  事件监听器已在运行中");
      return;
    }

    console.log("🚀 启动PremiumPaid事件监听...");

    // 启动重组检测
    this.startReorganizationDetection();

    // 回放最近未确认窗口内的事件，避免重启丢失
    try {
      await this.replayFromCheckpoint();
    } catch (e) {
      console.warn('回放历史事件失败（将继续实时监听）:', e);
    }

    // 监听PremiumPaid事件
    this.contract.on("PremiumPaid", async (...args) => {
      try {
        const ev = args[args.length - 1] as EventLog;
        const eventArgs = ev.args as any;
        const orderId = eventArgs.orderId ?? eventArgs[0];
        const buyer = eventArgs.buyer ?? eventArgs[1];
        const amount = eventArgs.amount ?? eventArgs[2];
        const quoteHash = eventArgs.quoteHash ?? eventArgs[3];
        const token = eventArgs.token ?? eventArgs[4];
        const treasury = eventArgs.treasury ?? eventArgs[5];
        const chainId = eventArgs.chainId ?? eventArgs[6];
        const timestamp = eventArgs.timestamp ?? eventArgs[7];

        const orderIdHex = orderId?.toString?.() ?? '';
        const buyerAddr = buyer?.toString?.() ?? '';
        const amountStr = amount?.toString?.() ?? '0';
        const ts = Number(timestamp);
        const isoTimestamp = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : new Date().toISOString();
        const tokenAddr = token?.toString?.() ?? '';
        const treasuryAddr = treasury?.toString?.() ?? '';
        const chainIdStr = chainId?.toString?.();

        console.log("🎯 监听到PremiumPaid事件:", {
          transactionHash: ev.transactionHash,
          logIndex: ev.index,
          orderId: orderIdHex,
          buyer: buyerAddr,
          amount: amountStr,
          quoteHash,
          token: tokenAddr,
          treasury: treasuryAddr,
          chainId: chainIdStr,
          timestamp: isoTimestamp
        });

        try {
          await this.validateEvent(ev, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, chainId);
          await this.updateOrderStatus(ev, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, timestamp);

          await this.alertService.sendContractEventAlert({
            eventName: "PremiumPaid",
            transactionHash: ev.transactionHash,
            blockNumber: ev.blockNumber,
            logIndex: ev.index,
            orderId: orderIdHex,
            amount: amountStr,
            payer: buyerAddr,
            token: tokenAddr,
            treasury: treasuryAddr,
            chainId: chainIdStr
          });

          console.log("✅ 事件处理完成");
        } catch (error) {
          console.error("❌ 事件处理失败:", error);

          await this.alertService.sendSystemErrorAlert(
            error as Error,
            `处理PremiumPaid事件失败: ${ev.transactionHash}`
          );
        }
      } catch (outerError) {
        console.error("❌ 事件监听器外层错误:", outerError);
      }
    });

    this.isListening = true;
    console.log("✅ PremiumPaid事件监听器已启动");
  }

  private async getLastProcessedBlock(): Promise<number> {
    return new Promise((resolve) => {
      this.db.get('SELECT last_processed_block FROM chain_listener WHERE id=?', ['checkout_usdc'], (err: any, row: any) => {
        if (err || !row) return resolve(0);
        resolve(Number(row.last_processed_block) || 0);
      });
    });
  }

  private async setLastProcessedBlock(block: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO chain_listener (id, last_processed_block, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET last_processed_block=excluded.last_processed_block, updated_at=CURRENT_TIMESTAMP`,
        ['checkout_usdc', block],
        (err: any) => (err ? reject(err) : resolve())
      );
    });
  }

  private async replayFromCheckpoint(): Promise<void> {
    const current = await this.provider.getBlockNumber();
    const last = await this.getLastProcessedBlock();
    const toBlock = current - this.confirmations;
    if (toBlock <= 0) return;
    const fromBlock = Math.max(0, last > 0 ? last - this.confirmations : toBlock - 1000);
    if (fromBlock >= toBlock) return;

    console.log(`⏪ 回放 PremiumPaid 事件: from=${fromBlock} to=${toBlock}`);
    const filter = this.contract.filters.PremiumPaid();
    const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
    for (const ev of events) {
      try {
        const eventLog = ev as EventLog;
        const eventArgs = eventLog.args as any;
        const orderId = eventArgs.orderId ?? eventArgs[0];
        const buyer = eventArgs.buyer ?? eventArgs[1];
        const amount = eventArgs.amount ?? eventArgs[2];
        const quoteHash = eventArgs.quoteHash ?? eventArgs[3];
        const token = eventArgs.token ?? eventArgs[4];
        const treasury = eventArgs.treasury ?? eventArgs[5];
        const chainId = eventArgs.chainId ?? eventArgs[6];
        const timestamp = eventArgs.timestamp ?? eventArgs[7];

        const orderIdHex = orderId?.toString?.() ?? '';
        const buyerAddr = buyer?.toString?.() ?? '';
        const tokenAddr = token?.toString?.() ?? '';
        const treasuryAddr = treasury?.toString?.() ?? '';

        await this.validateEvent(eventLog, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, chainId);
        await this.updateOrderStatus(eventLog, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, timestamp);
      } catch (e) {
        console.warn('回放事件处理失败:', e);
      }
    }
  }

  /**
   * 停止事件监听
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) {
      console.log("⚠️  事件监听器未在运行");
      return;
    }

    this.contract.removeAllListeners("PremiumPaid");
    this.isListening = false;
    console.log("🛑 PremiumPaid事件监听器已停止");
  }

  /**
   * 验证事件数据
   */
  private async validateEvent(
    ev: Log,
    orderId: string,
    buyer: string,
    amount: bigint,
    quoteHash: string,
    token: string,
    treasury: string,
    chainId: bigint | number
  ): Promise<void> {
    console.log("🔍 验证事件数据...");

    const expectedTreasury = (process.env.TREASURY_ADDRESS ?? "0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b").toLowerCase();
    const expectedUsdc = (process.env.BASE_USDC_ADDRESS ?? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913").toLowerCase();

    const normalizedTreasury = (treasury ?? '').toString().toLowerCase();
    const normalizedToken = (token ?? '').toString().toLowerCase();

    if (!normalizedTreasury || normalizedTreasury !== expectedTreasury) {
      throw new Error(`Treasury地址不匹配: ${normalizedTreasury} != ${expectedTreasury}`);
    }

    if (!normalizedToken || normalizedToken !== expectedUsdc) {
      throw new Error(`USDC地址不匹配: ${normalizedToken} != ${expectedUsdc}`);
    }

    const network = await this.provider.getNetwork();
    const chainIdBigInt = typeof chainId === 'bigint' ? chainId : BigInt(chainId ?? 0);
    if (chainIdBigInt !== network.chainId) {
      throw new Error(`链ID不匹配: 事件=${chainIdBigInt.toString()} 网络=${network.chainId.toString()}`);
    }

    if (!orderId || !buyer || !quoteHash) {
      throw new Error('事件字段缺失，无法验证订单。');
    }

    if (amount <= 0n) {
      throw new Error('事件金额非法。');
    }

    // 事件幂等性检查
    const isProcessed = await this.isEventProcessed(ev.transactionHash, ev.index);
    if (isProcessed) {
      console.log("⚠️  事件已处理过，跳过重复处理");
      throw new Error("事件已处理");
    }

    console.log("✅ 事件验证通过");
  }

  /**
   * 更新订单状态
   */
  private async updateOrderStatus(
    ev: Log,
    orderId: string,
    buyer: string,
    amount: bigint,
    quoteHash: string,
    token: string,
    treasury: string,
    timestamp: bigint | number
  ): Promise<void> {
    console.log("📝 更新订单状态...");

    const ts = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
    const eventDate = Number.isFinite(ts) ? new Date(ts * 1000) : new Date();
    const buyerAddress = buyer?.toString?.().toLowerCase?.() ?? buyer;

    const payload = {
      txHash: ev.transactionHash,
      logIndex: ev.index,
      orderId,
      buyer: buyerAddress,
      amount: amount.toString(),
      quoteHash,
      blockNumber: ev.blockNumber,
      timestamp: eventDate,
      token: token?.toString?.().toLowerCase?.() ?? token,
      treasury: treasury?.toString?.().toLowerCase?.() ?? treasury
    } as const;

    await withTransaction(async () => {
      await this.recordEvent(payload);
      await this.setLastProcessedBlock(payload.blockNumber);
      // 仅在内存订单中尝试回填（按钱包+金额6d匹配最近的pending订单）
      try {
        const amt6d = Number(payload.amount);
        if (Number.isFinite(amt6d) && this.orderService) {
          const ok = this.orderService.markPaidByWalletAndAmount(payload.buyer, amt6d);
          console.log(ok ? "📋 订单状态更新: paid" : "ℹ️ 未匹配到待支付订单（已记录事件）");
        }
      } catch (e) {
        console.warn('回填订单状态失败（已记录事件）:', e);
      }
    });
  }

  /**
   * 发送通知
   */
  private async sendNotification(
    ev: Log,
    orderId: string,
    buyer: string,
    amount: bigint
  ): Promise<void> {
    // TODO: 集成Slack/Telegram通知
    console.log("📢 发送通知: PremiumPaid事件", {
      orderId,
      buyer,
      amount: amount.toString(),
      txHash: ev.transactionHash
    });
  }

  /**
   * 检查事件是否已处理（幂等性）
   */
  private async isEventProcessed(txHash: string, logIndex: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM contract_events WHERE tx_hash = ? AND log_index = ?',
        [txHash, logIndex],
        (err: Error | null, row: any) => {
          if (err) {
            console.error('❌ 查询事件处理状态失败:', err);
            reject(err);
            return;
          }
          resolve(!!row);
        }
      );
    });
  }

  /**
   * 记录事件到数据库
   */
  private async recordEvent(eventData: {
    txHash: string;
    logIndex: number;
    orderId: string;
    buyer: string;
    amount: string;
    quoteHash: string;
    blockNumber: number;
    timestamp: Date;
    token?: string | null;
    treasury?: string | null;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO contract_events (
          tx_hash, log_index, order_id, buyer_address, amount, 
          quote_hash, block_number, event_timestamp, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventData.txHash,
          eventData.logIndex,
          eventData.orderId,
          eventData.buyer,
          eventData.amount,
          eventData.quoteHash,
          eventData.blockNumber,
          Math.floor(eventData.timestamp.getTime() / 1000),
          'processed'
        ],
        function(this: any, err: Error | null) {
          if (err) {
            console.error('❌ 记录事件到数据库失败:', err);
            reject(err);
            return;
          }
          console.log('✅ 事件记录成功，ID:', this.lastID);
          resolve();
        }
      );
    });
  }

  /**
   * 获取监听状态
   */
  getStatus(): { isListening: boolean } {
    return { isListening: this.isListening };
  }

  /**
   * 启动重组检测
   */
  private startReorganizationDetection(): void {
    this.reorganizationCheckTimer = setInterval(async () => {
      try {
        await this.checkForReorganization();
      } catch (error) {
        console.error("❌ 重组检测失败:", error);
      }
    }, this.reorganizationCheckInterval);
  }

  /**
   * 检查区块链重组
   */
  private async checkForReorganization(): Promise<void> {
    try {
      const currentBlockNumber = await this.provider.getBlockNumber();
      
      if (this.lastBlockNumber === 0) {
        this.lastBlockNumber = currentBlockNumber;
        return;
      }

      // 检测到重组（区块号回退）
      if (currentBlockNumber < this.lastBlockNumber) {
        const depth = this.lastBlockNumber - currentBlockNumber;
        console.warn(`⚠️  检测到区块链重组: 深度=${depth} 区块`);
        
        if (depth <= this.reorganizationDepth) {
          await this.handleReorganization(depth);
        } else {
          console.error(`❌ 重组深度过大 (${depth} > ${this.reorganizationDepth})，需要手动干预`);
          await this.alertService.sendSystemErrorAlert(
            new Error(`检测到深度重组: ${depth} 区块`),
            "区块链重组深度过大"
          );
        }
      }
      
      this.lastBlockNumber = currentBlockNumber;
    } catch (error) {
      console.error("❌ 重组检测失败:", error);
    }
  }

  /**
   * 处理区块链重组
   */
  private async handleReorganization(depth: number): Promise<void> {
    console.log(`🔄 处理区块链重组: 深度=${depth} 区块`);
    
    try {
      // 1. 暂停事件监听
      this.contract.removeAllListeners("PremiumPaid");
      
      // 2. 回滚受影响的事件
      await this.rollbackAffectedEvents(depth);
      
      // 3. 重新启动监听器
      await this.restartListeningAfterReorganization();
      
      console.log("✅ 重组处理完成");
      
      // 发送重组通知
      await this.alertService.sendSystemAlert({
        level: "warning",
        title: "区块链重组处理完成",
        message: `成功处理了深度为 ${depth} 区块的区块链重组`,
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error("❌ 重组处理失败:", error);
      
      await this.alertService.sendSystemErrorAlert(
        error as Error,
        "区块链重组处理失败"
      );
    }
  }

  /**
   * 回滚受影响的事件
   */
  private async rollbackAffectedEvents(depth: number): Promise<void> {
    const rollbackBlock = this.lastBlockNumber - depth;
    
    console.log(`⏪ 回滚从区块 ${rollbackBlock} 开始的事件...`);
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM contract_events 
         WHERE block_number >= ? AND status = 'processed'`,
        [rollbackBlock],
        function(this: any, err: Error | null) {
          if (err) {
            reject(err);
            return;
          }
          
          console.log(`✅ 已回滚 ${this.changes} 个受影响事件`);
          resolve();
        }
      );
    });
  }

  /**
   * 重组后重新启动监听器
   */
  private async restartListeningAfterReorganization(): Promise<void> {
    console.log("🔄 重组后重新启动监听器...");
    
    // 重置最后处理的区块号
    await this.setLastProcessedBlock(this.lastBlockNumber - this.reorganizationDepth);
    
    // 重新回放事件
    await this.replayFromCheckpoint();
    
    // 重新监听事件
    this.contract.on("PremiumPaid", async (...args) => {
      // 使用现有的处理逻辑
      try {
        const ev = args[args.length - 1] as EventLog;
        const eventArgs = ev.args as any;
        const orderId = eventArgs.orderId ?? eventArgs[0];
        const buyer = eventArgs.buyer ?? eventArgs[1];
        const amount = eventArgs.amount ?? eventArgs[2];
        const quoteHash = eventArgs.quoteHash ?? eventArgs[3];
        const token = eventArgs.token ?? eventArgs[4];
        const treasury = eventArgs.treasury ?? eventArgs[5];
        const chainId = eventArgs.chainId ?? eventArgs[6];
        const timestamp = eventArgs.timestamp ?? eventArgs[7];

        const orderIdHex = orderId?.toString?.() ?? '';
        const buyerAddr = buyer?.toString?.() ?? '';
        const amountStr = amount?.toString?.() ?? '0';
        const ts = Number(timestamp);
        const isoTimestamp = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : new Date().toISOString();
        const tokenAddr = token?.toString?.() ?? '';
        const treasuryAddr = treasury?.toString?.() ?? '';
        const chainIdStr = chainId?.toString?.();

        console.log("🎯 监听到PremiumPaid事件:", {
          transactionHash: ev.transactionHash,
          logIndex: ev.index,
          orderId: orderIdHex,
          buyer: buyerAddr,
          amount: amountStr,
          quoteHash,
          token: tokenAddr,
          treasury: treasuryAddr,
          chainId: chainIdStr,
          timestamp: isoTimestamp
        });

        try {
          await this.validateEvent(ev, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, chainId);
          await this.updateOrderStatus(ev, orderIdHex, buyerAddr, amount, quoteHash, tokenAddr, treasuryAddr, timestamp);

          await this.alertService.sendContractEventAlert({
            eventName: "PremiumPaid",
            transactionHash: ev.transactionHash,
            blockNumber: ev.blockNumber,
            logIndex: ev.index,
            orderId: orderIdHex,
            amount: amountStr,
            payer: buyerAddr,
            token: tokenAddr,
            treasury: treasuryAddr,
            chainId: chainIdStr
          });

          console.log("✅ 事件处理完成");
        } catch (error) {
          console.error("❌ 事件处理失败:", error);

          await this.alertService.sendSystemErrorAlert(
            error as Error,
            `处理PremiumPaid事件失败: ${ev.transactionHash}`
          );
        }
      } catch (outerError) {
        console.error("❌ 事件监听器外层错误:", outerError);
      }
    });
  }

  /**
   * 停止重组检测
   */
  private stopReorganizationDetection(): void {
    if (this.reorganizationCheckTimer) {
      clearInterval(this.reorganizationCheckTimer);
      this.reorganizationCheckTimer = undefined;
    }
  }

  /**
   * 停止事件监听
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) {
      console.log("⚠️  事件监听器未在运行");
      return;
    }

    this.stopReorganizationDetection();
    this.contract.removeAllListeners("PremiumPaid");
    this.isListening = false;
    console.log("🛑 PremiumPaid事件监听器已停止");
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.provider.getBlockNumber();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  /**
   * 获取重组检测状态
   */
  getReorganizationStatus(): { 
    isDetecting: boolean; 
    lastBlockNumber: number; 
    reorganizationDepth: number 
  } {
    return {
      isDetecting: !!this.reorganizationCheckTimer,
      lastBlockNumber: this.lastBlockNumber,
      reorganizationDepth: this.reorganizationDepth
    };
  }
}
