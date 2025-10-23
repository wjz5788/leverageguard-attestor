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

  try {
    const response = await fetch(`${API_BASE_URL}/api/claim`, {
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
      
      // Provide more user-friendly error messages
  let errorMessage = 'Failed to submit claim';
  if (response.status === 400) {
    errorMessage = 'Claim information is incomplete, please check your input';
  } else if (response.status === 404) {
    errorMessage = 'Order not found';
  } else if (response.status === 409) {
    errorMessage = 'Claim already exists, please do not submit duplicate claims';
  } else if (response.status >= 500) {
    errorMessage = 'Server error, please try again later';
  }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as ClaimResponse;
  } catch (error) {
    // Provide more user-friendly error messages
    let errorMessage = 'Failed to submit claim';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to backend service, please check your network connection';
      } else {
        errorMessage = 'Failed to submit claim, please try again later';
      }
    } else if (error.message) {
      // Provide more specific error messages based on error information
      if (error.message.includes('Invalid claim data')) {
        errorMessage = 'Claim information is incomplete, please check your input';
      } else if (error.message.includes('Order not found')) {
        errorMessage = 'Order not found';
      } else if (error.message.includes('Claim already exists')) {
        errorMessage = 'Claim already exists, please do not submit duplicate claims';
      } else if (error.message.includes('Server error')) {
        errorMessage = 'Server error, please try again later';
      } else {
        errorMessage = error.message;
      }
    }
    
    throw new Error(errorMessage);
  }
}
