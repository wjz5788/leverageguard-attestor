import { API_BASE_URL } from '../config';

export interface ClaimPayload {
  orderId: string;
  wallet: string;
  evidenceHash: string; // Placeholder for evidence data
  reason?: string;
}

export interface ClaimResponse {
  claimId: string;
  status: string;
  createdAt: string;
}

export async function createClaim(payload: ClaimPayload): Promise<ClaimResponse> {
  // In a real app, the idempotency key might be managed more formally
  const idempotencyKey = crypto.randomUUID();

  const response = await fetch(`${API_BASE_URL}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    console.error('Failed to create claim:', errorBody);
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody.message ?? 'Unknown error'}`);
  }

  const data = await response.json();
  return data as ClaimResponse;
}
