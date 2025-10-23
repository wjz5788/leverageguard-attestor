import { apiRequest, JP_API_BASE, US_API_BASE, ApiRequestOptions } from './apiClient';
import { useApiKeys } from '../contexts/ApiKeyContext';

// 扩展ApiRequestOptions以支持API密钥
export interface ApiRequestWithKeysOptions extends ApiRequestOptions {
  includeApiKeys?: boolean;
  exchange?: 'binance' | 'okx';
}

// 创建一个新的API请求函数，支持API密钥
export async function apiRequestWithKeys<T = unknown>(
  path: string,
  options: ApiRequestWithKeysOptions = {}
): Promise<T> {
  const { includeApiKeys = false, exchange, ...restOptions } = options;
  
  // 如果需要包含API密钥，则添加到请求头中
  if (includeApiKeys && exchange) {
    // 注意：在实际实现中，我们需要从上下文中获取API密钥
    // 但由于这是一个工具函数，我们无法直接访问React上下文
    // 在实际使用中，应该在调用此函数的组件中获取API密钥并传递进来
    
    // 这里我们只是展示如何构造请求头
    const headersWithKeys = {
      ...restOptions.headers,
    };
    
    // 根据交易所添加相应的API密钥头
    switch (exchange) {
      case 'binance':
        // Binance API密钥应该在请求头中添加
        // X-MBX-APIKEY: ${apiKey}
        break;
      case 'okx':
        // OKX API密钥应该在请求头中添加
        // OK-ACCESS-KEY: ${apiKey}
        // OK-ACCESS-SIGN: ${signature}
        // OK-ACCESS-TIMESTAMP: ${timestamp}
        // OK-ACCESS-PASSPHRASE: ${passphrase}
        break;
    }
    
    return apiRequest<T>(path, {
      ...restOptions,
      headers: headersWithKeys,
    });
  }
  
  // 如果不需要API密钥，直接使用原始apiRequest函数
  return apiRequest<T>(path, restOptions);
}

// 为JP API创建专门的请求函数
export async function jpApiRequestWithKeys<T = unknown>(
  path: string,
  options: ApiRequestWithKeysOptions = {}
): Promise<T> {
  // JP API的路径处理
  const fullPath = path.startsWith('http') ? path : `${JP_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  
  return apiRequestWithKeys<T>(fullPath, {
    ...options,
    includeApiKeys: options.includeApiKeys ?? true, // 默认包含API密钥
  });
}