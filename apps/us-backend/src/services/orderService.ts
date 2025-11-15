import { v4 as uuid } from 'uuid';
import { OrderServiceDb } from './orderServiceDb.js';
import { OrderRecord, OrderStatus, PaymentConfig, PaymentMethod, QuotePreview, QuotePreviewInput, SkuDefinition, CreateOrderInput } from '../types/orders.js';
import { EnvValidator } from '../utils/envValidator.js';

import { AppError } from '../types/errors.js';

export class OrderError extends AppError {
  constructor(code: string, message: string, httpStatus: number = 400) {
    super(code as any, message, httpStatus, 'medium');
    this.name = 'OrderError';
  }
}

export interface OrderServiceOptions {
  paymentConfig?: Partial<PaymentConfig>;
  quoteTtlSeconds?: number;
}


// 获取经过校验的支付配置
const buildValidatedPaymentConfig = (): PaymentConfig => {
  try {
    let config = EnvValidator.getPaymentConfig();

    // 如果当前配置缺失关键字段，尝试触发一次校验来回填兼容键
    if (!config.usdcAddress || !config.vaultAddress || !config.chainId) {
      EnvValidator.validatePaymentConfig();
      config = EnvValidator.getPaymentConfig();
    }

    if (!config.usdcAddress || !config.vaultAddress || !config.chainId) {
      throw new Error('payment config is incomplete');
    }

    return {
      usdcContract: config.usdcAddress,
      spenderOrVault: config.vaultAddress,
      chainId: config.chainId,
      methods: ['permit2', 'approve_transfer']
    };
  } catch (error) {
    throw new OrderError('PAYMENT_CONFIG_INVALID', '支付配置校验失败，请检查环境变量');
  }
};

let defaultPaymentCache: PaymentConfig | null = null;

