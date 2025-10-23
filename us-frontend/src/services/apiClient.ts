export interface ApiErrorPayload {
  status: number;
  message: string;
  body?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = payload.status;
    this.body = payload.body;
  }
}

const DEFAULT_US_BASE = '/api/verify';
const DEFAULT_JP_BASE = 'http://127.0.0.1:8787';
const configuredEnv =
  (typeof import.meta !== 'undefined' && (import.meta as Record<string, unknown>)?.env
    ? (import.meta as { env: Record<string, string | undefined> }).env
    : undefined) ?? {};

export const US_API_BASE = (configuredEnv.VITE_US_BACKEND_BASE ?? DEFAULT_US_BASE).replace(/\/+$/, '');
export const JP_API_BASE = (configuredEnv.VITE_JP_VERIFY_BASE ?? DEFAULT_JP_BASE).replace(/\/+$/, '');

export interface ApiRequestOptions extends RequestInit {
  parseJson?: boolean;
}

function resolvePath(path: string): string {
  if (!path) {
    return US_API_BASE;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${US_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readResponseBody(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { parseJson = true, headers, ...rest } = options;
  const url = resolvePath(path);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    const message =
      (typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : response.statusText) || 'Request failed';
    throw new ApiError({
      status: response.status,
      message,
      body,
    });
  }

  if (!parseJson) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  return (text ? (text as unknown as T) : (undefined as T)) ?? (undefined as T);
}
