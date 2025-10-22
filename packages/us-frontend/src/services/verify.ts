import type { ExchangeId, TradingPairId } from '../config/verification';
import { apiRequest, JP_API_BASE, US_API_BASE } from './apiClient';
import { getAuthState } from './auth';

export interface SkuOption {
  code: string;
  label: string;
  description?: string;
  premium?: number;
  payout?: number;
  exchange?: string;
  raw?: unknown;
}

export interface VerificationRequest {
  exchange: ExchangeId;
  pairId: TradingPairId;
  orderId: string;
  wallet: string;
  skuCode: string;
  env: string;
  principal: number;
  leverage: number;
  refCode?: string;
}

export interface VerificationResponse {
  status: string;
  exchange?: string;
  pair?: string;
  orderRef?: string;
  eligible?: boolean;
  parsed?: {
    side?: string;
    avgPx?: string;
    qty?: string;
    liqPx?: string;
    [key: string]: unknown;
  };
  quote?: {
    premium?: number;
    payoutCap?: number;
    currency?: string;
  };
  evidenceHint?: string;
  diag?: unknown[];
  refCode?: string;
  env?: string;
}

type RawSku =
  | {
      id?: string;
      code?: string;
      skuCode?: string;
      label?: string;
      title?: string;
      name?: string;
      description?: string;
      detail?: string;
      premium?: number;
      payout?: number;
      exchange?: string;
      [key: string]: unknown;
    }
  | string;

function normaliseSkuLabel(raw: RawSku): SkuOption {
  if (typeof raw === 'string') {
    return {
      code: raw,
      label: raw,
    };
  }

  const code = String(raw.skuCode ?? raw.code ?? raw.id ?? '').trim();
  const labelSource = raw.label ?? raw.title ?? raw.name ?? raw.description ?? raw.detail ?? code;
  const label = String(labelSource ?? 'SKU').trim() || code || 'SKU';

  const description = raw.description ?? raw.detail;
  const premium =
    typeof raw.premium === 'number' ? Number(raw.premium) : undefined;
  const payout =
    typeof raw.payout === 'number' ? Number(raw.payout) : undefined;
  const exchange =
    typeof raw.exchange === 'string' && raw.exchange ? String(raw.exchange) : undefined;

  return {
    code: code || label,
    label,
    description: typeof description === 'string' ? description : undefined,
    premium,
    payout,
    exchange,
    raw,
  };
}

export async function fetchSkus(): Promise<SkuOption[]> {
  const response = await apiRequest<unknown>('/catalog/skus');

  if (Array.isArray(response)) {
    return response.map(normaliseSkuLabel).filter((item) => Boolean(item.code));
  }

  if (response && typeof response === 'object') {
    const maybeSkus = (response as { skus?: RawSku[] }).skus;
    if (Array.isArray(maybeSkus)) {
      return maybeSkus.map(normaliseSkuLabel).filter((item) => Boolean(item.code));
    }
  }

  return [
    {
      code: 'DAY_24H_FIXED',
      label: 'DAY_24H_FIXED',
      raw: response,
    },
  ];
}

function mapExchangeId(exchange: ExchangeId): string {
  switch (exchange) {
    case 'OKX':
      return 'okx';
    case 'Binance':
      return 'binance';
    default:
      return exchange.toLowerCase();
  }
}

interface RawVerificationResponse {
  status?: string;
  exchange?: string;
  pair?: string;
  orderRef?: string;
  diagnostics?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function submitVerification(
  request: VerificationRequest
): Promise<VerificationResponse> {
  const auth = getAuthState();
  const payload: Record<string, unknown> = {
    exchange: mapExchangeId(request.exchange),
    pair: request.pairId,
    orderRef: request.orderId,
    wallet: request.wallet,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const raw = await apiRequest<RawVerificationResponse>(`${JP_API_BASE}/verify/order`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const status = raw.status ?? 'ok';
  const exchange = raw.exchange ?? mapExchangeId(request.exchange);
  const pair = raw.pair ?? request.pairId;
  const orderRef = raw.orderRef ?? request.orderId;
  const diagnostics = raw.diagnostics ? [raw.diagnostics] : undefined;

  const parsed: VerificationResponse['parsed'] = {
    exchange,
    pair,
    orderRef,
  };

  if (raw.diagnostics && typeof raw.diagnostics === 'object') {
    const detail = raw.diagnostics as Record<string, unknown>;
    const { side, avgPx, qty, liqPx } = detail;
    if (typeof side === 'string') parsed.side = side;
    if (avgPx !== undefined) parsed.avgPx = String(avgPx);
    if (qty !== undefined) parsed.qty = String(qty);
    if (liqPx !== undefined) parsed.liqPx = String(liqPx);
  }

  return {
    status,
    exchange,
    pair,
    orderRef,
    eligible: status !== 'fail',
    parsed,
    diag: diagnostics,
    evidenceHint:
      typeof raw.diagnostics === 'object' && raw.diagnostics && 'message' in raw.diagnostics
        ? String((raw.diagnostics as { message?: unknown }).message ?? '')
        : undefined,
    refCode: request.refCode,
    env: request.env,
  };
}

export interface CreateOrderRequest {
  skuId: string;
  exchange: string;
  pair: string;
  orderRef: string;
  wallet: string;
  premium: number;
  payout: number;
  paymentMethod: string;
}

export interface OrderRecord {
  orderId: number;
  status: string;
  createdAt: string;
}

export interface CreateOrderOptions {
  idempotencyKey?: string;
}

export function createOrder(
  payload: CreateOrderRequest,
  options: CreateOrderOptions = {}
): Promise<OrderRecord> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  return apiRequest<OrderRecord>(`${US_API_BASE}/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export interface CreateClaimRequest {
  orderId: number;
  wallet: string;
  evidenceHash: string;
  reason: string;
}

export interface ClaimRecord {
  claimId: number;
  status: string;
  createdAt: string;
}

export interface CreateClaimOptions {
  idempotencyKey?: string;
}

export function createClaim(
  payload: CreateClaimRequest,
  options: CreateClaimOptions = {}
): Promise<ClaimRecord> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  return apiRequest<ClaimRecord>(`${US_API_BASE}/claim`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}
