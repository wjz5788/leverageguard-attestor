import { BASE_MAINNET } from '../config/networks';
import { WalletConnectButton } from '../components/WalletConnectButton';
import { getAuthState, hasValidToken, subscribeAuth, type AuthState } from '../services/auth';
import type { WalletSignatureResult } from '../types/wallet';
import type { SupportedLanguage } from '../utils/language';

type HomeSelectors = {
  walletSlot: HTMLElement;
  statusTargets: HTMLElement[];
  signatureTargets: HTMLElement[];
};

function queryHomeSelectors(): HomeSelectors | null {
  const walletSlot = document.querySelector<HTMLElement>('[data-wallet-slot]');
  if (!walletSlot) {
    return null;
  }

  const statusTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-wallet-status]'));
  const signatureTargets = Array.from(
    document.querySelectorAll<HTMLElement>('[data-signature-preview]')
  );

  return {
    walletSlot,
    statusTargets,
    signatureTargets,
  };
}

export function initHome() {
  const selectors = queryHomeSelectors();
  if (!selectors) {
    console.warn('Wallet mount point missing in DOM');
    return;
  }

  const { walletSlot, statusTargets, signatureTargets } = selectors;

  const shorten = (address: string): string => {
    if (address.length <= 12) {
      return address;
    }
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  const formatExpiry = (timestamp: number | undefined, lang: SupportedLanguage): string | null => {
    if (!timestamp) {
      return null;
    }
    const date = new Date(timestamp);
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
    const formatted = date.toLocaleString(locale, {
      hour12: false,
      timeZone: 'UTC',
    });
    return `${formatted} UTC`;
  };

  let connectedAddress: string | undefined;
  let authState: AuthState = getAuthState();
  let lastSignature: WalletSignatureResult | undefined;

  const renderSignatureTargets = () => {
    signatureTargets.forEach((target) => {
      const lang = (target.dataset.lang as SupportedLanguage | undefined) ?? 'en';

      if (!connectedAddress) {
        target.textContent =
          lang === 'zh' ? 'Connect wallet to enable login' : 'Connect wallet to enable login';
        return;
      }

      if (authState.status === 'authenticating') {
        target.textContent =
          lang === 'zh'
            ? `Waiting for ${shorten(connectedAddress)} to sign in MetaMask…`
            : `Awaiting MetaMask signature for ${shorten(connectedAddress)}`;
        return;
      }

      if (authState.status === 'error') {
        const message = authState.lastError ?? (lang === 'zh' ? 'Unknown error' : 'Unknown error');
        target.textContent =
          lang === 'zh' ? `Authentication failed: ${message}` : `Authentication failed: ${message}`;
        return;
      }

      if (authState.status === 'authenticated' && hasValidToken()) {
        const signaturePreview = authState.lastSignature ?? lastSignature?.signature;
        const previewText =
          signaturePreview && signaturePreview.length > 52
            ? `${signaturePreview.slice(0, 52)}…`
            : signaturePreview ?? '';

        const tokenPreview =
          authState.token && authState.token.length > 40
            ? `${authState.token.slice(0, 40)}…`
            : authState.token ?? '';

        const expiry = formatExpiry(authState.tokenExpiresAt, lang);

        if (lang === 'zh') {
          const parts = [
            `Logged in as ${shorten(connectedAddress)}`,
            tokenPreview ? `Token: ${tokenPreview}` : 'Token: Active',
          ];
          if (previewText) {
            parts.push(`Signature: ${previewText}`);
          }
          if (expiry) {
            parts.push(`Valid until: ${expiry}`);
          }
          target.textContent = parts.join('\n');
        } else {
          const parts = [
            `Authenticated as ${shorten(connectedAddress)}`,
            tokenPreview ? `Token: ${tokenPreview}` : 'Token: active',
          ];
          if (previewText) {
            parts.push(`Signature: ${previewText}`);
          }
          if (expiry) {
            parts.push(`Expires: ${expiry}`);
          }
          target.textContent = parts.join('\n');
        }
        return;
      }

      target.textContent =
        lang === 'zh'
          ? `Ready to log in as ${shorten(connectedAddress)}`
          : `Ready to sign in as ${shorten(connectedAddress)}`;
    });
  };

  const unsubscribeAuth = subscribeAuth((next) => {
    authState = next;
    renderSignatureTargets();
  });

  new WalletConnectButton({
    container: walletSlot,
    network: BASE_MAINNET,
    statusTargets,
    callbacks: {
      onConnected(address) {
        connectedAddress = address;
        renderSignatureTargets();
      },
      onDisconnected() {
        connectedAddress = undefined;
        lastSignature = undefined;
        authState = getAuthState();
        renderSignatureTargets();
      },
      onSign(result: WalletSignatureResult) {
        lastSignature = result;
        renderSignatureTargets();
      },
    },
  });

  renderSignatureTargets();

  window.addEventListener('beforeunload', () => unsubscribeAuth());
}
