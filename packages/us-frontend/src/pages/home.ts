import { BASE_MAINNET } from '../config/networks';
import { WalletConnectButton } from '../components/WalletConnectButton';
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

  const updateSignatureTargets = (
    state: 'idle' | 'ready' | 'signed',
    context?: { address?: string; signature?: string }
  ) => {
    signatureTargets.forEach((target) => {
      const lang = (target.dataset.lang as SupportedLanguage | undefined) ?? 'en';
      let text = '';

      if (state === 'idle') {
        text = lang === 'zh' ? '连接钱包以启用登录' : 'Connect wallet to enable login';
      } else if (state === 'ready' && context?.address) {
        text =
          lang === 'zh'
            ? `准备以 ${context.address} 登录`
            : `Ready to sign in as ${context.address}`;
      } else if (state === 'signed' && context?.address && context.signature) {
        text =
          lang === 'zh'
            ? `已为 ${context.address} 生成签名\n${context.signature}`
            : `Signed payload for ${context.address}\n${context.signature}`;
      }

      if (!text) {
        text = lang === 'zh' ? '连接钱包以启用登录' : 'Connect wallet to enable login';
      }

      target.textContent = text;
    });
  };

  new WalletConnectButton({
    container: walletSlot,
    network: BASE_MAINNET,
    statusTargets,
    callbacks: {
      onConnected(address) {
        updateSignatureTargets('ready', { address });
      },
      onDisconnected() {
        updateSignatureTargets('idle');
      },
      onSign(result: WalletSignatureResult) {
        const preview =
          result.signature.length > 32 ? `${result.signature.slice(0, 32)}…` : result.signature;
        updateSignatureTargets('signed', {
          address: result.address,
          signature: `${preview} (mock API pending)`,
        });
      },
    },
  });

  updateSignatureTargets('idle');
}
