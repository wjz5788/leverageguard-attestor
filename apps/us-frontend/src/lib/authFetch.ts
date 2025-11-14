import { getAuthToken } from './auth';

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise\u003cResponse\u003e {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const urlStr = typeof input === 'string' ? input : input.toString();
  console.log('[authFetch]', id, '→', urlStr);

  const token = getAuthToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    console.warn('[authFetch]', id, '当前无 auth token，将以匿名方式请求:', urlStr);
  }

  const resp = await window.fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (resp.status === 401) {
    console.warn('[authFetch]', id, '后端返回 401:', urlStr);
  }

  return resp;
}

/**
 * 常用：直接拿 json
 */
export async function authFetchJson\u003cT\u003e(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise\u003cT\u003e {
  const resp = await authFetch(input, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() =\u003e '');
    throw new Error(`authFetchJson failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}
