import { API_BASE_URL } from '../config';
import type { Sku } from './catalog';

export interface OrderPayload {
  skuId: string;
  exchange: string;
  pair: string; // e.g., 'BTCUSDT'
  orderRef: string; // A client-generated reference
  wallet: string; // The user's wallet address
  premium: number;
  payout: number;
  paymentMethod: 'wallet' | 'card'; // Example payment method
}

export interface OrderResponse {
  orderId: string;
  status: string;
  createdAt: string;
}

export async function createOrder(payload: OrderPayload): Promise<OrderResponse> {
  const idempotencyKey = crypto.randomUUID();

  const response = await fetch(`${API_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) // Gracefully handle non-json error bodies
    console.error('Failed to create order:', errorBody);
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody.message ?? 'Unknown error'}`);
  }

  const data = await response.json();
  return data as OrderResponse;
}
