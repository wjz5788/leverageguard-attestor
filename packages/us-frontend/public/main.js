import { BASE_MAINNET } from './config/networks.js';
import { WalletConnectButton } from './components/WalletConnectButton.js';

document.addEventListener('DOMContentLoaded', () => {
  const walletMount = document.querySelector('[data-wallet-slot]');
  const statusTarget = document.querySelector('[data-wallet-status]');
  const signaturePreview = document.querySelector('[data-signature-preview]');

  if (!walletMount) {
    console.warn('Wallet mount point missing in DOM');
    return;
  }

  new WalletConnectButton({
    container: walletMount,
    network: BASE_MAINNET,
    statusTarget: statusTarget ?? undefined,
    callbacks: {
      onConnected(address) {
        if (signaturePreview) {
          signaturePreview.textContent = `Ready to sign in as ${address}`;
        }
      },
      onDisconnected() {
        if (signaturePreview) {
          signaturePreview.textContent = 'Connect wallet to enable login';
        }
      },
      onSign(result) {
        if (signaturePreview && result?.signature) {
          const preview = result.signature.length > 32 ? `${result.signature.slice(0, 32)}…` : result.signature;
          signaturePreview.textContent = `Signed payload for ${result.address}\n${preview} (mock API pending)`;
        }
      },
    },
  });

  if (statusTarget) {
    statusTarget.textContent = 'Wallet disconnected';
  }
});
