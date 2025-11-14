import { Database } from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { db } from '../database/db.js';

// 定义订单相关接口
export interface SkuDefinition {
  id: string;
  code: string;
  title: string;
  description: string;
  enabled: boolean;
  windowHours: number;
  leverageMin: number;
  leverageMax: number;
  principalMin: number;
  principalMax: number;
  payoutCapUsd: number;
  pricing: {
    feeCap: number;
    payoutFloor: number;
    payoutCap: number;
    quoteTtlSeconds: number;
  };
}

export interface QuoteRecord {
  id: string;
  skuId: string;
  principal: number;
  leverage: number;
  feeRatio: number;
  payoutRatio: number;
  premiumUSDC6d: number;
  payoutUSDC6d: number;
  expiresAt: string;
  consumed: boolean;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
  premiumUSDC6d: number;
  payoutUSDC6d: number;
  feeRatio: number;
  payoutRatio: number;
  idempotencyKey: string;
  quoteExpiresAt: string;
  paymentMethod: string;
  paymentTx?: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentProofId?: string;
  orderRef?: string;
  exchange: string;
  pair: string;
  status: 'pending' | 'paid' | 'active' | 'expired' | 'claimed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
  paymentMethod: string;
  idempotencyKey: string;
  premiumUSDC6d: number;
  paymentProofId?: string;
  orderRef?: string;
  exchange: string;
  pair: string;
}

export interface PaymentConfig {
  methods: string[];
}

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OrderError';
  }
}

