export type WalletConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletConnectionStatus;
  address?: string;
  chainId?: string;
  error?: string;
}

export interface WalletCallbacks {
  onConnected?(address: string): void;
  onDisconnected?(): void;
  onSign?(result: WalletSignatureResult): void;
}

export interface WalletSignatureResult {
  address: string;
  message: string;
  signature: string;
  timestamp: string;
}

export interface EthereumRequestArguments<T = unknown> {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export interface EthereumProvider {
  isMetaMask?: boolean;
  request<T = unknown>(args: EthereumRequestArguments): Promise<T>;
  on?(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  on?(event: 'chainChanged', handler: (chainId: string) => void): void;
  removeListener?(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  removeListener?(event: 'chainChanged', handler: (chainId: string) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
