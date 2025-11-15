/**
 * API调用Hook，集成加载状态管理
 * 提供简洁的API调用方式，自动处理加载状态和错误
 */

import { useState, useCallback, useRef } from 'react';
import { useLoading } from '../contexts/LoadingContext.tsx';
import { api, ApiError, safeApiCall } from '../services/api.ts';
import { useToast } from '../contexts/ToastContext.tsx';

// API Hook配置接口
interface UseApiOptions {
  showLoading?: boolean;
  loadingMessage?: string;
  showErrorToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
  autoHandleError?: boolean;
  retryCount?: number;
}

// API Hook返回接口
interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: any[]) => Promise<T | null>;
  reset: () => void;
}

/**
 * API调用Hook
 * @param apiCall - API调用函数
 * @param options - 配置选项
 * @returns API调用状态和函数
 */
export function useApi<T = any>(
  apiCall: (...args: any[]) => Promise<T>,
  options: UseApiOptions = {}
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingIdRef = useRef<string | null>(null);
  
  const { showLoading, hideLoading } = useLoading();
  const { push: showToast } = useToast();

  const {
    showLoading: shouldShowLoading = true,
    loadingMessage = '处理中...',
    showErrorToast = true,
    successMessage,
    errorMessage,
    autoHandleError = true,
    retryCount = 0
  } = options;

  const execute = useCallback(async (...args: any[]): Promise<T | null> => {
    try {
      // 重置状态
      setError(null);
      setLoading(true);

      // 显示加载状态
      if (shouldShowLoading) {
        loadingIdRef.current = showLoading({
          message: loadingMessage,
          type: 'spinner'
        });
      }

      // 执行API调用
      const result = await apiCall(...args);
      
      // 设置数据
      setData(result);
      
      // 显示成功消息
      if (successMessage) {
        showToast({ title: successMessage, type: 'success' });
      }
      
      return result;
    } catch (error) {
      // 处理错误
      const errorMsg = error instanceof ApiError 
        ? error.message 
        : errorMessage || '操作失败，请稍后重试';
      
      setError(errorMsg);
      
      // 显示错误提示
      if (showErrorToast) {
        showToast({ title: errorMsg, type: 'error' });
      }
      
      // 自动错误处理
      if (autoHandleError && error instanceof ApiError) {
        // 认证错误处理
        if (error.statusCode === 401) {
          // 可以在这里触发重新登录
          console.warn('认证失败，需要重新登录');
        }
      }
      
      return null;
    } finally {
      // 隐藏加载状态
      if (shouldShowLoading && loadingIdRef.current) {
        hideLoading(loadingIdRef.current);
        loadingIdRef.current = null;
      }
      setLoading(false);
    }
  }, [
    apiCall,
    shouldShowLoading,
    loadingMessage,
    showErrorToast,
    successMessage,
    errorMessage,
    autoHandleError,
    showLoading,
    hideLoading,
    showToast
  ]);

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
    if (loadingIdRef.current) {
      hideLoading(loadingIdRef.current);
      loadingIdRef.current = null;
    }
  }, [hideLoading]);

  return {
    data,
    loading,
    error,
    execute,
    reset
  };
}

// 便捷Hook：GET请求
export function useGetApi<T = any>(
  endpoint: string,
  options: UseApiOptions = {}
) {
  const apiCall = useCallback(async () => {
    return api.get<T>(endpoint);
  }, [endpoint]);

  return useApi<T>(apiCall, {
    showLoading: true,
    loadingMessage: '加载中...',
    ...options
  });
}

// 便捷Hook：POST请求
export function usePostApi<T = any>(
  endpoint: string,
  options: UseApiOptions = {}
) {
  const apiCall = useCallback(async (data?: any) => {
    return api.post<T>(endpoint, data);
  }, [endpoint]);

  return useApi<T>(apiCall, {
    showLoading: true,
    loadingMessage: '提交中...',
    ...options
  });
}