// 辅助函数
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export class OrderServiceDb {
  private payment: PaymentConfig;
  private quoteTtlSeconds: number;
  private db: Database;

  constructor(options: { payment: PaymentConfig; quoteTtlSeconds?: number }) {
    this.payment = options.payment;
    this.quoteTtlSeconds = options.quoteTtlSeconds || 300; // 默认5分钟
    this.db = db; // 使用全局数据库实例
  }

  async getSku(skuId: string): Promise<SkuDefinition | undefined> {
    // 从数据库获取SKU定义
    const stmt = this.db.prepare(`
      SELECT * FROM skus WHERE id = ?
    `);
    const row = stmt.get(skuId) as any;
    
    if (!row) return undefined;
    
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      enabled: row.status === 'active',
      windowHours: row.duration_hours,
      leverageMin: row.leverage_min,
      leverageMax: row.leverage_max,
      principalMin: row.principal_min_usdc / 1_000_000,
      principalMax: row.principal_max_usdc / 1_000_000,
      payoutCapUsd: 0, // 需要根据业务逻辑确定
      pricing: {
        feeCap: parseFloat(row.fee_rate),
        payoutFloor: 0.1, // 需要根据业务逻辑确定
        payoutCap: 0.5, // 需要根据业务逻辑确定
        quoteTtlSeconds: this.quoteTtlSeconds
      }
    };
  }

  async listSkus(): Promise<SkuDefinition[]> {
    // 从数据库获取所有SKU定义
    const stmt = this.db.prepare(`
      SELECT * FROM skus WHERE status = 'active'
    `);
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      enabled: row.status === 'active',
      windowHours: row.duration_hours,
      leverageMin: row.leverage_min,
      leverageMax: row.leverage_max,
      principalMin: row.principal_min_usdc / 1_000_000,
      principalMax: row.principal_max_usdc / 1_000_000,
      payoutCapUsd: 0, // 需要根据业务逻辑确定
      pricing: {
        feeCap: parseFloat(row.fee_rate),
        payoutFloor: 0.1, // 需要根据业务逻辑确定
        payoutCap: 0.5, // 需要根据业务逻辑确定
        quoteTtlSeconds: this.quoteTtlSeconds
      }
    }));
  }

  async preview(skuId: string, principal: number, leverage: number): Promise<QuoteRecord> {
    const sku = await this.getSku(skuId);
    if (!sku) {
      throw new OrderError('SKU_NOT_FOUND', 'SKU not found.');
    }

    if (!sku.enabled) {
      throw new OrderError('SKU_DISABLED', 'SKU is disabled.');
    }

    const computed = this.computeQuote(sku, principal, leverage);
    const expiresAt = new Date(Date.now() + sku.pricing.quoteTtlSeconds * 1000).toISOString();
    const id = `ipm_${uuid()}`;
    const insertStmt = this.db.prepare(
      `INSERT INTO quotes (
        id, user_id, product_id, principal_usdc, leverage,
        premium_usdc, payout_usdc, fee_rate, params_json, expires_at,
        consumed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    insertStmt.run(
      id,
      'user-id-placeholder',
      skuId,
      Math.round(computed.principal * 1_000_000),
      Math.round(computed.leverage),
      computed.premiumUSDC6d,
      computed.payoutUSDC6d,
      computed.feeRatio,
      JSON.stringify({ principal, leverage }),
      expiresAt,
      new Date().toISOString()
    );

    return {
      id: id,
      skuId,
      principal: computed.principal,
      leverage: computed.leverage,
      feeRatio: computed.feeRatio,
      payoutRatio: computed.payoutRatio,
      premiumUSDC6d: computed.premiumUSDC6d,
      payoutUSDC6d: computed.payoutUSDC6d,
      expiresAt,
      consumed: false,
      createdAt: new Date().toISOString()
    };
  }

  async createOrder(input: CreateOrderInput): Promise<{ order: OrderRecord; created: boolean }> {
    // 检查幂等性键
    const existingOrder = await this.resolveByIdempotency(input.idempotencyKey);
    if (existingOrder) {
      return { order: existingOrder, created: false };
    }

    // 获取报价
    const quoteStmt = this.db.prepare(`
      SELECT * FROM quotes WHERE id = ? AND consumed = 0
    `);
    const quote = quoteStmt.get(input.idempotencyKey) as any;
    
    if (!quote) {
      throw new OrderError('QUOTE_NOT_FOUND', 'Quote not found or already consumed.');
    }

    // 检查报价是否过期
    if (new Date(quote.expires_at).getTime() < Date.now()) {
      throw new OrderError('QUOTE_STALE', 'Quote expired, please refresh.');
    }

    // 验证输入参数与报价是否匹配
    if (input.skuId !== quote.product_id) {
      throw new OrderError('INVALID_SKU', 'Quote does not match order SKU.');
    }

    const quotePrincipal = quote.principal_usdc / 1_000_000;
    if (Math.abs(input.principal - quotePrincipal) > 0.01) {
      throw new OrderError('PRINCIPAL_MISMATCH', 'Principal mismatch.');
    }

    if (Math.abs(input.leverage - quote.leverage) > 0.01) {
      throw new OrderError('LEVERAGE_MISMATCH', 'Leverage mismatch.');
    }

    const normalizedWallet = input.wallet.toLowerCase();
    // 这里应该验证钱包地址是否匹配，但在当前表结构中没有存储钱包地址

    const paymentMethod = input.paymentMethod;
    if (!this.payment.methods.includes(paymentMethod)) {
      throw new OrderError('UNSUPPORTED_PAYMENT_METHOD', 'Payment method is not supported.');
    }

    const premium6d = Math.round(input.premiumUSDC6d);
    if (Math.abs(premium6d - quote.premium_usdc) > 1) {
      throw new OrderError('PREMIUM_MISMATCH', 'Premium does not match quoted amount.');
    }

    // 检查订单引用是否已存在
    if (input.orderRef) {
      const orderRefStmt = this.db.prepare(`
        SELECT order_id FROM order_references WHERE external_ref = ?
      `);
      const existingRef = orderRefStmt.get(`${normalizedWallet}:${input.orderRef}`) as any;
      if (existingRef) {
        const orderStmt = this.db.prepare(`
          SELECT * FROM orders WHERE id = ?
        `);
        const foundOrder = orderStmt.get(existingRef.order_id) as any;
        if (foundOrder) {
          return { 
            order: this.mapOrderRecord(foundOrder), 
            created: false 
          };
        }
      }
    }

    // 创建新订单
    const nowIso = new Date().toISOString();
    const orderId = `ord_${uuid()}`;
    
    // 支付状态仅由链上事件驱动：创建时一律 pending
    const paymentStatus: 'pending' = 'pending';
    const status: 'pending' = 'pending';

    // 插入订单到数据库
    const insertOrderStmt = this.db.prepare(`
      INSERT INTO orders (
        id, user_id, wallet_address, product_id, principal_usdc, leverage, 
        premium_usdc, payout_usdc, duration_hours, status, payment_proof_id, 
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertOrderStmt.run(
      orderId,
      'user-id-placeholder', // 需要实际的用户ID
      normalizedWallet,
      quote.product_id,
      quote.principal_usdc,
      quote.leverage,
      quote.premium_usdc,
      quote.payout_usdc,
      24, // duration_hours，需要根据SKU确定
      status,
      input.paymentProofId,
      nowIso,
      nowIso,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // expires_at，需要根据SKU确定
    );

    // 标记报价为已消费
    const updateQuoteStmt = this.db.prepare(`
      UPDATE quotes SET consumed = 1, consumed_by_order_id = ? WHERE id = ?
    `);
    updateQuoteStmt.run(orderId, quote.id);

    // 如果有订单引用，则插入引用记录
    if (input.orderRef) {
      const insertRefStmt = this.db.prepare(`
        INSERT INTO order_references (external_ref, order_id, ref_type) VALUES (?, ?, ?)
      `);
      insertRefStmt.run(`${normalizedWallet}:${input.orderRef}`, orderId, 'payment_proof');
    }

    // 查询并返回创建的订单
    const orderStmt = this.db.prepare(`
      SELECT * FROM orders WHERE id = ?
    `);
    const orderRow = orderStmt.get(orderId) as any;
    
    return { 
      order: this.mapOrderRecord(orderRow), 
      created: true 
    };
  }

  async getOrder(orderId: string): Promise<OrderRecord | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM orders WHERE id = ?
    `);
    const row = stmt.get(orderId) as any;
    
    if (!row) return undefined;
    
    return this.mapOrderRecord(row);
  }

  async getPaymentConfig(): Promise<PaymentConfig> {
    return { ...this.payment };
  }

  async listOrders(): Promise<OrderRecord[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM orders ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];
    
    return rows.map(row => this.mapOrderRecord(row));
  }

  private async resolveByIdempotency(key: string): Promise<OrderRecord | undefined> {
    const stmt = this.db.prepare(`
      SELECT o.* FROM orders o
      JOIN quotes q ON o.id = q.consumed_by_order_id
      WHERE q.id = ?
    `);
    const row = stmt.get(key) as any;
    
    if (!row) return undefined;
    
    return this.mapOrderRecord(row);
  }

  private computeQuote(sku: SkuDefinition, principal: number, leverage: number) {
    const p = clamp(Number(principal ?? 0), sku.principalMin, sku.principalMax);
    const L = Number(leverage ?? sku.leverageMin);

    const baseFee = Math.min(
      sku.pricing.feeCap,
      0.05 + (L - 20) * 0.001 + (p / sku.principalMax) * 0.02
    );
    const feeRatio = clamp(baseFee, 0, sku.pricing.feeCap);

    const payoutRatioRaw = 0.25 + (L - 50) * 0.005 - (p / sku.principalMax) * 0.1;
    const payoutRatio = clamp(payoutRatioRaw, sku.pricing.payoutFloor, sku.pricing.payoutCap);

    // 转换为6位整数存储（1表示0.000001 USDC）
    const premiumUSDC6d = Math.round(p * feeRatio * 1_000_000);
    const payoutUSDC6d = Math.round(p * payoutRatio * 1_000_000);

    return {
      principal: p,
      leverage: L,
      feeRatio,
      payoutRatio,
      premiumUSDC6d,
      payoutUSDC6d
    };
  }

  /**
   * 由链上事件驱动的回填：按钱包+金额（6位整数）匹配最近 pending 订单并标记为 paid。
   * 返回是否命中。
   */
  async markPaidByWalletAndAmount(wallet: string, amount6d: number): Promise<boolean> {
    const w = wallet.toLowerCase();
    
    // 查找匹配的待支付订单
    const stmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE wallet_address = ? AND status = 'pending' AND premium_usdc = ? 
      ORDER BY created_at DESC LIMIT 1
    `);
    const target = stmt.get(w, amount6d) as any;
    
    if (!target) return false;
    
    // 更新订单状态为已支付
    const updateStmt = this.db.prepare(`
      UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = ? WHERE id = ?
    `);
    updateStmt.run(new Date().toISOString(), target.id);
    
    return true;
  }

  private mapOrderRecord(row: any): OrderRecord {
    return {
      id: row.id,
      skuId: row.product_id,
      principal: row.principal_usdc / 1_000_000,
      leverage: row.leverage,
      wallet: row.wallet_address,
      premiumUSDC6d: row.premium_usdc,
      payoutUSDC6d: row.payout_usdc,
      feeRatio: 0, // 需要从报价或其他地方获取
      payoutRatio: 0, // 需要从报价或其他地方获取
      idempotencyKey: '', // 需要从报价表关联获取
      quoteExpiresAt: row.expires_at,
      paymentMethod: 'permit2', // 默认值，需要根据业务逻辑确定
      paymentStatus: row.payment_status as 'pending' | 'paid' | 'failed',
      paymentProofId: row.payment_proof_id,
      orderRef: '', // 需要从order_references表关联获取
      exchange: '', // 需要根据业务逻辑确定
      pair: '', // 需要根据业务逻辑确定
      status: row.status as 'pending' | 'paid' | 'active' | 'expired' | 'claimed',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
