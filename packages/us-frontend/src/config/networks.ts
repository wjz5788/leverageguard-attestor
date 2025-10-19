export interface NetworkConfig {
  chainId: string; // hex string with 0x prefix
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const BASE_MAINNET: NetworkConfig = {
  chainId: '0x2105',
  chainName: 'Base Mainnet',
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

export const SUPPORTED_NETWORKS = {
  base: BASE_MAINNET,
};
