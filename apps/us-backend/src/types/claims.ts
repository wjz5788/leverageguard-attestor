// 赔付和索赔相关类型定义
export type ClaimStatus = 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type ClaimType = 'liquidation' | 'technical' | 'dispute' | 'other';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ClaimRecord {
  id: string;
  orderId: string;
  userId: string;
  walletAddress: string;
  claimType: ClaimType;
  status: ClaimStatus;
  amountUSDC: number;
  description: string;
  evidenceFiles: string[];
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  payoutTxHash?: string;
  payoutStatus?: PayoutStatus;
  payoutAmountUSDC?: number;
  payoutAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClaimRequest {
  orderId: string;
  claimType: ClaimType;
  amountUSDC: number;
  description: string;
  evidenceFiles: string[];
}

export interface UpdateClaimRequest {
  status?: ClaimStatus;
  reviewNotes?: string;
  payoutTxHash?: string;
  payoutStatus?: PayoutStatus;
  payoutAmountUSDC?: number;
}

export interface ClaimResponse {
  ok: boolean;
  claim: ClaimRecord;
}

export interface ClaimsListResponse {
  ok: boolean;
  claims: ClaimRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PayoutRecord {
  id: string;
  claimId: string;
  amountUSDC: number;
  status: PayoutStatus;
  txHash?: string;
  recipientWallet: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePayoutRequest {
  claimId: string;
  amountUSDC: number;
  recipientWallet: string;
}

export interface PayoutResponse {
  ok: boolean;
  payout: PayoutRecord;
}

export interface PayoutsListResponse {
  ok: boolean;
  payouts: PayoutRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// 赔付统计
export interface ClaimsStats {
  totalClaims: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims: number;
  totalPayoutAmount: number;
  averageProcessingTime: number;
}

export interface ClaimsStatsResponse {
  ok: boolean;
  stats: ClaimsStats;
}