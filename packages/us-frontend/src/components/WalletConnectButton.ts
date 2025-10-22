import { NetworkConfig } from '../config/networks';
import {
  EthereumProvider,
  WalletCallbacks,
  WalletSignatureResult,
  WalletState,
} from '../types/wallet';
import {
  authenticate,
  getAuthState,
  hasValidToken,
  setConnectedAddress,
  clearAuth as resetAuth,
  subscribeAuth,
  type AuthState,
} from '../services/auth';
import type { SupportedLanguage } from '../utils/language';

const METAMASK_DOWNLOAD_URL = 'https://metamask.io/download/';

const shortenAddress = (address: string): string => {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export interface WalletConnectButtonOptions {
  container: HTMLElement;
  network: NetworkConfig;
  callbacks?: WalletCallbacks;
  statusTarget?: HTMLElement;
  statusTargets?: HTMLElement[];
}

export class WalletConnectButton {
  private readonly container: HTMLElement;
  private readonly network: NetworkConfig;
  private readonly callbacks?: WalletCallbacks;
  private readonly statusTargets: HTMLElement[];

  private state: WalletState = { status: 'disconnected' };

  private connectButton: HTMLButtonElement;
  private signButton: HTMLButtonElement;
  private helperText: HTMLSpanElement;

  private provider: EthereumProvider | undefined;
  private authState: AuthState = getAuthState();
  private unsubscribeAuth?: () => void;

  constructor(options: WalletConnectButtonOptions) {
    this.container = options.container;
    this.network = options.network;
    this.callbacks = options.callbacks;
    this.statusTargets = options.statusTargets ?? [];
    if (options.statusTarget) {
      this.statusTargets.push(options.statusTarget);
    }

    this.connectButton = document.createElement('button');
    this.connectButton.className = 'wallet-button wallet-button--primary';
    this.connectButton.addEventListener('click', () => this.handleConnectClick());

    this.signButton = document.createElement('button');
    this.signButton.className = 'wallet-button wallet-button--secondary';
    this.signButton.textContent = 'Sign Login';
    this.signButton.disabled = true;
    this.signButton.addEventListener('click', () => this.handleSignClick());

    this.helperText = document.createElement('span');
    this.helperText.className = 'wallet-helper';

    const wrapper = document.createElement('div');
    wrapper.className = 'wallet-connect-wrapper';
    wrapper.appendChild(this.connectButton);
    wrapper.appendChild(this.signButton);
    wrapper.appendChild(this.helperText);

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);

    this.provider = window.ethereum;
    if (this.provider) {
      this.provider.on?.('accountsChanged', (accounts) => this.handleAccountsChanged(accounts));
      this.provider.on?.('chainChanged', (chainId) => this.handleChainChanged(chainId));
    }

    this.unsubscribeAuth = subscribeAuth((auth) => {
      this.authState = auth;
      this.render();
    });

    window.addEventListener('beforeunload', () => {
      this.unsubscribeAuth?.();
    });

    this.render();
  }

  private render(): void {
    this.provider = window.ethereum;

    if (!this.provider) {
      this.state = { status: 'disconnected', error: 'missing-provider' };
      this.connectButton.textContent = 'Install MetaMask';
      this.connectButton.disabled = false;
      this.signButton.textContent = 'Sign Login';
      this.signButton.disabled = true;
      this.helperText.textContent = 'MetaMask is required to continue';
      this.updateStatusTarget('MetaMask not detected. Open the official download page.');
      return;
    }

    switch (this.state.status) {
      case 'connecting': {
        this.connectButton.textContent = 'Connecting…';
        this.connectButton.disabled = true;
        this.signButton.textContent = 'Sign Login';
        this.signButton.disabled = true;
        this.helperText.textContent = 'Please approve the request in MetaMask';
        this.updateStatusTarget('Connecting wallet…');
        this.renderAuthState();
        return;
      }
      case 'connected': {
        const address = this.state.address ?? '';
        this.connectButton.textContent = shortenAddress(address);
        this.connectButton.disabled = false;
        break;
      }
      default: {
        this.connectButton.textContent = 'Connect MetaMask';
        this.connectButton.disabled = false;
        this.signButton.textContent = 'Sign Login';
        this.signButton.disabled = true;
        this.helperText.textContent = 'Base Mainnet required';
        this.updateStatusTarget('Wallet disconnected');
        this.renderAuthState();
        return;
      }
    }

    this.renderAuthState();
  }

  private renderAuthState(): void {
    if (!this.provider || this.state.status !== 'connected' || !this.state.address) {
      this.signButton.textContent = 'Sign Login';
      this.signButton.disabled = true;
      if (this.state.status === 'connected') {
        this.helperText.textContent = `Network: ${this.network.chainName}`;
        this.updateStatusTarget('Connected to wallet');
      }
      return;
    }

    const address = this.state.address;
    const auth = this.authState;

    if (auth.status === 'authenticating') {
      this.signButton.textContent = 'Signing…';
      this.signButton.disabled = true;
      this.helperText.textContent = 'Confirm the login signature in MetaMask';
      this.updateStatusTarget(`Connected to ${address} · signing request…`);
      return;
    }

    if (auth.status === 'authenticated' && hasValidToken()) {
      this.signButton.textContent = 'Refresh Token';
      this.signButton.disabled = false;

      const expiryIso = auth.tokenExpiresAt
        ? new Date(auth.tokenExpiresAt).toISOString().replace(/\.\d{3}Z$/, 'Z')
        : null;
      const helperBase = `Network: ${this.network.chainName}`;
      this.helperText.textContent = expiryIso
        ? `${helperBase} · Token valid until ${expiryIso}`
        : `${helperBase} · Token active`;
      const statusMessage = expiryIso
        ? `Authenticated as ${address} · token valid until ${expiryIso}`
        : `Authenticated as ${address} · token active`;
      this.updateStatusTarget(statusMessage);
      return;
    }

    if (auth.status === 'error') {
      this.signButton.textContent = 'Retry Sign';
      this.signButton.disabled = false;
      const message = auth.lastError ?? 'Authentication failed';
      this.helperText.textContent = message;
      this.updateStatusTarget(message);
      return;
    }

    this.signButton.textContent = 'Sign Login';
    this.signButton.disabled = false;
    this.helperText.textContent = `Network: ${this.network.chainName}`;
    this.updateStatusTarget(`Connected to ${address}`);
  }

  private handleConnectClick(): void {
    if (!this.provider) {
      window.open(METAMASK_DOWNLOAD_URL, '_blank');
      return;
    }

    if (this.state.status === 'connected') {
      // Allow the user to retry network enforcement when already connected.
      void this.ensureBaseNetwork();
      return;
    }

    void this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.provider) {
      this.render();
      return;
    }

    this.state = { status: 'connecting' };
    this.render();

    try {
      const accounts = await this.provider.request<string[]>({ method: 'eth_requestAccounts' });
      const primary = accounts?.[0];
      if (!primary) {
        throw new Error('No accounts returned');
      }

      await this.ensureBaseNetwork();
      this.state = { status: 'connected', address: primary, chainId: this.network.chainId };
      setConnectedAddress(primary);
      this.authState = getAuthState();
      this.callbacks?.onConnected?.(primary);
      this.render();
    } catch (error) {
      const message = this.describeError(error);
      this.state = { status: 'disconnected', error: message };
      this.updateStatusTarget(message);
      this.render();
    }
  }

  private async ensureBaseNetwork(): Promise<void> {
    if (!this.provider) {
      return;
    }

    try {
      const currentChain = await this.provider.request<string>({ method: 'eth_chainId' });
      if (currentChain?.toLowerCase() === this.network.chainId.toLowerCase()) {
        return;
      }

      try {
        await this.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: this.network.chainId }],
        });
      } catch (switchError: unknown) {
        const errorWithCode = switchError as { code?: number };
        if (errorWithCode?.code === 4902) {
          await this.provider.request({
            method: 'wallet_addEthereumChain',
            params: [this.network],
          });
        } else {
          throw switchError;
        }
      }
    } catch (error) {
      const message = this.describeError(error);
      this.helperText.textContent = message;
      this.updateStatusTarget(message);
      throw error;
    }
  }

  private async handleSignClick(): Promise<void> {
    if (!this.provider || this.state.status !== 'connected' || !this.state.address) {
      return;
    }

    const address = this.state.address;
    this.signButton.textContent = 'Signing…';
    this.signButton.disabled = true;
    this.helperText.textContent = 'Confirm the login signature in MetaMask';
    this.updateStatusTarget(`Connected to ${address} · signing request…`);

    try {
      const authResult = await authenticate(address, async (message) => {
        return this.provider!.request<string>({
          method: 'personal_sign',
          params: [message, address],
        });
      });

      this.authState = authResult;
      const timestamp = new Date().toISOString();
      if (authResult.lastMessage && authResult.lastSignature) {
        const result: WalletSignatureResult = {
          address,
          message: authResult.lastMessage,
          signature: authResult.lastSignature,
          timestamp,
          nonce: authResult.lastNonce,
          token: authResult.token,
          tokenExpiresAt: authResult.tokenExpiresAt,
        };
        this.callbacks?.onSign?.(result);
      }
      this.render();
    } catch (error) {
      const messageText = this.describeError(error);
      this.helperText.textContent = messageText;
      this.updateStatusTarget(messageText);
      this.render();
    }
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (!accounts || accounts.length === 0) {
      this.state = { status: 'disconnected' };
      resetAuth();
      this.callbacks?.onDisconnected?.();
    } else {
      const nextAddress = accounts[0];
      this.state = { status: 'connected', address: nextAddress, chainId: this.network.chainId };
      setConnectedAddress(nextAddress);
      this.authState = getAuthState();
    }
    this.render();
  }

  private handleChainChanged(chainId: string): void {
    if (chainId?.toLowerCase() !== this.network.chainId.toLowerCase()) {
      this.state = { status: 'connecting', address: this.state.address, chainId };
      this.helperText.textContent = 'Wrong network — switch to Base';
      this.signButton.textContent = 'Sign Login';
      this.signButton.disabled = true;
      this.updateStatusTarget('Please switch back to Base (8453)');
      this.render();
      return;
    }

    if (this.state.address) {
      this.state = { status: 'connected', address: this.state.address, chainId };
      setConnectedAddress(this.state.address);
      this.authState = getAuthState();
    }
    this.render();
  }

  private describeError(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object') {
      const err = error as { message?: string; code?: number };
      if (err.code === 4001) {
        return 'Request rejected in MetaMask';
      }
      if (err.message) {
        return err.message;
      }
    }

    return 'Unable to process wallet request';
  }

  private translateStatus(message: string, lang: SupportedLanguage | undefined): string {
    if (lang !== 'zh') {
      return message;
    }

    if (message.startsWith('Connected to ')) {
      if (message.includes('· signing request')) {
        const [prefix, suffix] = message.split('·');
        const addr = prefix.replace('Connected to ', '').trim();
        return `已连接 ${addr} · 正在签名请求…`;
      }
      const address = message.replace('Connected to ', '');
      return `已连接 ${address}`;
    }

    if (message.startsWith('Authenticated as ')) {
      const [prefix, suffix] = message.split('·').map((part) => part.trim());
      const address = prefix.replace('Authenticated as ', '');
      if (!suffix) {
        return `已认证 ${address}`;
      }
      if (suffix.startsWith('token valid until')) {
        const expiry = suffix.replace('token valid until', '').trim();
        return `已认证 ${address} · Token 有效至 ${expiry}`;
      }
      if (suffix.startsWith('token active')) {
        return `已认证 ${address} · Token 已激活`;
      }
      return `已认证 ${address} · ${suffix}`;
    }

    switch (message) {
      case 'Wallet disconnected':
        return '钱包未连接';
      case 'MetaMask not detected. Open the official download page.':
        return '未检测到 MetaMask，请前往官网下载。';
      case 'Please switch back to Base (8453)':
        return '请切换回 Base 主网（8453）';
      case 'Connected to wallet':
        return '钱包已连接';
      case 'Connecting wallet…':
        return '正在连接钱包…';
      case 'Request rejected in MetaMask':
        return 'MetaMask 中拒绝了请求';
      case 'Unable to process wallet request':
        return '钱包请求处理失败';
      case 'Confirm the login signature in MetaMask':
        return '请在 MetaMask 中确认签名';
      default:
        return message;
    }
  }

  private updateStatusTarget(message: string): void {
    if (this.statusTargets.length === 0) {
      return;
    }

    this.statusTargets.forEach((target) => {
      const lang = (target.dataset.lang as SupportedLanguage | undefined) ?? 'en';
      target.textContent = this.translateStatus(message, lang);
    });
  }
}
