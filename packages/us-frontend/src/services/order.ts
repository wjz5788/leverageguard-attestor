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

export interface OrderHistoryItem {
  id: string;
  wallet: string;
  skuId: string;
  exchange: string;
  pair: string;
  orderRef: string;
  premium: number;
  payout: number;
  status: string;
  createdAt: string;
}

export async function createOrder(payload: OrderPayload): Promise<OrderResponse> {
  const idempotencyKey = crypto.randomUUID();

  try {
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
      
      // Provide more user-friendly error messages
  let errorMessage = 'Failed to create order';
  if (response.status === 400) {
    errorMessage = 'Order information is incomplete, please check your input';
  } else if (response.status === 409) {
    errorMessage = 'Order already exists, please do not submit duplicate orders';
  } else if (response.status >= 500) {
    errorMessage = 'Server error, please try again later';
  }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as OrderResponse;
  } catch (error) {
    // Provide more user-friendly error messages
    let errorMessage = 'Failed to create order';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to backend service, please check your network connection';
      } else {
        errorMessage = 'Failed to create order, please try again later';
      }
    } else if (error.message) {
      // Provide more specific error messages based on error information
      if (error.message.includes('Invalid order data')) {
        errorMessage = 'Order information is incomplete, please check your input';
      } else if (error.message.includes('Order already exists')) {
        errorMessage = 'Order already exists, please do not submit duplicate orders';
      } else if (error.message.includes('Server error')) {
        errorMessage = 'Server error, please try again later';
      } else {
        errorMessage = error.message;
      }
    }
    
    throw new Error(errorMessage);
  }
}

export async function fetchOrderHistory(walletAddress: string): Promise<OrderHistoryItem[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/history?wallet=${walletAddress}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch order history');
    }
    
    const data = await response.json();
    return data as OrderHistoryItem[];
  } catch (error) {
    console.error('Error fetching order history:', error);
    throw new Error('Failed to load order history');
  }
}