const getDefaultPaymentConfig = (): PaymentConfig => {
  if (!defaultPaymentCache) {
    defaultPaymentCache = buildValidatedPaymentConfig();
  }
  return defaultPaymentCache;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default class OrderService {
  private readonly payment: PaymentConfig;
  private readonly quoteTtlSeconds: number;
  private readonly dbService: OrderServiceDb;

  constructor(options: OrderServiceOptions = {}) {
    this.payment = {
      ...getDefaultPaymentConfig(),
      ...options.paymentConfig
    };

    this.quoteTtlSeconds = options.quoteTtlSeconds ?? 60;

    this.dbService = new OrderServiceDb({ payment: { methods: this.payment.methods }, quoteTtlSeconds: this.quoteTtlSeconds });
  }

  listSkus(): SkuDefinition[] {
    const list = this.dbService.listSkus() as unknown as SkuDefinition[];
    return list.filter((sku) => sku.enabled);
  }

  getSku(skuId: string): SkuDefinition | undefined {
    const sku = this.dbService.getSku(skuId) as unknown as SkuDefinition | undefined;
    return sku;
  }

  preview(input: QuotePreviewInput): QuotePreview {
    const sku = this.getSku(input.skuId);
    if (!sku || !sku.enabled) {
      throw new OrderError('SKU_DISABLED', 'The requested SKU is not available.');
    }

    if (!Number.isFinite(input.principal)) {
      throw new OrderError('INVALID_PRINCIPAL', 'Principal must be a finite number.');
    }

    if (!Number.isFinite(input.leverage)) {
      throw new OrderError('INVALID_LEVERAGE', 'Leverage must be a finite number.');
    }

    if (input.principal < sku.principalMin || input.principal > sku.principalMax) {
      throw new OrderError('PRINCIPAL_OUT_OF_RANGE', 'Principal is outside supported range.');
    }

    if (input.leverage < sku.leverageMin || input.leverage > sku.leverageMax) {
      throw new OrderError('LEVERAGE_OUT_OF_RANGE', 'Leverage is outside supported range.');
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(input.wallet)) {
      throw new OrderError('INVALID_WALLET', 'Wallet must be a valid EVM address.');
    }

    const r = this.computeQuote(sku, input.principal, input.leverage);
    const q = this.dbService.preview(input.skuId, r.principal, r.leverage) as any;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.quoteTtlSeconds * 1000);
    return {
      idempotencyKey: q.id,
      skuId: input.skuId,
      principal: r.principal,
      leverage: r.leverage,
      feeRatio: r.feeRatio,
      payoutRatio: r.payoutRatio,
      premiumUSDC6d: r.premiumUSDC6d,
      payoutUSDC6d: r.payoutUSDC6d,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      wallet: input.wallet.toLowerCase()
    };
  }

  createOrder(input: CreateOrderInput): { order: OrderRecord; created: boolean } {
    const result = this.dbService.createOrder({
      skuId: input.skuId,
      principal: input.principal,
      leverage: input.leverage,
      wallet: input.wallet,
      paymentMethod: input.paymentMethod,
      idempotencyKey: input.idempotencyKey,
      premiumUSDC6d: input.premiumUSDC6d,
      paymentProofId: input.paymentProofId,
      orderRef: input.orderRef,
      exchange: String(input.exchange || ''),
      pair: String(input.pair || '')
    } as any) as any;
    const order = result.order as any;
    const created = result.created as boolean;
    const mapped: OrderRecord = {
      id: order.id,
      skuId: order.skuId,
      principal: order.principal,
      leverage: order.leverage,
      wallet: order.wallet,
      premiumUSDC6d: order.premiumUSDC6d,
      payoutUSDC6d: order.payoutUSDC6d,
      feeRatio: order.feeRatio ?? 0,
      payoutRatio: order.payoutRatio ?? 0,
      idempotencyKey: input.idempotencyKey,
      quoteExpiresAt: order.quoteExpiresAt ?? '',
      paymentMethod: order.paymentMethod as PaymentMethod,
      paymentTx: order.paymentTx,
      paymentStatus: order.paymentStatus as any,
      paymentProofId: order.paymentProofId,
      orderRef: order.orderRef,
      exchange: order.exchange,
      pair: order.pair,
      status: order.status as OrderStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
    return { order: mapped, created };
  }

  getOrder(orderId: string): OrderRecord | undefined {
    const o = this.dbService.getOrder(orderId) as any;
    if (!o) return undefined;
    const tx = this.dbService.getLatestPaymentHash(orderId);
    const mapped: OrderRecord = {
      id: o.id,
      skuId: o.skuId,
      principal: o.principal,
      leverage: o.leverage,
      wallet: o.wallet,
      premiumUSDC6d: o.premiumUSDC6d,
      payoutUSDC6d: o.payoutUSDC6d,
      feeRatio: o.feeRatio ?? 0,
      payoutRatio: o.payoutRatio ?? 0,
      idempotencyKey: o.idempotencyKey ?? '',
      quoteExpiresAt: o.quoteExpiresAt ?? '',
      paymentMethod: o.paymentMethod as PaymentMethod,
      paymentTx: tx ?? o.paymentTx,
      paymentStatus: o.paymentStatus as any,
      paymentProofId: o.paymentProofId,
      orderRef: o.orderRef,
      exchange: o.exchange,
      pair: o.pair,
      status: o.status as OrderStatus,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    };
    return mapped;
  }

  getPaymentConfig(): PaymentConfig {
    return { ...this.payment };
  }

  async listOrdersPersisted(): Promise<OrderRecord[]> {
    const list = this.dbService.listOrders() as any[];
    return list.map((o) => ({
      id: o.id,
      skuId: o.skuId,
      principal: o.principal,
      leverage: o.leverage,
      wallet: o.wallet,
      premiumUSDC6d: o.premiumUSDC6d,
      payoutUSDC6d: o.payoutUSDC6d,
      feeRatio: o.feeRatio ?? 0,
      payoutRatio: o.payoutRatio ?? 0,
      idempotencyKey: o.idempotencyKey ?? '',
      quoteExpiresAt: o.quoteExpiresAt ?? '',
      paymentMethod: o.paymentMethod as PaymentMethod,
      paymentTx: this.dbService.getLatestPaymentHash(o.id) ?? o.paymentTx,
      paymentStatus: o.paymentStatus as any,
      paymentProofId: o.paymentProofId,
      orderRef: o.orderRef,
      exchange: o.exchange,
      pair: o.pair,
      status: o.status as OrderStatus,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
   * 由链上事件驱动的回填：按钱包+金额（6位整型）匹配最近 pending 订单并标记为 paid。
   * 返回是否命中。
   */
  markPaidByWalletAndAmount(wallet: string, amount6d: number): boolean {
    const ok = this.dbService.markPaidByWalletAndAmount(wallet, amount6d) as any;
    return Boolean(ok);
  }
}
