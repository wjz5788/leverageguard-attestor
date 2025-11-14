// apps/us-frontend/src/lib/auth.ts
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

type SiweStartResponse = {
  message: string;   // 要签名的 SIWE 文本
  nonce: string;
  chainId?: number;
};

type SiweVerifyResponse = {
  token?: string;
  accessToken?: string;
  address?: string;
};

async function startSiwe(address: string, chainId: number): Promise\u003cSiweStartResponse\u003e {
  const resp = await fetch('/api/v1/auth/siwe/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chainId }),
    credentials: 'include',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() =\u003e '');
    throw new Error(`SIWE start failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as SiweStartResponse;
  if (!data.message || !data.nonce) {
    throw new Error('SIWE start response missing message/nonce');
  }
  return data;
}

async function verifySiwe(
  address: string,
  chainId: number,
  message: string,
  nonce: string,
  signature: string,
): Promise\u003cSiweVerifyResponse\u003e {
  const resp = await fetch('/api/v1/auth/siwe/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      chainId,
      message,
      nonce,
      signature,
    }),
    credentials: 'include',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() =\u003e '');
    throw new Error(`SIWE verify failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as SiweVerifyResponse;
  return data;
}

/**
 * 主流程：连接钱包 → SIWE start → 签名 → SIWE verify → 保存 token
 */
export async function loginWithWallet(): Promise\u003c{ address: string; token: string }\u003e {
  // 1. 先确保钱包已连接并在 Base 链上
  const { signer, address } = await connectAndEnsureBase();
  const chainId = await signer.getChainId();

  // 2. 向后端要 SIWE message + nonce
  const { message, nonce } = await startSiwe(address, chainId);

  // 3. 用钱包签名
  const signature = await signer.signMessage(message);

  // 4. 把签名发到后端验证，拿 token
  const verifyResp = await verifySiwe(address, chainId, message, nonce, signature);
  const token = verifyResp.token ?? verifyResp.accessToken;

  if (!token) {
    throw new Error('SIWE verify success but no token in response');
  }

  // 5. 存在 localStorage，给 authFetch 用
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.setItem(AUTH_ADDRESS_KEY, address);
  }

  return { address, token };
}

export function logoutWallet() {
  clearAuth();
}

/**
 * 小辅助 hook：方便组件里显示“是否已登录 / 地址”
 */
export function useAuth() {
  const [address, setAddress] = useState\u003cstring | null\u003e(() =\u003e getAuthAddress());
  const [token, setToken] = useState\u003cstring | null\u003e(() =\u003e getAuthToken());

  useEffect(() =\u003e {
    const handler = () =\u003e {
      setAddress(getAuthAddress());
      setToken(getAuthToken());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
    }
    return () =\u003e {
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
