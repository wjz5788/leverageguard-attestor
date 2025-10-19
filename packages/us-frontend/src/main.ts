import { BASE_MAINNET } from './config/networks';
import { WalletConnectButton } from './components/WalletConnectButton';
import { WalletSignatureResult } from './types/wallet';

document.addEventListener('DOMContentLoaded', () => {
  const walletMount = document.querySelector<HTMLElement>('[data-wallet-slot]');
  const statusTarget = document.querySelector<HTMLElement>('[data-wallet-status]');
  const signaturePreview = document.querySelector<HTMLElement>('[data-signature-preview]');

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
      onSign(result: WalletSignatureResult) {
        if (signaturePreview) {
          signaturePreview.textContent = `Signed payload for ${result.address}\n${result.signature.slice(0, 32)}… (mock API pending)`;
        }
      },
    },
  });

  if (statusTarget) {
    statusTarget.textContent = 'Wallet disconnected';
  }
});
