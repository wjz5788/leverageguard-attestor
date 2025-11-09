// 交易所适配器基础接口和工具函数
import { OrderEcho, VerifyResult, Caps, arithmeticOk } from '../types/index.js';
// 便于其他适配器从此入口获取类型
export type { VerifyResult } from '../types/index.js';

// 交易所适配器接口
export interface ExchangeAdapter {
  name: string;
  verifyAccount(params: VerifyParams): Promise<VerifyResult>;
  getSupportedCaps(): Caps;
}

// 验证参数
export interface VerifyParams {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  environment: 'live' | 'testnet';
  orderRef: string;
  pair: string;
  extra?: Record<string, any>;
}

// 原始交易所API响应类型（示例）
export interface RawOrder {
  orderId?: string;
  symbol?: string;
  instId?: string;
  side?: string;
  type?: string;
  status?: string;
  executedQty?: string | number;
  avgPrice?: string | number;
  quoteAmount?: string | number;
  orderTime?: string | number;
  exchangeTime?: string | number;
  cTime?: string | number;
  uTime?: string | number;
  state?: string;
  fillSz?: string | number;
  fillPx?: string | number;
  // 各交易所特定的可选字段（为兼容当前适配器实现）
  coin?: string;           // hyperliquid
  sz?: string | number;    // hyperliquid
  px?: string | number;    // hyperliquid
  time?: number;           // hyperliquid/binance
  updateTime?: number;     // binance
  price?: string | number; // binance
  ordId?: string | number; // okx
  ordType?: string;        // okx
}

// 工具函数
export function toStr(n: any): string {
  if (n === null || n === undefined) return '0';
  const num = Number(n);
  return isNaN(num) ? '0' : num.toFixed(8);
}

export function sum(arr: number[]): number {
  return arr.reduce((acc, val) => acc + val, 0);
}

export function avg(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function parseTime(timeStr: string | number): Date {
  if (typeof timeStr === 'number') {
    return new Date(timeStr);
  }
  // 尝试解析ISO格式或时间戳
  const date = new Date(timeStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

// 状态映射函数
export function mapOrderStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'canceled': 'CANCELED',
    'partially_filled': 'PARTIALLY_FILLED', 
    'filled': 'FILLED',
    'new': 'NEW',
    'open': 'OPEN',
    'closed': 'CLOSED',
    'cancelled': 'CANCELED'
  };
  return statusMap[status.toLowerCase()] || status?.toUpperCase() || 'UNKNOWN';
}

// 基础验证结果构建器
export function buildBaseVerifyResult(
  status: VerifyResult['status'],
  account: VerifyResult['account'],
  caps: Caps,
  sessionId: string
): VerifyResult {
  return {
    status,
    caps,
    account,
    verifiedAt: new Date().toISOString(),
    sessionId
  };
}

// 错误结果构建器
export function buildErrorResult(
  reasons: string[],
  account: VerifyResult['account'],
  sessionId: string
): VerifyResult {
  return {
    status: 'failed',
    caps: { orders: false, fills: false, positions: false, liquidations: false },
    account,
    reasons,
    verifiedAt: new Date().toISOString(),
    sessionId
  };
}
