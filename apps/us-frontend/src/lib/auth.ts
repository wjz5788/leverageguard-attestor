import { useEffect, useState } from 'react';
import { connectAndEnsureBase } from './payPolicy';

const AUTH_TOKEN_KEY = 'lp_auth_token';
const AUTH_ADDRESS_KEY = 'lp_auth_address';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_ADDRESS_KEY);
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_ADDRESS_KEY);
}

type WalletNonceResponse = {
  message: string;
  nonce: string;
  expiresAt: string;
};

type WalletVerifyResponse = {
  token?: string;
  session?: { id: string; issuedAt: string; expiresAt: string; loginType: string };
  profile?: any;
};

async function requestWalletNonce(walletAddress: string): Promise<WalletNonceResponse> {
  console.log('[requestWalletNonce] address =', walletAddress);
  const resp = await fetch('/api/v1/auth/wallet/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
    credentials: 'include',
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`nonce failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as WalletNonceResponse;
  if (!data.message || !data.nonce) {
    throw new Error('nonce response invalid');
  }
  console.log('[requestWalletNonce] got nonce', data.nonce);
  return data;
}

async function verifyWalletLogin(payload: { walletAddress: string; signature: string; nonce: string }): Promise<WalletVerifyResponse> {
  const resp = await fetch('/api/v1/auth/wallet/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`login failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as WalletVerifyResponse;
}

export async function loginWithWallet(): Promise<{ address: string; token: string }> {
  console.log('[loginWithWallet] start');
  const { signer, address } = await connectAndEnsureBase();
  console.log('[loginWithWallet] got address', address);
  const { message, nonce } = await requestWalletNonce(address);
  const signature = await signer.signMessage(message);
  const verifyResp = await verifyWalletLogin({ walletAddress: address, signature, nonce });
  const token = verifyResp.token;
  if (!token) {
    throw new Error('login success but no token');
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.setItem(AUTH_ADDRESS_KEY, address);
  }
  return { address, token };
}

export function logoutWallet() {
  clearAuth();
}

export function useAuth() {
  const [address, setAddress] = useState<string | null>(() => getAuthAddress());
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  useEffect(() => {
    const handler = () => {
      setAddress(getAuthAddress());
      setToken(getAuthToken());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
      }
    };
  }, []);

  return {
    address,
    token,
    isLoggedIn: !!token,
  };
}
