/**
 * LiqPass API Service Layer
 * 统一的API服务层，提供错误处理、认证、重试等功能
 */

import { getEnv } from '../env.ts';

// API响应类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// API错误类型
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 请求配置接口
interface RequestConfig extends RequestInit {
  retries?: number;
  timeout?: number;
  requireAuth?: boolean;
}

// 默认配置
const DEFAULT_CONFIG: RequestConfig = {
  retries: 3,
  timeout: 30000,
  requireAuth: true,
  headers: {
    'Content-Type': 'application/json',
  },
};

// 获取认证token
function getAuthToken(): string | null {
  // 从localStorage获取JWT token或API key
  const token = localStorage.getItem('jwt_token');
  const apiKey = localStorage.getItem('api_key');
  return token || apiKey;
}

// 创建请求头
function createHeaders(config: RequestConfig): Headers {
  const headers = new Headers(config.headers || {});
  
  // 添加认证头
  if (config.requireAuth) {
    const token = getAuthToken();
    if (token) {
      // 根据token格式决定使用Bearer还是API Key
      if (token.includes('.')) {
        // JWT token格式
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        // API Key格式
        headers.set('X-API-Key', token);
      }
    }
  }
  
  return headers;
}

// 带超时的fetch包装器
async function fetchWithTimeout(
  url: string,
  config: RequestConfig,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...config,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请稍后重试');
    }
    throw error;
  }
}

// 重试逻辑
async function fetchWithRetry(
  url: string,
  config: RequestConfig,
  attempt = 1
): Promise<Response> {
  try {
    const response = await fetchWithTimeout(url, config, config.timeout || 30000);
    
    // 处理认证错误
    if (response.status === 401) {
      // 清除过期的token
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('api_key');
      
      // 如果是业务请求，抛出认证错误
      if (config.requireAuth) {
        throw new ApiError('认证已过期，请重新登录', 401, response);
      }
    }
    
    // 处理服务器错误
    if (response.status >= 500 && attempt < (config.retries || 3)) {
      // 指数退避重试
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, config, attempt + 1);
    }
    
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // 网络错误重试
    if (attempt < (config.retries || 3)) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, config, attempt + 1);
    }
    
    throw new ApiError('网络连接失败，请检查网络设置');
  }
}

// 主API服务类
class ApiService {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = getEnv().VITE_API_BASE_URL;
  }
  
  // GET请求
  async get<T = any>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }
  
  // POST请求
  async post<T = any>(endpoint: string, data?: any, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  // PUT请求
  async put<T = any>(endpoint: string, data?: any, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  
  // DELETE请求
  async delete<T = any>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }
  
  // 通用请求方法
  private async request<T>(endpoint: string, config: RequestConfig): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    // 创建请求头
    finalConfig.headers = createHeaders(finalConfig);
    
    try {
      const response = await fetchWithRetry(url, finalConfig);
      
      // 处理空响应
      if (response.status === 204) {
        return {} as T;
      }
      
      // 解析响应数据
      const data = await response.json().catch(() => null);
      
      // 检查响应状态
      if (!response.ok) {
        const errorMessage = data?.error || data?.message || `HTTP ${response.status}`;
        throw new ApiError(errorMessage, response.status, response);
      }
      
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      // 处理JSON解析错误
      if (error instanceof SyntaxError) {
        throw new ApiError('服务器返回数据格式错误');
      }
      
      throw new ApiError('请求处理失败，请稍后重试');
    }
  }
  
  // 文件上传
  async uploadFile<T = any>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, any>,
    config: RequestConfig = {}
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (additionalData) {
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });
    }
    
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: formData,
      headers: {
        // 不要设置Content-Type，让浏览器自动设置
      },
    });
  }
  
  // 批量请求
  async batch<T = any>(requests: Array<() => Promise<any>>): Promise<T[]> {
    try {
      return await Promise.all(requests.map(req => req()));
    } catch (error) {
      throw new ApiError('批量请求失败');
    }
  }
  
  // 设置认证token
  setAuthToken(token: string, type: 'jwt' | 'api_key' = 'jwt'): void {
    if (type === 'jwt') {
      localStorage.setItem('jwt_token', token);
      localStorage.removeItem('api_key');
    } else {
      localStorage.setItem('api_key', token);
      localStorage.removeItem('jwt_token');
    }
  }
  
  // 清除认证
  clearAuth(): void {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('api_key');
  }
  
  // 检查是否已认证
  isAuthenticated(): boolean {
    return !!(localStorage.getItem('jwt_token') || localStorage.getItem('api_key'));
  }
}

// 创建API服务实例
export const api = new ApiService();

// 便捷的错误处理函数
export function handleApiError(error: unknown, showToast?: (message: string) => void): string {
  let message = '操作失败，请稍后重试';
  
  if (error instanceof ApiError) {
    message = error.message;
    
    // 特殊处理认证错误
    if (error.statusCode === 401) {
      message = '登录已过期，请重新登录';
      // 可以在这里触发重新登录流程
    }
  } else if (error instanceof Error) {
    message = error.message;
  }
  
  if (showToast) {
    showToast(message);
  }
  
  return message;
}

// 安全的API调用包装器
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  errorHandler?: (error: unknown) => void
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    if (errorHandler) {
      errorHandler(error);
    }
    return null;
  }
}

export default api;