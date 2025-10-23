import { apiRequest, US_API_BASE } from './apiClient';

export interface OrderVerificationRequest {
  orderRef: string;
  wallet: string;
  exchange: string;
  pair: string;
}

export interface OrderVerificationResponse {
  isValid: boolean;
  orderRef: string;
  wallet: string;
  exchange: string;
  pair: string;
  orderDetails?: {
    status: string;
    side: string;
    quantity: number;
    price: number;
    leverage: number;
    collateral: number;
    liquidationPrice: number;
    timestamp: string;
  };
  errorMessage?: string;
  evidenceHint?: string;
  timestamp: string;
}

export interface ClaimVerificationRequest {
  claimId: string;
  orderRef: string;
  wallet: string;
}

export interface ClaimVerificationResponse {
  isValid: boolean;
  claimId: string;
  orderRef: string;
  wallet: string;
  claimStatus: string;
  payoutAmount?: number;
  payoutCurrency?: string;
  payoutStatus?: string;
  errorMessage?: string;
  timestamp: string;
}

/**
 * 验证订单是否存在且符合理赔条件
 */
export async function verifyOrder(request: OrderVerificationRequest): Promise<OrderVerificationResponse> {
  try {
    const response = await apiRequest<OrderVerificationResponse>(`${US_API_BASE}/verify/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return response;
  } catch (error) {
    console.error('Error verifying order:', error);
    
    // 返回默认的错误响应
    return {
      isValid: false,
      orderRef: request.orderRef,
      wallet: request.wallet,
      exchange: request.exchange,
      pair: request.pair,
      errorMessage: error instanceof Error ? error.message : '订单验证失败',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 验证理赔状态和赔付信息
 */
export async function verifyClaim(request: ClaimVerificationRequest): Promise<ClaimVerificationResponse> {
  try {
    const response = await apiRequest<ClaimVerificationResponse>(`${US_API_BASE}/verify/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return response;
  } catch (error) {
    console.error('Error verifying claim:', error);
    
    // 返回默认的错误响应
    return {
      isValid: false,
      claimId: request.claimId,
      orderRef: request.orderRef,
      wallet: request.wallet,
      claimStatus: 'unknown',
      errorMessage: error instanceof Error ? error.message : '理赔验证失败',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 查询理赔状态
 */
export async function getClaimStatus(claimId: string): Promise<ClaimVerificationResponse> {
  try {
    const response = await apiRequest<ClaimVerificationResponse>(`${US_API_BASE}/claims/${claimId}/status`);
    return response;
  } catch (error) {
    console.error('Error getting claim status:', error);
    
    return {
      isValid: false,
      claimId,
      orderRef: '',
      wallet: '',
      claimStatus: 'error',
      errorMessage: error instanceof Error ? error.message : '获取理赔状态失败',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 模拟订单验证（用于开发环境）
 */
export async function mockVerifyOrder(request: OrderVerificationRequest): Promise<OrderVerificationResponse> {
  // 模拟API调用延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 简单的验证逻辑：订单号以"TEST"开头则验证通过
  const isValid = request.orderRef.startsWith('TEST');
  
  return {
    isValid,
    orderRef: request.orderRef,
    wallet: request.wallet,
    exchange: request.exchange,
    pair: request.pair,
    orderDetails: isValid ? {
      status: 'filled',
      side: 'buy',
      quantity: 0.1,
      price: 45000,
      leverage: 10,
      collateral: 4500,
      liquidationPrice: 40500,
      timestamp: new Date().toISOString(),
    } : undefined,
    errorMessage: isValid ? undefined : '订单不存在或不符合理赔条件',
    evidenceHint: isValid ? '请提供爆仓截图作为证据' : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 模拟理赔验证（用于开发环境）
 */
export async function mockVerifyClaim(request: ClaimVerificationRequest): Promise<ClaimVerificationResponse> {
  // 模拟API调用延迟
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // 简单的验证逻辑：理赔号以"CLM"开头则验证通过
  const isValid = request.claimId.startsWith('CLM');
  
  return {
    isValid,
    claimId: request.claimId,
    orderRef: request.orderRef,
    wallet: request.wallet,
    claimStatus: isValid ? 'approved' : 'rejected',
    payoutAmount: isValid ? 450 : undefined,
    payoutCurrency: 'USDC',
    payoutStatus: isValid ? 'pending' : undefined,
    errorMessage: isValid ? undefined : '理赔不存在或已被拒绝',
    timestamp: new Date().toISOString(),
  };
}