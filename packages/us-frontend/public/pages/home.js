import { BASE_MAINNET } from '../config/networks.js';
import { WalletConnectButton } from '../components/WalletConnectButton.js';

function queryHomeSelectors() {
  const walletSlot = document.querySelector('[data-wallet-slot]');
  if (!walletSlot) {
    return null;
  }

  const statusTargets = Array.from(document.querySelectorAll('[data-wallet-status]'));
  const signatureTargets = Array.from(document.querySelectorAll('[data-signature-preview]'));

  return {
    walletSlot,
    statusTargets,
    signatureTargets,
  };
}

function translateSignature(state, context, lang) {
  if (state === 'ready' && context?.address) {
    return lang === 'zh'
      ? `准备以 ${context.address} 登录`
      : `Ready to sign in as ${context.address}`;
  }
  if (state === 'signed' && context?.address && context.signature) {
    return lang === 'zh'
      ? `已为 ${context.address} 生成签名\n${context.signature}`
      : `Signed payload for ${context.address}\n${context.signature}`;
  }
  return lang === 'zh' ? '连接钱包以启用登录' : 'Connect wallet to enable login';
}

function updateSignatureTargets(targets, state, context) {
  targets.forEach((target) => {
    const lang = target.dataset.lang === 'zh' ? 'zh' : 'en';
    target.textContent = translateSignature(state, context, lang);
  });
}

export function initHomePage() {
  const selectors = queryHomeSelectors();
  if (!selectors) {
    console.warn('Wallet mount point missing in DOM');
    return;
  }

  const { walletSlot, statusTargets, signatureTargets } = selectors;

  new WalletConnectButton({
    container: walletSlot,
    network: BASE_MAINNET,
    statusTargets,
    callbacks: {
      onConnected(address) {
        updateSignatureTargets(signatureTargets, 'ready', { address });
      },
      onDisconnected() {
        updateSignatureTargets(signatureTargets, 'idle');
      },
      onSign(result) {
        const preview = result.signature.length > 32 ? `${result.signature.slice(0, 32)}…` : result.signature;
        updateSignatureTargets(signatureTargets, 'signed', {
          address: result.address,
          signature: `${preview} (mock API pending)`,
        });
      },
    },
  });

  updateSignatureTargets(signatureTargets, 'idle');
}
