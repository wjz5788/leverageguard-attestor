// LiqPass 核心类型定义
// 基于 VerifyResult v1 规范

// ============================
// 基础类型
// ============================

export type Exchange = 'OKX' | 'Binance' | 'Hyperliquid';
export type Environment = 'live' | 'testnet';
export type VerificationStatus = 'draft' | 'unverified' | 'verifying' | 'verified' | 'failed' | 'disabled' | 'deleted';

export type Caps = {
  orders: boolean;
  fills: boolean;
  positions: boolean;
  liquidations: boolean;
};

export type AccountSummary = {
  exchangeUid?: string;
  subAccount?: string;
  accountType?: string;
  sampleInstruments?: string[];
  // 扩展字段
  accountLevel?: string;
  marginMode?: string;
  leverage?: number;
  totalBalance?: string;
  availableBalance?: string;
};

export type OrderEcho = {
  orderId: string;
  pair: string;
  side?: 'BUY' | 'SELL';
  type?: 'MARKET' | 'LIMIT' | string;
  status?: 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | string;
  executedQty?: string;
  avgPrice?: string;
  quoteAmount?: string;
  orderTimeIso?: string;
  exchangeTimeIso?: string;
};

export type VerifyChecks = {
  authOk: boolean;
  capsOk: boolean;
  orderFound: boolean;
  echoLast4Ok: boolean;
  arithmeticOk: boolean;
  pairOk: boolean;
  timeSkewMs: number;
  verdict: 'pass' | 'fail';
  // 扩展检查项
  timestampConsistency?: boolean;
  signatureValid?: boolean;
  dataIntegrity?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
};

export type ProofEcho = {
  echo?: {
    firstOrderIdLast4?: string;
    firstFillQty?: string;
    firstFillTime?: string;
    // 扩展字段
    orderType?: string;
    side?: string;
    instrument?: string;
  };
  hash?: string;
};

export type LiquidationInfo = {
  status: 'none' | 'forced_liquidation' | 'adl';
  eventTimeIso?: string;
  instrument?: string;
  positionSizeBefore?: string;
  positionSizeAfter?: string;
  pnlAbs?: string;
  details?: {
    liquidationTime?: string;
    liquidationPrice?: string;
    liquidatedAmount?: string;
    remainingBalance?: string;
    liquidationType?: 'auto' | 'manual';
    marginCallLevel?: number;
  };
};

export type Evidence = {
  merkleRoot?: string;
  files?: string[];
  // 扩展证据
  apiCallLogs?: any[];
  signatureProofs?: any[];
  timestampProofs?: any[];
};

// ============================
// VerifyResult v1 核心类型
// ============================

export type VerifyResult = {
  // 基础状态信息
  status: 'verified' | 'failed' | 'pending';
  verifiedAt: string;
  sessionId: string;
  
  // 账户信息
  account: AccountSummary;
  caps: Caps;
  
  // 订单信息
  order?: OrderEcho;
  
  // 验证检查结果
  checks?: VerifyChecks;
  
  // 验证证据
  proof?: {
    echo: {
      firstOrderIdLast4?: string;
      firstFillQty?: string;
      firstFillTime?: string;
      // 扩展字段
      orderType?: string;
      side?: string;
      instrument?: string;
    };
    hash: string;
    evidence?: {
      orderSnapshot: any;
      fillSnapshots: any[];
      accountSnapshot: any;
    };
  };
  
  // 失败原因
  reasons?: string[];
  
  // 强平信息
  liquidation?: {
    status: 'none' | 'partial' | 'full';
    details?: {
      liquidationTime?: string;
      liquidationPrice?: string;
      liquidatedAmount?: string;
      remainingBalance?: string;
    };
  };
  
  // 扩展字段（用于前端展示）
  metadata?: {
    exchangeName: string;
    environment: 'live' | 'testnet';
    verificationMethod: string;
    confidenceScore?: number;
  };
};

// ============================
// 数据库实体类型
// ============================

