import { v4 as uuid } from 'uuid';
import { OrderRecord, OrderStatus, PaymentConfig, PaymentMethod, QuotePreview, QuotePreviewInput, SkuDefinition, CreateOrderInput } from '../types/orders.js';
import { EnvValidator } from '../utils/envValidator.js';

import { AppError, ERROR_CODES } from '../types/errors.js';

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

type QuoteStorageRecord = QuotePreview & { consumed: boolean };

// 获取经过校验的支付配置
const getValidatedPaymentConfig = (): PaymentConfig => {
  try {
    const config = EnvValidator.getPaymentConfig();
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

const DEFAULT_PAYMENT: PaymentConfig = getValidatedPaymentConfig();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default class OrderService {
  private readonly skus: Map<string, SkuDefinition>;
  private readonly payment: PaymentConfig;
  private readonly quotes = new Map<string, QuoteStorageRecord>();
  private readonly orders = new Map<string, OrderRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly orderRefIndex = new Map<string, string>();
  private readonly quoteTtlSeconds: number;

  constructor(options: OrderServiceOptions = {}) {
    this.payment = {
      ...DEFAULT_PAYMENT,
      ...options.paymentConfig
    };

    this.quoteTtlSeconds = options.quoteTtlSeconds ?? 60;
    this.skus = this.seedSkus();
  }

  listSkus(): SkuDefinition[] {
    return Array.from(this.skus.values()).filter((sku) => sku.enabled);
  }

  getSku(skuId: string): SkuDefinition | undefined {
    return this.skus.get(skuId);
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

    const quotation = this.computeQuote(sku, input.principal, input.leverage);
    const idempotencyKey = `ipm_${uuid()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.quoteTtlSeconds * 1000);

    const record: QuoteStorageRecord = {
      idempotencyKey,
      skuId: input.skuId,
      principal: quotation.principal,
      leverage: quotation.leverage,
      feeRatio: quotation.feeRatio,
      payoutRatio: quotation.payoutRatio,
      premiumUSDC: quotation.premiumUSDC,
      payoutUSDC: quotation.payoutUSDC,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      wallet: input.wallet.toLowerCase(),
      consumed: false
    };

    this.quotes.set(idempotencyKey, record);

    return record;
  }

  createOrder(input: CreateOrderInput): { order: OrderRecord; created: boolean } {
    const existingOrder = this.resolveByIdempotency(input.idempotencyKey);
    if (existingOrder) {
      return { order: existingOrder, created: false };
    }

    const quote = this.quotes.get(input.idempotencyKey);
    if (!quote) {
      throw new OrderError('QUOTE_NOT_FOUND', 'Quote not found or already consumed.');
    }

    if (quote.consumed) {
      const reused = this.resolveByIdempotency(input.idempotencyKey);
      if (reused) {
        return { order: reused, created: false };
      }
      throw new OrderError('QUOTE_ALREADY_USED', 'Quote already consumed.');
    }

    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      throw new OrderError('QUOTE_STALE', 'Quote expired, please refresh.');
    }

    if (input.skuId !== quote.skuId) {
      throw new OrderError('INVALID_SKU', 'Quote does not match order SKU.');
    }

    if (Number(input.principal.toFixed(2)) !== Number(quote.principal.toFixed(2))) {
      throw new OrderError('PRINCIPAL_MISMATCH', 'Principal mismatch.');
    }

    if (Number(input.leverage) !== Number(quote.leverage)) {
      throw new OrderError('LEVERAGE_MISMATCH', 'Leverage mismatch.');
    }

    const normalizedWallet = input.wallet.toLowerCase();
    if (normalizedWallet !== quote.wallet) {
      throw new OrderError('WALLET_MISMATCH', 'Wallet mismatch.');
    }

    const paymentMethod = input.paymentMethod;
    if (!this.payment.methods.includes(paymentMethod)) {
      throw new OrderError('UNSUPPORTED_PAYMENT_METHOD', 'Payment method is not supported.');
    }

    const premiumRounded = Number(input.premiumUSDC.toFixed(2));
    if (premiumRounded !== Number(quote.premiumUSDC.toFixed(2))) {
      throw new OrderError('PREMIUM_MISMATCH', 'Premium does not match quoted amount.');
    }

    if (input.orderRef) {
      const key = `${normalizedWallet}:${input.orderRef}`;
      const orderId = this.orderRefIndex.get(key);
      if (orderId) {
        const found = this.orders.get(orderId);
        if (found) {
          return { order: found, created: false };
        }
      }
    }

    const nowIso = new Date().toISOString();
    const orderId = `ord_${uuid()}`;
    
    // PaymentProof机制：不再信任paymentTx，实现状态机流转
    const paymentStatus: 'pending' | 'paid' = input.paymentProofId ? 'paid' : 'pending';
    const status: OrderStatus = input.paymentProofId ? 'paid' : 'pending';

    const order: OrderRecord = {
      id: orderId,
      skuId: quote.skuId,
      principal: quote.principal,
      leverage: quote.leverage,
      wallet: normalizedWallet,
      premiumUSDC: quote.premiumUSDC,
      payoutUSDC: quote.payoutUSDC,
      feeRatio: quote.feeRatio,
      payoutRatio: quote.payoutRatio,
      idempotencyKey: quote.idempotencyKey,
      quoteExpiresAt: quote.expiresAt,
      paymentMethod,
      paymentTx: undefined, // 不再存储paymentTx，使用paymentProof机制
      paymentStatus,
      paymentProofId: input.paymentProofId,
      orderRef: input.orderRef,
      exchange: input.exchange,
      pair: input.pair,
      status,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.orders.set(orderId, order);
    this.idempotencyIndex.set(quote.idempotencyKey, orderId);
    quote.consumed = true;

    if (input.orderRef) {
      const key = `${normalizedWallet}:${input.orderRef}`;
      this.orderRefIndex.set(key, orderId);
    }

    return { order, created: true };
  }

  getOrder(orderId: string): OrderRecord | undefined {
    return this.orders.get(orderId);
  }

  getPaymentConfig(): PaymentConfig {
    return { ...this.payment };
  }

  listOrders(): OrderRecord[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private resolveByIdempotency(key: string): OrderRecord | undefined {
    const orderId = this.idempotencyIndex.get(key);
    return orderId ? this.orders.get(orderId) : undefined;
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

    const premiumUSDC = Number((p * feeRatio).toFixed(2));
    const payoutUSDC = Number((p * payoutRatio).toFixed(2));

    return {
      principal: p,
      leverage: L,
      feeRatio,
      payoutRatio,
      premiumUSDC,
      payoutUSDC
    };
  }

  private seedSkus(): Map<string, SkuDefinition> {
    const skus: SkuDefinition[] = [
      {
        id: 'sku_24h_liq',
        code: 'SKU_24H_FIXED',
        title: '24h 爆仓保',
        description: '24 小时杠杆账户爆仓保障，Base 主网 USDC 直付。',
        enabled: true,
        windowHours: 24,
        leverageMin: 10,
        leverageMax: 100,
        principalMin: 50,
        principalMax: 500,
        payoutCapUsd: 250,
        pricing: {
          feeCap: 0.15,
          payoutFloor: 0.1,
          payoutCap: 0.5,
          quoteTtlSeconds: this.quoteTtlSeconds
        }
      }
    ];

    return new Map(skus.map((sku) => [sku.id, sku]));
  }
}
