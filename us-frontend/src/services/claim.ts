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

export interface ClaimStatusResponse {
  claimId: string;
  status: 'received' | 'approved' | 'paid' | 'rejected';
  orderId: string;
  wallet: string;
  evidenceHash: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  payoutAmount?: string;
  transactionHash?: string;
  errorMessage?: string;
}

export async function createClaim(payload: ClaimPayload): Promise<ClaimResponse> {
  // In a real app, the idempotency key might be managed more formally
  const idempotencyKey = crypto.randomUUID();

  try {
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

/**
 * 查询理赔状态
 */
export async function getClaimStatus(claimId: string): Promise<ClaimStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/claim/${encodeURIComponent(claimId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('Failed to get claim status:', errorBody);
      
      let errorMessage = 'Failed to get claim status';
      if (response.status === 404) {
        errorMessage = 'Claim not found';
      } else if (response.status >= 500) {
        errorMessage = 'Server error, please try again later';
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as ClaimStatusResponse;
  } catch (error) {
    let errorMessage = 'Failed to get claim status';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to backend service, please check your network connection';
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * 模拟理赔状态查询（开发环境使用）
 */
export async function mockGetClaimStatus(claimId: string): Promise<ClaimStatusResponse> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const statuses: Array<'received' | 'approved' | 'paid' | 'rejected'> = ['received', 'approved', 'paid', 'rejected'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  return {
    claimId,
    status: randomStatus,
    orderId: 'mock-order-' + Math.random().toString(36).substring(7),
    wallet: '0x' + Math.random().toString(16).substring(2, 42),
    evidenceHash: 'mock-evidence-' + Math.random().toString(36).substring(7),
    reason: 'liquidation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payoutAmount: randomStatus === 'paid' ? '1000000000' : undefined,
    transactionHash: randomStatus === 'paid' ? '0x' + Math.random().toString(16).substring(2, 66) : undefined,
    errorMessage: randomStatus === 'rejected' ? '模拟理赔被拒绝' : undefined,
  };
}
