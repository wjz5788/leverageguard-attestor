const BASE_CHAIN_ID_DECIMAL = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface WalletConnectionResult {
  address: string;
  chainId: number;
  ethereum: any;
}

function getEthereumOrThrow(): any {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('未检测到钱包，请先安装 MetaMask');
  }
  return window.ethereum;
}

async function ensureBaseChain(ethereum: any): Promise<number> {
  const currentChainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
  if (currentChainIdHex === BASE_CHAIN_ID_HEX) return BASE_CHAIN_ID_DECIMAL;
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID_HEX }] });
  } catch (switchError: any) {
    if (switchError && switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: 'Base Mainnet',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org']
          }
        ]
      });
    } else {
      throw switchError;
    }
  }
  const newChainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
  if (newChainIdHex !== BASE_CHAIN_ID_HEX) {
    throw new Error('未能切换到 Base 主网（chainId 8453）');
  }
  return BASE_CHAIN_ID_DECIMAL;
}

export async function connectAndEnsureBase(): Promise<WalletConnectionResult> {
  const ethereum = getEthereumOrThrow();
  const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('未选择任何账户');
  const address = accounts[0];
  if (!address) throw new Error('无法获取钱包地址');
  const chainId = await ensureBaseChain(ethereum);
  return { address, chainId, ethereum };
}

export async function getCurrentAccountIfConnected(): Promise<WalletConnectionResult | null> {
  const ethereum = window.ethereum;
  if (!ethereum) return null;
  const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
  if (!accounts || accounts.length === 0) return null;
  const address = accounts[0];
  const chainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
  const chainId = chainIdHex === BASE_CHAIN_ID_HEX ? BASE_CHAIN_ID_DECIMAL : parseInt(chainIdHex, 16);
  return { address, chainId, ethereum };
}
