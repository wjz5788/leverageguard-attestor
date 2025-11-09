// 全局 Authorization 注入与未认证阻断
// 轻量级：在应用启动时调用 installAuthFetch() 即可

type FetchInput = RequestInfo | URL;

function isBusinessApi(url: string): boolean {
  // 业务接口前缀（相对路径），含 /api 与 /api/v1
  if (!url.startsWith('/')) return false; // 仅拦截同源相对请求
  const lower = url.toLowerCase();
  // 白名单：健康检查与认证
  const whitelist = [
    '/healthz',
    '/api/v1/health',
    '/api/v1/auth',
  ];
  if (whitelist.some((p) => lower === p || lower.startsWith(p + '/'))) return false;
  // 其他 /api 开头的一律视为业务接口
  return lower.startsWith('/api');
}

function getAuthHeader(): string | null {
  try {
    const jwt =
      localStorage.getItem('liqpass.jwt') ||
      localStorage.getItem('liqpass.token') ||
      localStorage.getItem('auth.token');
    if (jwt && jwt.trim()) return `Bearer ${jwt.trim()}`;

    const apiKey =
      localStorage.getItem('liqpass.apiKey') ||
      localStorage.getItem('liqpass.readKey') ||
      localStorage.getItem('x-api-key');
    if (apiKey && apiKey.trim()) return `LiqPass-Api-Key ${apiKey.trim()}`;
  } catch {}
  return null;
}

export function installAuthFetch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : (input as Request).url;
    const isBiz = typeof url === 'string' && isBusinessApi(url);

    // 开发模式轻量日志
    const dev = (import.meta as any)?.env?.DEV || (process as any)?.env?.NODE_ENV !== 'production';

    if (isBiz) {
      const auth = getAuthHeader();
      if (!auth) {
        if (dev) console.warn('[authFetch] block unauthenticated request:', url);
        // 阻断外发：返回 401 响应
        return new Response(
          JSON.stringify({ error: 'UNAUTHORIZED', message: '请先登录后再访问' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 注入 Authorization 头
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', auth);
      if (dev) console.debug('[authFetch] injected Authorization for:', url);

      const nextInit: RequestInit = {
        ...init,
        headers,
      };
      const resp = await originalFetch(input, nextInit);

      if (resp.status === 401 || resp.status === 403) {
        if (dev) console.warn('[authFetch] auth rejected:', resp.status, url);
      }
      return resp;
    }

    // 非业务请求，直接透传
    return originalFetch(input as any, init);
  }) as any;
}

export default installAuthFetch;

