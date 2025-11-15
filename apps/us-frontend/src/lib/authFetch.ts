import { getAuthToken } from './auth';

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const urlStr = typeof input === 'string' ? input : input.toString();
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const resp = await window.fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
  return resp;
}

export async function authFetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const resp = await authFetch(input, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`authFetchJson failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

export default function installAuthFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return original(input, { ...init, headers, credentials: init.credentials ?? 'include' });
  };
}
