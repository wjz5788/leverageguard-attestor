import { apiRequest, ApiError } from './apiClient';

type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'error';

export interface AuthState {
  status: AuthStatus;
  address?: string;
  token?: string;
  tokenExpiresAt?: number;
  lastError?: string;
  lastNonce?: string;
  lastMessage?: string;
  lastSignature?: string;
}

interface PersistedAuthState {
  address?: string;
  token?: string;
  tokenExpiresAt?: number;
}

const STORAGE_KEY = 'liqpass.auth';
const CHAIN_ID = 8453;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const listeners = new Set<(state: AuthState) => void>();

let state: AuthState = { status: 'idle' };
let pendingAuth: Promise<AuthState> | null = null;

function normalizeAddress(address?: string): string | undefined {
  return address ? address.toLowerCase() : undefined;
}

function readPersistedState(): PersistedAuthState | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        address: typeof parsed.address === 'string' ? parsed.address : undefined,
        token: typeof parsed.token === 'string' ? parsed.token : undefined,
        tokenExpiresAt:
          typeof parsed.tokenExpiresAt === 'number' ? parsed.tokenExpiresAt : undefined,
      };
    }
  } catch (error) {
    console.warn('[auth] failed to parse persisted state', error);
  }
  return null;
}

function persistState(next: AuthState) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  const payload: PersistedAuthState = {};
  if (next.address) {
    payload.address = next.address;
  }
  if (next.token && next.tokenExpiresAt && next.tokenExpiresAt > Date.now()) {
    payload.token = next.token;
    payload.tokenExpiresAt = next.tokenExpiresAt;
  }

  if (Object.keys(payload).length) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[auth] failed to persist state', error);
    }
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener({ ...state });
    } catch (error) {
      console.error('[auth] listener error', error);
    }
  });
}

function setState(partial: Partial<AuthState>): AuthState {
  state = { ...state, ...partial };
  if (state.token && state.tokenExpiresAt && state.tokenExpiresAt <= Date.now()) {
    state = {
      status: 'idle',
      address: state.address,
      lastError: 'Token expired',
    };
  }
  persistState(state);
  emit();
  return state;
}

function initialiseState() {
  const persisted = readPersistedState();
  if (!persisted) {
    return;
  }

  const now = Date.now();
  if (persisted.token && persisted.tokenExpiresAt && persisted.tokenExpiresAt > now) {
    state = {
      status: 'authenticated',
      address: persisted.address,
      token: persisted.token,
      tokenExpiresAt: persisted.tokenExpiresAt,
    };
  } else {
    state = {
      status: 'idle',
      address: persisted.address,
    };
  }
  emit();
}

initialiseState();

export function subscribeAuth(listener: (auth: AuthState) => void): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  if (state.token && state.tokenExpiresAt && state.tokenExpiresAt <= Date.now()) {
    state = {
      status: 'idle',
      address: state.address,
    };
    persistState(state);
  }
  return { ...state };
}

export function clearAuth() {
  pendingAuth = null;
  setState({
    status: 'idle',
    token: undefined,
    tokenExpiresAt: undefined,
    lastError: undefined,
    lastNonce: undefined,
    lastMessage: undefined,
    lastSignature: undefined,
    address: undefined,
  });
}

export function setConnectedAddress(address: string | undefined) {
  const normalizedNext = normalizeAddress(address);
  const normalizedCurrent = normalizeAddress(state.address);

  if (!address) {
    clearAuth();
    return;
  }

  if (
    normalizedCurrent &&
    normalizedNext &&
    normalizedCurrent !== normalizedNext &&
    state.token
  ) {
    // Wallet switched accounts; drop the existing token for safety.
    setState({
      status: 'idle',
      address,
      token: undefined,
      tokenExpiresAt: undefined,
      lastError: undefined,
      lastNonce: undefined,
      lastMessage: undefined,
      lastSignature: undefined,
    });
    return;
  }

  setState({
    address,
    status: state.token ? 'authenticated' : 'idle',
  });
}

function isoWithoutMilliseconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function requestNonce(address: string): Promise<{ nonce: string; expires_in?: number }> {
  return apiRequest<{ nonce: string; expires_in?: number }>('/auth/nonce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });
}

async function submitSignature(payload: {
  address: string;
  signature: string;
  nonce: string;
}): Promise<{ token: string; ttl?: number }> {
  return apiRequest<{ token: string; ttl?: number }>('/auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function hasValidToken(): boolean {
  return Boolean(state.token && state.tokenExpiresAt && state.tokenExpiresAt > Date.now());
}

export function requireAuthToken(): string {
  if (!hasValidToken()) {
    throw new Error('Authentication token missing or expired');
  }
  return state.token as string;
}

export async function authenticate(
  address: string,
  signer: (message: string) => Promise<string>
): Promise<AuthState> {
  if (!address) {
    throw new Error('Address is required for authentication');
  }

  if (state.status === 'authenticated' && hasValidToken()) {
    return { ...state };
  }

  if (pendingAuth) {
    return pendingAuth;
  }

  const run = async (): Promise<AuthState> => {
    setState({
      status: 'authenticating',
      address,
      lastError: undefined,
    });

    try {
      const nonceResponse = await requestNonce(address);
      const nonce = nonceResponse.nonce;
      if (!nonce) {
        throw new Error('Nonce missing from response');
      }

      const expiresInMs =
        typeof nonceResponse.expires_in === 'number'
          ? Math.min(nonceResponse.expires_in * 1000, FIVE_MINUTES_MS)
          : FIVE_MINUTES_MS;
      const expiresAt = new Date(Date.now() + expiresInMs);
      const expiresIso = isoWithoutMilliseconds(expiresAt);

      const message = [
        'LiqPass Login',
        '',
        `Wallet: ${address}`,
        `Nonce: ${nonce}`,
        `ChainId: ${CHAIN_ID}`,
        `Expires: ${expiresIso}`,
        'Purpose: authenticate for verification and claims',
      ].join('\n');

      const signature = await signer(message);
      if (!signature) {
        throw new Error('Signature was not returned by wallet');
      }

      const verifyResponse = await submitSignature({
        address,
        signature,
        nonce,
      });

      if (!verifyResponse.token) {
        throw new Error('Token missing from verification response');
      }

      const ttlSeconds =
        typeof verifyResponse.ttl === 'number' && verifyResponse.ttl > 0
          ? verifyResponse.ttl
          : 3600;
      const tokenExpiresAt = Date.now() + ttlSeconds * 1000;

      setState({
        status: 'authenticated',
        address,
        token: verifyResponse.token,
        tokenExpiresAt,
        lastNonce: nonce,
        lastMessage: message,
        lastSignature: signature,
        lastError: undefined,
      });

      return { ...state };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.message} (status ${error.status})`
          : error instanceof Error
          ? error.message
          : 'Unknown authentication error';
      setState({
        status: 'error',
        address,
        token: undefined,
        tokenExpiresAt: undefined,
        lastError: message,
        lastMessage: undefined,
        lastNonce: undefined,
        lastSignature: undefined,
      });
      throw error;
    } finally {
      pendingAuth = null;
    }
  };

  pendingAuth = run();
  return pendingAuth;
}
