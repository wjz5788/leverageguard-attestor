import type { StatusState } from './status';

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
  status: StatusState;
  createdAt: string;
  updatedAt: string;
}
