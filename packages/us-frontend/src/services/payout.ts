import { apiRequest } from './apiClient';

export interface PayoutRequest {
  claimId: string;
}

export interface PayoutResponse {
  message: string;
  claimId: string;
  recipient: string;
  amount: string;
  transactionHash: string;
}

export interface PayoutStatusRequest {
  claimId: string;
}

export interface PayoutStatusResponse {
  claimId: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  transactionHash?: string;
  amount?: string;
  recipient?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 提交赔付请求（管理员功能）
 */
export async function submitPayout(request: PayoutRequest): Promise<PayoutResponse> {
  try {
    const response = await apiRequest('/admin/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      switch (response.status) {
        case 400:
          throw new Error(errorData.message || '请求参数错误');
        case 404:
          throw new Error(errorData.message || '理赔记录不存在');
        case 409:
          throw new Error(errorData.message || '理赔状态不符合赔付条件');
        case 503:
          throw new Error(errorData.message || '赔付系统未配置或不可用');
        default:
          throw new Error(errorData.message || `赔付请求失败 (${response.status})`);
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('网络错误，请检查连接后重试');
  }
}

/**
 * 查询赔付状态
 */
export async function getPayoutStatus(request: PayoutStatusRequest): Promise<PayoutStatusResponse> {
  try {
    const response = await apiRequest(`/payout/status/${encodeURIComponent(request.claimId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      switch (response.status) {
        case 404:
          throw new Error(errorData.message || '赔付记录不存在');
        default:
          throw new Error(errorData.message || `查询赔付状态失败 (${response.status})`);
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('网络错误，请检查连接后重试');
  }
}

/**
 * 模拟赔付请求（开发环境使用）
 */
export async function mockSubmitPayout(request: PayoutRequest): Promise<PayoutResponse> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    message: '模拟赔付交易已发送',
    claimId: request.claimId,
    recipient: '0x1234567890123456789012345678901234567890',
    amount: '1000000000', // 1000 USDC (6 decimals)
    transactionHash: '0x' + Math.random().toString(16).substring(2, 66),
  };
}

/**
 * 模拟赔付状态查询（开发环境使用）
 */
export async function mockGetPayoutStatus(request: PayoutStatusRequest): Promise<PayoutStatusResponse> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const statuses: Array<'pending' | 'processing' | 'paid' | 'failed'> = ['pending', 'processing', 'paid', 'failed'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  return {
    claimId: request.claimId,
    status: randomStatus,
    transactionHash: randomStatus === 'paid' || randomStatus === 'processing' 
      ? '0x' + Math.random().toString(16).substring(2, 66) 
      : undefined,
    amount: randomStatus === 'paid' ? '1000000000' : undefined,
    recipient: randomStatus === 'paid' ? '0x1234567890123456789012345678901234567890' : undefined,
    errorMessage: randomStatus === 'failed' ? '模拟赔付失败' : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}