// 订单相关类型定义

export type PolicyStatus =
  | "pending_onchain"
  | "active"
  | "expired"
  | "claimed_pending"
  | "claimed_paid"
  | "claimed_denied";

export type ChainName = "Base" | string;

export interface OrderCardData {
  id: string;
  title?: string; // 如 "24h 爆仓保"
  principal: number;
  leverage: number;
  premiumPaid: number; // USDC
  payoutMax: number; // USDC
  status: PolicyStatus | string;
  coverageStartTs: number | string; // 秒/毫秒/ISO 皆可
  coverageEndTs: number | string;   // 秒/毫秒/ISO 皆可
  createdAt: string;                // ISO
  orderRef: string;
  exchangeAccountId?: string;
  chain: ChainName;
  txHash: string;
  orderDigest: string; // 0x...
  skuId?: string;
}

export interface OrdersResponse {
  items: OrderCardData[];
  nextCursor?: string;
  total: number;
}

export interface OrderDetailData extends OrderCardData {
  // 订单详情特有字段
  exchange: string;
  pair: string;
  priceUsdc: number;
  qty: number;
  evidenceId?: string;
  claimId?: string;
  payoutAmount?: number;
  payoutStatus?: string;
}