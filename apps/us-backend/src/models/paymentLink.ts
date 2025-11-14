export type PaymentLinkStatus = 'pending' | 'paid' | 'expired';

/**
 * Represents a payment link created by a user.
 */
export interface PaymentLink {
  id: string;
  userId: string;
  product: string;
  symbol: string;
  amount: number;
  duration: number;
  url: string;
  status: PaymentLinkStatus;
  orderId?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
