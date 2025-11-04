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
  premiumUSDC: number;
  payoutUSDC: number;
  createdAt: string;
  expiresAt: string;
  wallet: string;
}

export interface CreateOrderInput {
  skuId: string;
  principal: number;
  leverage: number;
  wallet: string;
  premiumUSDC: number;
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
  amountUsdc: number;
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
  premiumUSDC: number;
  payoutUSDC: number;
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
    premiumUSDC: string;
    feeRatio: string;
    payoutUSDC: string;
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
    premiumUSDC: string;
    feeRatio: string;
    payoutUSDC: string;
    payoutRatio: string;
    skuId: string;
    wallet: string;
    paymentMethod: PaymentMethod;
    paymentTx?: string;
    createdAt: string;
    payment: PaymentConfig;
  };
}