export interface ExchangeAccount {
  id: string;
  user_id: string;
  exchange: Exchange;
  label: string;
  environment: Environment;
  status: VerificationStatus;
  last_verified_at: string | null;
  exchange_uid: string | null;
  sub_account: string | null;
  account_type: string | null;
  caps_json: string; // JSON string of Caps
  masked_api_key_last4: string | null;
  secret_ref: string | null;
  user_confirmed_echo: boolean;
  ip_whitelist: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ApiSecret {
  id: string;
  enc_api_key: Buffer;
  enc_api_secret: Buffer;
  enc_passphrase: Buffer | null;
  enc_extra_json: Buffer | null;
  version: string;
  created_at: string;
}

export interface ExchangeAccountVerification {
  id: string;
  exchange_account_id: string;
  status: string;
  caps_json: string;
  order_json: string | null;
  checks_json: string | null;
  liquidation_json: string | null;
  proof_echo_json: string | null;
  proof_hash: string | null;
  reasons_json: string | null;
  session_id: string;
  latency_ms: number | null;
  verifier_version: string;
  adapter_version: string;
  created_at: string;
}

export interface ExchangeAccountLog {
  id: string;
  exchange_account_id: string;
  level: string;
  message: string;
  raw_sample_json: string | null;
  created_at: string;
}

// ============================
// API 请求/响应类型
// ============================

export interface CreateExchangeAccountRequest {
  exchange: Exchange;
  label: string;
  environment?: Environment;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  extra?: Record<string, any>;
  ipWhitelist?: string;
}

export interface UpdateExchangeAccountRequest {
  label?: string;
  environment?: Environment;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  extra?: Record<string, any>;
  ipWhitelist?: string;
}

export interface VerifyRequest {
  // 必填：交易所、密钥与校验参数
  exchange: string; // 'okx' | 'binance' | 'hyperliquid'（大小写在服务中统一）
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  orderRef: string;
  pair: string;
  // 可选：环境/扩展/绑定账户
  environment?: Environment;
  extra?: Record<string, any>;
  exchangeAccountId?: string;
  // 扩展参数
  verificationMethod?: 'standard' | 'advanced';
  timeoutMs?: number;
  retryCount?: number;
}

// 后端统一响应：校验是否成功 + 会话 + 结果
export interface VerifyResponse {
  status: 'success' | 'failed';
  sessionId: string;
  verifiedAt: string;
  result?: VerifyResult;
  error?: string;
  // 扩展字段
  requestId?: string;
  timestamp: string;
}

export interface ConfirmEchoRequest {
  userConfirmedEcho: boolean;
}

// ============================
// 工具函数和常量
// ============================

export const PRECISION = 1e-6;
export const MAX_SKEW_MS = 60_000;

export function arithmeticOk(qty: string, px: string, quote: string): boolean {
  const q = parseFloat(qty || '0');
  const p = parseFloat(px || '0');
  const a = parseFloat(quote || '0');
  return Math.abs(q * p - a) <= PRECISION;
}

export function formatTime(date: Date): string {
  return date.toISOString();
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 默认的 Caps 配置
export const DEFAULT_CAPS: Caps = {
  orders: false,
  fills: false,
  positions: false,
  liquidations: false,
};

// 验证错误码
export const VERIFICATION_ERRORS = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  MISSING_ORDER_REF: 'MISSING_ORDER_REF',
  MISSING_PAIR: 'MISSING_PAIR',
  MISSING_SCOPE_ORDERS: 'MISSING_SCOPE:orders',
  MISSING_SCOPE_POSITIONS: 'MISSING_SCOPE:positions',
  IP_NOT_WHITELISTED: 'IP_NOT_WHITELISTED',
  TIMESTAMP_OUT_OF_RANGE: 'TIMESTAMP_OUT_OF_RANGE',
} as const;

export type VerificationError = typeof VERIFICATION_ERRORS[keyof typeof VERIFICATION_ERRORS];
