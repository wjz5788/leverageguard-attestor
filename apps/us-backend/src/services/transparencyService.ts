import OrderService from './orderService.js';
import ClaimsService from './claimsService.js';
import PaymentProofService from './paymentProofService.js';
import { EnvValidator } from '../utils/envValidator.js';
import { ClaimRecord } from '../types/claims.js';
import { PaymentProof } from '../types/orders.js';

type RangeOption = '7d' | '30d' | 'all';
type IntervalOption = '1d';

interface DateWindow {
  start: Date;
  end: Date;
}

interface TimeSeriesPoint {
  date: string;
  premium: number;
  paid: number;
  policies: number;
  claims: number;
}

interface DistributionBucket {
  label: string;
  count: number;
  premium: number;
}

interface TransparencyOverview {
  range: RangeOption;
  policiesSold: number;
  premiumUSDC: number;
  paidUSDC: number;
  lossRatio: number;
  activePolicies: number;
  treasuryBalance: number;
  requiredReserve?: number;
}

interface TransparencyAudit {
  contracts: { name?: string; address: string; chainId?: number }[];
  docHash?: string | null;
  evidenceRoots?: { label: string; merkleRoot: string }[];
}

export default class TransparencyService {
  private readonly orderService: OrderService;
  private readonly claimsService: ClaimsService;
  private readonly paymentProofService: PaymentProofService;

  constructor(orderService: OrderService, claimsService: ClaimsService, paymentProofService: PaymentProofService) {
    this.orderService = orderService;
    this.claimsService = claimsService;
    this.paymentProofService = paymentProofService;
  }

  getOverview(range: RangeOption): TransparencyOverview {
    const window = this.resolveWindow(range);
    const orders = this.orderService.listOrders();
    const claims = this.listAllClaims();

    const ordersInRange = orders.filter((order) => this.withinWindow(order.createdAt, window));
    const paidClaimsInRange = claims.filter((claim) =>
      claim.status === 'paid' && this.withinWindow(claim.payoutAt || claim.updatedAt || claim.createdAt, window)
    );

    const premiumSum6d = ordersInRange.reduce((sum, order) => sum + order.premiumUSDC6d, 0);
    const paidSum6d = paidClaimsInRange.reduce((sum, claim) => sum + this.toUSDC6d(claim.payoutAmountUSDC ?? claim.amountUSDC), 0);

    const activeOrders = orders.filter((order) => order.status === 'pending' || order.status === 'paid');
    const requiredReserve6d = activeOrders.reduce((sum, order) => sum + order.payoutUSDC6d, 0);

    const treasuryBaseline = this.parseNumber(process.env.TREASURY_BASELINE_USDC, 0);
    const totalPremium6d = orders.reduce((sum, order) => sum + order.premiumUSDC6d, 0);
    const totalPayout = claims
      .filter((claim) => claim.status === 'paid')
      .reduce((sum, claim) => sum + (claim.payoutAmountUSDC ?? claim.amountUSDC ?? 0), 0);

    const treasuryBalance = Number((treasuryBaseline + this.fromUSDC6d(totalPremium6d) - totalPayout).toFixed(2));

    return {
      range,
      policiesSold: ordersInRange.length,
      premiumUSDC: this.fromUSDC6d(premiumSum6d),
      paidUSDC: Number((paidSum6d / 1_000_000).toFixed(2)),
      lossRatio: premiumSum6d === 0 ? 0 : Number((paidSum6d / premiumSum6d).toFixed(4)),
      activePolicies: activeOrders.length,
      treasuryBalance,
      requiredReserve: requiredReserve6d > 0 ? this.fromUSDC6d(requiredReserve6d) : undefined,
    };
  }

