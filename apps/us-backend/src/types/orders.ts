export type PaymentMethod = 'permit2' | 'approve_transfer';

export interface SkuPricingFormula {
  /** Maximum fee ratio (eg. 0.15 for 15%). */
  feeCap: number;
  /** Minimum payout ratio (eg. 0.1 for 10%). */
  payoutFloor: number;
  /** Maximum payout ratio (eg. 0.5 for 50%). */
  payoutCap: number;
  /** Quote validity window in seconds. */
  quoteTtlSeconds: number;
}

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
  pricing: SkuPricingFormula;
}

export interface QuotePreviewInput {
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
}

export interface QuotePreview {
  idempotencyKey: string;
  skuId: string;
  principal: number;
  leverage: number;
  feeRatio: number;
  payoutRatio: number;
  premiumUSDC6d: number;  // 6位整数存储，1表示0.000001 USDC
  payoutUSDC6d: number;  // 6位整数存储，1表示0.000001 USDC
  createdAt: string;
  expiresAt: string;
  wallet: string;
}

export interface CreateOrderInput {
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
  premiumUSDC6d: number;  // 6位整数存储，1表示0.000001 USDC
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  paymentProofId?: string;
  orderRef?: string;
  exchange?: string;
  pair?: string;
}

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled';
export type PaymentStatus = 'pending' | 'awaiting_payment' | 'paid' | 'failed';

export interface PaymentProof {
  id: string;
  orderId: string;
  chainId: string;
  token: string;
  fromAddr: string;
  toAddr: string;
  amountMinUnit: string;
  amountUSDC6d: number;  // 6位整数存储，1表示0.000001 USDC
  txHash: string;
  blockNumber?: string;
  status: PaymentStatus;
  createdAt: string;
  confirmedAt?: string;
}

export interface OrderRecord {
  id: string;
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
  premiumUSDC6d: number;  // 6位整数存储，1表示0.000001 USDC
  payoutUSDC6d: number;   // 6位整数存储，1表示0.000001 USDC
  feeRatio: number;
  payoutRatio: number;
  idempotencyKey: string;
  quoteExpiresAt: string;
  paymentMethod: PaymentMethod;
  paymentTx?: string;
  paymentStatus: PaymentStatus;
  paymentProofId?: string;
  orderRef?: string;
  exchange?: string;
  pair?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfig {
  usdcContract: string;
  spenderOrVault: string;
  chainId: string;
  methods: PaymentMethod[];
}

export interface OrderPreviewResponse {
  ok: boolean;
  quote: {
    idempotencyKey: string;
    premiumUSDC6d: string;  // 6位整数字符串
    feeRatio: string;
    payoutUSDC6d: string;  // 6位整数字符串
    payoutRatio: string;
    quoteTtl: number;
    expiresAt: string;
    payment: PaymentConfig;
  };
  sku: SkuDefinition;
}

export interface CreateOrderResponse {
  ok: boolean;
  order: {
    id: string;
    status: OrderStatus;
    premiumUSDC6d: string;  // 6位整数字符串
    feeRatio: string;
    payoutUSDC6d: string;  // 6位整数字符串
    payoutRatio: string;
    skuId: string;
    wallet: string;
    paymentMethod: PaymentMethod;
    paymentTx?: string;
    createdAt: string;
    payment: PaymentConfig;
  };
}
