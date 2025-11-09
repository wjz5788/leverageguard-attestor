import { JsonRpcProvider, Contract, Log } from "ethers";
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
    
    // CheckoutUSDC合约ABI（根据你的实际ABI调整）
    const ABI = [
      "event PremiumPaid(bytes32 indexed orderId, address indexed buyer, uint256 amount, bytes32 indexed quoteHash, uint256 timestamp)",
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

    // 监听PremiumPaid事件
    this.contract.on("PremiumPaid", async (...args) => {
      try {
        const ev = args[args.length - 1] as Log;
        
        // 从事件参数中提取数据
        const orderId = args[0];
        const buyer = args[1];
        const amount = args[2];
        const quoteHash = args[3];
        const timestamp = args[4];

        console.log("🎯 监听到PremiumPaid事件:", {
          transactionHash: ev.transactionHash,
          logIndex: ev.index,
          orderId,
          buyer,
          amount: amount.toString(),
          quoteHash,
          timestamp: new Date(Number(timestamp) * 1000).toISOString()
        });

        try {
          // 1) 校验事件数据
          await this.validateEvent(ev, orderId, buyer, amount, quoteHash);

          // 2) 回填订单状态（只信链上事件）
          await this.updateOrderStatus(ev, orderId, buyer, amount, quoteHash);

          // 3) 发送合约事件告警
          await this.alertService.sendContractEventAlert({
            eventName: "PremiumPaid",
            transactionHash: ev.transactionHash,
            blockNumber: ev.blockNumber,
            logIndex: ev.index,
            orderId,
            amount: amount.toString(),
            payer: buyer
          });

          console.log("✅ 事件处理完成");
        } catch (error) {
          console.error("❌ 事件处理失败:", error);
          
          // 发送错误告警
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
    quoteHash: string
  ): Promise<void> {
    console.log("🔍 验证事件数据...");

    // 1) 校验to=TREASURY
    const treasuryAddress = await this.contract.treasury();
    const expectedTreasury = process.env.TREASURY_ADDRESS ?? "0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b";
    
    if (treasuryAddress.toLowerCase() !== expectedTreasury.toLowerCase()) {
      throw new Error(`Treasury地址不匹配: ${treasuryAddress} != ${expectedTreasury}`);
    }

    // 2) 校验token=USDC
    const usdcAddress = await this.contract.USDC();
    const expectedUsdc = process.env.BASE_USDC_ADDRESS ?? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
    
    if (usdcAddress.toLowerCase() !== expectedUsdc.toLowerCase()) {
      throw new Error(`USDC地址不匹配: ${usdcAddress} != ${expectedUsdc}`);
    }

    // 3) 校验订单是否已处理（幂等性检查）
    const isProcessed = await this.isEventProcessed(ev.transactionHash, ev.logIndex);
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
    quoteHash: string
  ): Promise<void> {
    console.log("📝 更新订单状态...");

    const payload = {
      txHash: ev.transactionHash,
      logIndex: ev.logIndex,
      orderId,
      buyer,
      amount: amount.toString(),
      quoteHash,
      blockNumber: ev.blockNumber,
      timestamp: new Date()
    } as const;

    await withTransaction(async () => {
      await this.recordEvent(payload);
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
        (err, row) => {
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
        function(err) {
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
}