  getTimeSeries(range: RangeOption, interval: IntervalOption): TimeSeriesPoint[] {
    if (interval !== '1d') {
      throw new Error('Only 1d interval is supported.');
    }

    const window = this.resolveWindow(range);
    const orders = this.orderService.listOrders();
    const claims = this.listAllClaims();

    const buckets = this.buildDateBuckets(window);

    const seriesMap = new Map<string, TimeSeriesPoint>(
      buckets.map((date) => [date, { date, premium: 0, paid: 0, policies: 0, claims: 0 }])
    );

    orders.forEach((order) => {
      if (!this.withinWindow(order.createdAt, window)) return;
      const key = this.toDateKey(order.createdAt);
      const target = seriesMap.get(key);
      if (!target) return;
      target.premium += this.fromUSDC6d(order.premiumUSDC6d);
      target.policies += 1;
    });

    claims.forEach((claim) => {
      const createdKey = this.toDateKey(claim.createdAt);
      const createdBucket = seriesMap.get(createdKey);
      if (createdBucket && this.withinWindow(claim.createdAt, window)) {
        createdBucket.claims += 1;
      }

      if (claim.status !== 'paid') return;
      const paidTime = claim.payoutAt || claim.updatedAt || claim.createdAt;
      if (!this.withinWindow(paidTime, window)) return;
      const target = seriesMap.get(this.toDateKey(paidTime));
      if (!target) return;
      target.paid += Number((claim.payoutAmountUSDC ?? claim.amountUSDC ?? 0).toFixed(2));
    });

    return Array.from(seriesMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  getDistribution(range: RangeOption): { buckets: DistributionBucket[] } {
    const window = this.resolveWindow(range);
    const orders = this.orderService.listOrders().filter((order) => this.withinWindow(order.createdAt, window));

    const bucketDefs: DistributionBucket[] = [
      { label: '≤100', count: 0, premium: 0 },
      { label: '101–200', count: 0, premium: 0 },
      { label: '201–300', count: 0, premium: 0 },
      { label: '>300', count: 0, premium: 0 },
    ];

    orders.forEach((order) => {
      const principal = order.principal;
      const amount = this.fromUSDC6d(order.premiumUSDC6d);

      if (principal <= 100) {
        bucketDefs[0].count += 1;
        bucketDefs[0].premium += amount;
      } else if (principal <= 200) {
        bucketDefs[1].count += 1;
        bucketDefs[1].premium += amount;
      } else if (principal <= 300) {
        bucketDefs[2].count += 1;
        bucketDefs[2].premium += amount;
      } else {
        bucketDefs[3].count += 1;
        bucketDefs[3].premium += amount;
      }
    });

    bucketDefs.forEach((bucket) => {
      bucket.premium = Number(bucket.premium.toFixed(2));
    });

    return { buckets: bucketDefs };
  }

  getEvents(limit: number): any[] {
    const orders = this.orderService.listOrders();
    const claims = this.listAllClaims();
    const proofs = this.paymentProofService.listProofs();

    const proofIndex = new Map<string, PaymentProof>();
    proofs.forEach((proof) => {
      proofIndex.set(proof.orderId, proof);
    });

    const events: any[] = [];

    orders.forEach((order) => {
      const proof = proofIndex.get(order.id);
      events.push({
        ts_utc: order.createdAt,
        type: 'purchase',
        amount_usdc: this.fromUSDC6d(order.premiumUSDC6d),
        order_digest: order.id,
        tx_hash: proof?.txHash ?? null,
      });
    });

    proofs
      .filter((proof) => proof.status === 'paid')
      .forEach((proof) => {
        events.push({
          ts_utc: proof.confirmedAt ?? proof.createdAt,
          type: 'reserve_topup',
          amount_usdc: this.fromUSDC6d(proof.amountUSDC6d),
          order_digest: proof.orderId,
          tx_hash: proof.txHash,
        });
      });

    claims
      .filter((claim) => claim.status === 'paid')
      .forEach((claim) => {
        events.push({
          ts_utc: claim.payoutAt || claim.updatedAt || claim.createdAt,
          type: 'claim_paid',
          amount_usdc: Number((claim.payoutAmountUSDC ?? claim.amountUSDC ?? 0).toFixed(2)),
          order_digest: claim.orderId,
          tx_hash: claim.payoutTxHash ?? null,
        });
      });

    const sorted = events
      .filter((event) => event.ts_utc)
      .sort((a, b) => new Date(b.ts_utc).getTime() - new Date(a.ts_utc).getTime());

    return sorted.slice(0, Math.max(0, limit || 0));
  }

  getAudit(): TransparencyAudit {
    const contracts: TransparencyAudit['contracts'] = [];

    try {
      const paymentConfig = EnvValidator.getPaymentConfig();
      if (paymentConfig.vaultAddress) {
        contracts.push({ name: 'TreasuryVault', address: paymentConfig.vaultAddress, chainId: Number(paymentConfig.chainId) });
      }
      if (paymentConfig.usdcAddress) {
        contracts.push({ name: 'USDC', address: paymentConfig.usdcAddress, chainId: Number(paymentConfig.chainId) });
      }
    } catch {
      // ignore env validation errors at runtime, audit info will be partial
    }

    const checkoutAddress = (process.env.CHECKOUT_USDC_ADDRESS || '').trim();
    if (checkoutAddress) {
      contracts.unshift({ name: 'CheckoutUSDC', address: checkoutAddress, chainId: this.parseNumber(process.env.PAYMENT_CHAIN_ID, 0) });
    }

    let evidenceRoots: TransparencyAudit['evidenceRoots'];
    const rootsRaw = process.env.TRANSPARENCY_EVIDENCE_ROOTS;
    if (rootsRaw) {
      try {
        const parsed = JSON.parse(rootsRaw);
        if (Array.isArray(parsed)) {
          evidenceRoots = parsed
            .filter((item) => item && typeof item === 'object' && 'label' in item && 'merkleRoot' in item)
            .map((item) => ({ label: String(item.label), merkleRoot: String(item.merkleRoot) }));
        }
      } catch {
        // ignore parse errors
      }
    }

    return {
      contracts,
      docHash: process.env.TRANSPARENCY_DOC_HASH || null,
      evidenceRoots,
    };
  }

  private resolveWindow(range: RangeOption): DateWindow {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);

    if (range === 'all') {
      return { start: new Date(0), end };
    }

    const days = range === '7d' ? 7 : 30;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  }

  private withinWindow(timestamp: string | undefined, window: DateWindow): boolean {
    if (!timestamp) return false;
    const value = new Date(timestamp).getTime();
    return value >= window.start.getTime() && value <= window.end.getTime();
  }

  private toDateKey(timestamp: string): string {
    const date = new Date(timestamp);
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private buildDateBuckets(window: DateWindow): string[] {
    const buckets: string[] = [];
    const cursor = new Date(window.start);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor.getTime() <= window.end.getTime()) {
      buckets.push(this.toDateKey(cursor.toISOString()));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return buckets;
  }

  private listAllClaims(): ClaimRecord[] {
    const claims: ClaimRecord[] = [];
    const pageSize = 500;
    let page = 1;

    while (true) {
      const { claims: batch, total } = this.claimsService.getAllClaims(page, pageSize);
      claims.push(...batch);
      if (claims.length >= total || batch.length < pageSize) {
        break;
      }
      page += 1;
    }

    return claims;
  }

  private fromUSDC6d(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Number((value / 1_000_000).toFixed(2));
  }

  private toUSDC6d(value: number | null | undefined): number {
    if (!Number.isFinite(value || 0)) return 0;
    return Math.round((value || 0) * 1_000_000);
  }

  private parseNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