// 便捷Hook：PUT请求
export function usePutApi<T = any>(
  endpoint: string,
  options: UseApiOptions = {}
) {
  const apiCall = useCallback(async (data?: any) => {
    return api.put<T>(endpoint, data);
  }, [endpoint]);

  return useApi<T>(apiCall, {
    showLoading: true,
    loadingMessage: '更新中...',
    ...options
  });
}

// 便捷Hook：DELETE请求
export function useDeleteApi<T = any>(
  endpoint: string,
  options: UseApiOptions = {}
) {
  const apiCall = useCallback(async () => {
    return api.delete<T>(endpoint);
  }, [endpoint]);

  return useApi<T>(apiCall, {
    showLoading: true,
    loadingMessage: '删除中...',
    successMessage: '删除成功',
    ...options
  });
}

// 数据获取Hook，支持自动重试和轮询
interface UseFetchOptions extends UseApiOptions {
  enabled?: boolean;
  refetchInterval?: number; // 轮询间隔（毫秒）
  refetchOnWindowFocus?: boolean;
  staleTime?: number; // 数据过期时间（毫秒）
  cacheKey?: string;
}

export function useFetch<T = any>(
  apiCall: () => Promise<T>,
  options: UseFetchOptions = {}
) {
  const {
    enabled = true,
    refetchInterval,
    refetchOnWindowFocus = true,
    staleTime = 5 * 60 * 1000, // 5分钟
    cacheKey,
    ...apiOptions
  } = options;

  const { data, loading, error, execute, reset } = useApi(apiCall, apiOptions);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);

  // 数据缓存
  const cache = useRef<Map<string, { data: T; timestamp: number }>>(new Map());

  const fetchWithCache = useCallback(async () => {
    if (!enabled) return null;

    const now = Date.now();
    const cacheKeyStr = cacheKey || apiCall.toString();

    // 检查缓存
    const cached = cache.current.get(cacheKeyStr);
    if (cached && now - cached.timestamp < staleTime) {
      return cached.data;
    }

    // 如果数据太新，不重新获取
    if (now - lastFetchRef.current < 1000) {
      return data;
    }

    const result = await execute();
    
    // 更新缓存
    if (result && cacheKey) {
      cache.current.set(cacheKeyStr, { data: result, timestamp: now });
    }
    
    lastFetchRef.current = now;
    return result;
  }, [enabled, cacheKey, staleTime, execute, data]);

  // 设置轮询
  React.useEffect(() => {
    if (!enabled || !refetchInterval) return;

    intervalRef.current = setInterval(() => {
      fetchWithCache();
    }, refetchInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, refetchInterval, fetchWithCache]);

  // 窗口聚焦时重新获取
  React.useEffect(() => {
    if (!enabled || !refetchOnWindowFocus) return;

    const handleFocus = () => {
      fetchWithCache();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [enabled, refetchOnWindowFocus, fetchWithCache]);

  // 初始获取
  React.useEffect(() => {
    if (enabled) {
      fetchWithCache();
    }
  }, [enabled, fetchWithCache]);

  return {
    data,
    loading,
    error,
    refetch: fetchWithCache,
    reset
  };
}

// 表单提交Hook
interface UseFormSubmitOptions extends UseApiOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  resetOnSuccess?: boolean;
}

export function useFormSubmit<T = any>(
  submitFn: (data: any) => Promise<T>,
  options: UseFormSubmitOptions = {}
) {
  const { onSuccess, onError, resetOnSuccess = true, ...apiOptions } = options;
  const { data, loading, error, execute, reset } = useApi(submitFn, apiOptions);

  const handleSubmit = useCallback(async (formData: any) => {
    const result = await execute(formData);
    
    if (result) {
      onSuccess?.(result);
      if (resetOnSuccess) {
        reset();
      }
    } else if (error) {
      onError?.(error);
    }
    
    return result;
  }, [execute, error, onSuccess, onError, resetOnSuccess, reset]);

  return {
    data,
    loading,
    error,
    handleSubmit,
    reset
  };
}
