/**
 * 认证增强的 fetch 封装
 * 支持开发/生产双模路由，DEV 用代理，PROD 用 VITE_API_URL
 */

// 工厂函数：创建带认证逻辑的 fetch
export const createAuthFetch = (baseUrl = '') => {
  // 开发模式检测
  const isDev = import.meta.env.DEV;
  
  // 获取认证头
  const getAuthHeader = (): string | null => {
    try {
      const jwt = localStorage.getItem('liqpass.jwt') || 
                 localStorage.getItem('liqpass.token') || 
                 localStorage.getItem('auth.token');
      
      if (jwt?.trim()) return `Bearer ${jwt.trim()}`;

      const apiKey = localStorage.getItem('liqpass.apiKey') || 
                    localStorage.getItem('liqpass.readKey') || 
                    localStorage.getItem('x-api-key');
      
      if (apiKey?.trim()) return `LiqPass-Api-Key ${apiKey.trim()}`;
    } catch {}
    return null;
  };

  // 判断是否为业务 API
  const isBusinessApi = (url: string): boolean => {
    if (!url.startsWith('/')) return false;
    const lower = url.toLowerCase();
    
    // 白名单：健康检查与认证
    const whitelist = ['/healthz', '/api/v1/health', '/api/v1/auth'];
    if (whitelist.some(p => lower === p || lower.startsWith(p + '/'))) return false;
    
    return lower.startsWith('/api');
  };

  // 生成 requestId
  const generateRequestId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  return async (endpoint: string, options?: RequestInit) => {
    const requestId = generateRequestId();
    
    // 构建完整 URL
    const fullUrl = baseUrl + endpoint;
    
    if (isDev) {
      console.log(`[authFetch] ${requestId} → ${fullUrl}`);
    }

    // 业务 API 需要认证
    if (isBusinessApi(endpoint)) {
      const auth = getAuthHeader();
      if (!auth) {
        const error = {
          error: 'UNAUTHORIZED',
          message: '请先登录后再访问',
          requestId
        };
        
        if (isDev) {
          console.warn(`[authFetch] ${requestId} 未认证请求被阻断:`, endpoint);
        }
        
        return new Response(JSON.stringify(error), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 注入认证头
      const headers = new Headers(options?.headers);
      headers.set('Authorization', auth);
      headers.set('X-Request-ID', requestId);
      
      if (isDev) {
        console.debug(`[authFetch] ${requestId} 注入认证头`);
      }

      try {
        const response = await fetch(fullUrl, {
          ...options,
          headers,
        });

        if (response.status === 401 || response.status === 403) {
          if (isDev) {
            console.warn(`[authFetch] ${requestId} 认证失败:`, response.status);
          }
        }

        return response;
      } catch (error) {
        if (isDev) {
          console.error(`[authFetch] ${requestId} 请求失败:`, error);
        }
        throw error;
      }
    }

    // 非业务请求，直接透传
    return fetch(fullUrl, options);
  };
};

// 创建默认实例
// DEV: 使用代理（baseUrl 为空）
// PROD: 使用 VITE_API_URL
const baseUrl = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');
export const authFetch = createAuthFetch(baseUrl);

// 兼容旧版 installAuthFetch
export const installAuthFetch = () => {
  if (typeof window === 'undefined') return;
  
  const originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : 
               input instanceof URL ? input.pathname + input.search : 
               (input as Request).url;
    
    // 使用 authFetch 处理
    const response = await authFetch(url, init);
    return response;
  };
};

export default installAuthFetch;

