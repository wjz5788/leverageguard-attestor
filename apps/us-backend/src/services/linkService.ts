import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { PaymentLink, PaymentLinkStatus } from '../models/paymentLink.js';

export const PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = ['pending', 'paid', 'expired'] as const;

export const CreateLinkSchema = z.object({
  product: z.string().min(1, '产品不能为空'),
  symbol: z.string().min(1, '交易对不能为空'),
  amount: z.coerce.number().positive('金额必须大于0'),
  duration: z.coerce.number().int().positive('时长必须为正整数'),
  userId: z.string().optional(),
  orderId: z.string().optional()
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

export class LinkService {
  private links: Map<string, PaymentLink> = new Map();

  async createLink(input: CreateLinkInput): Promise<PaymentLink> {
    const data = CreateLinkSchema.parse(input);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.duration * 3600 * 1000);

    const link: PaymentLink = {
      id: uuidv4(),
      userId: data.userId ?? 'anonymous',
      product: data.product,
      symbol: data.symbol,
      amount: Number(data.amount),
      duration: Number(data.duration),
      url: this.buildPaymentUrl(data.product, data.symbol, Number(data.amount), Number(data.duration)),
      status: 'pending',
      orderId: data.orderId ?? null,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.links.set(link.id, link);
    return link;
  }

  // 匹配前端 buildLink 逻辑，确保展示一致
  private buildPaymentUrl(product: string, symbol: string, amount: number, duration: number): string {
    const normalizedAmount = Number(amount.toFixed(2));
    const safeProduct = encodeURIComponent(product);
    const safeSymbol = encodeURIComponent(symbol);
    return `https://liq.pass/cover/${safeProduct}?asset=${safeSymbol}&price=${normalizedAmount}USDC&exp=${duration}h`;
  }

  async getLinkById(id: string): Promise<PaymentLink | null> {
    const link = this.links.get(id);
    if (!link) return null;
    this.maybeExpire(link);
    return this.links.get(id) ?? null;
  }

  async getLinkByOrderId(orderId: string): Promise<PaymentLink | null> {
    for (const link of this.links.values()) {
      if (link.orderId && link.orderId === orderId) {
        return this.getLinkById(link.id);
      }
    }
    return null;
  }

  async updateLinkStatus(id: string, status: PaymentLinkStatus): Promise<PaymentLink | null> {
    const link = this.links.get(id);
    if (!link) {
      return null;
    }

    link.status = status;
    link.updatedAt = new Date().toISOString();
    this.links.set(id, link);
    return link;
  }

  async getAllLinks(): Promise<PaymentLink[]> {
    const now = new Date();
    for (const link of this.links.values()) {
      if (this.shouldExpire(link, now)) {
        link.status = 'expired';
        link.updatedAt = now.toISOString();
        this.links.set(link.id, link);
      }
    }

    return Array.from(this.links.values());
  }

  async deleteLink(id: string): Promise<boolean> {
    return this.links.delete(id);
  }

  private maybeExpire(link: PaymentLink): void {
    if (this.shouldExpire(link)) {
      link.status = 'expired';
      link.updatedAt = new Date().toISOString();
      this.links.set(link.id, link);
    }
  }

  private shouldExpire(link: PaymentLink, ref: Date = new Date()): boolean {
    return link.status === 'pending' && new Date(link.expiresAt) < ref;
  }
}
