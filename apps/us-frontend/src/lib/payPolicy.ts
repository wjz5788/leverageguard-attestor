import { ethers } from 'ethers';
import api from '../services/api.ts';
import {
  BASE_USDC_ADDRESS,
  CHECKOUT_CONTRACT_ADDRESS,
  BASE_MAINNET
} from '../constants';
const STATIC_QUOTE_HASH = import.meta.env.VITE_CHECKOUT_QUOTE_HASH;

const BASE_CHAIN_ID_DEC = BigInt(parseInt(BASE_MAINNET.chainId, 16));
const BASE_CHAIN_ID_HEX = BASE_MAINNET.chainId;
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) external returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)'
];

const CHECKOUT_ABI = [
  'function buyPolicy(bytes32 orderId,uint256 amount,bytes32 quoteHash) external'
];


export async function connectAndEnsureBase() {
  const eth = (window as any)?.ethereum;
  if (!eth) throw new Error('未检测到钱包，请安装 MetaMask');
  await eth.request({ method: 'eth_requestAccounts' });
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID_HEX }] });
  } catch (error: any) {
    if (error?.code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [BASE_MAINNET] });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN_ID_HEX }] });
    } else {
      throw error;
    }
  }
  const provider = new ethers.BrowserProvider(eth);
  const { chainId } = await provider.getNetwork();
  if (chainId !== BASE_CHAIN_ID_DEC) throw new Error('请先切换到 Base 主网');
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

export async function payPolicy(amountUSDC: string) {
  if (!CHECKOUT_CONTRACT_ADDRESS) {
    throw new Error('缺少 CHECKOUT_CONTRACT_ADDRESS 配置');
  }

  const { signer, address } = await connectAndEnsureBase();
  const amount = ethers.parseUnits(amountUSDC, USDC_DECIMALS);

  if (amount <= 0n) {
    throw new Error('请输入有效的 USDC 金额');
  }

  const orderId = ethers.id(`${address}:${Date.now()}:${Math.random()}`);
  let quoteHash: string | undefined;
  if (typeof STATIC_QUOTE_HASH === 'string' && /^0x[a-fA-F0-9]{64}$/.test(STATIC_QUOTE_HASH)) {
    quoteHash = STATIC_QUOTE_HASH;
  } else {
    try {
      const quoteResp = await api.post<{ ok: boolean; data?: { quoteHash: string } }>('/api/v1/pricing/quote-hash', {
        wallet: address,
        amountUSDC
      }, { requireAuth: false });
      quoteHash = (quoteResp as any)?.data?.quoteHash;
    } catch (e) {
      throw new Error('后台服务不可用或配置缺失，无法获取quoteHash');
    }
    if (!quoteHash || !/^0x[a-fA-F0-9]{64}$/.test(quoteHash)) {
      throw new Error('获取 quoteHash 失败，请稍后重试');
    }
  }
  const usdc = new ethers.Contract(BASE_USDC_ADDRESS, ERC20_ABI, signer);
  const allowance: bigint = await usdc.allowance(address, CHECKOUT_CONTRACT_ADDRESS);

  if (allowance < amount) {
    const approveTx = await usdc.approve(CHECKOUT_CONTRACT_ADDRESS, amount);
    await approveTx.wait();
  }

  const checkout = new ethers.Contract(CHECKOUT_CONTRACT_ADDRESS, CHECKOUT_ABI, signer);
  const buyTx = await checkout.buyPolicy(orderId, amount, quoteHash);
  const receipt = await buyTx.wait();

  return { orderId, txHash: receipt?.hash ?? buyTx.hash };
}

export async function payAndSubmit(amountUSDC: string) {
  const { orderId, txHash } = await payPolicy(amountUSDC);
  try {
    const { signer, address } = await connectAndEnsureBase();
    await fetch('/api/v1/orders/minimal-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, wallet: address, premiumUSDC: Number(amountUSDC) })
    });
  } catch {}
  try {
    await fetch(`/api/v1/orders/${orderId}/submit-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash })
    });
  } catch {}
  return { orderId, txHash };
}

export async function payPolicyWithWallet(
  params: { amountUsdc: number },
  wallet: { address: string; ethereum: any }
) {
  if (!CHECKOUT_CONTRACT_ADDRESS) throw new Error('缺少 CHECKOUT_CONTRACT_ADDRESS 配置');
  const provider = new ethers.BrowserProvider(wallet.ethereum);
  const signer = await provider.getSigner();
  const amount = ethers.parseUnits(String(params.amountUsdc), USDC_DECIMALS);
  if (amount <= 0n) throw new Error('请输入有效的 USDC 金额');
  const orderId = ethers.id(`${wallet.address}:${Date.now()}:${Math.random()}`);
  let quoteHash: string | undefined;
  if (typeof STATIC_QUOTE_HASH === 'string' && /^0x[a-fA-F0-9]{64}$/.test(STATIC_QUOTE_HASH)) {
    quoteHash = STATIC_QUOTE_HASH;
  } else {
    const quoteResp = await api.post<{ ok: boolean; data?: { quoteHash: string } }>(
      '/api/v1/pricing/quote-hash',
      { wallet: wallet.address, amountUSDC: String(params.amountUsdc) },
      { requireAuth: false }
    );
    quoteHash = (quoteResp as any)?.data?.quoteHash;
    if (!quoteHash || !/^0x[a-fA-F0-9]{64}$/.test(quoteHash)) throw new Error('获取 quoteHash 失败，请稍后重试');
  }
  const usdc = new ethers.Contract(BASE_USDC_ADDRESS, ERC20_ABI, signer);
  const allowance: bigint = await usdc.allowance(wallet.address, CHECKOUT_CONTRACT_ADDRESS);
  if (allowance < amount) {
    const approveTx = await usdc.approve(CHECKOUT_CONTRACT_ADDRESS, amount);
    await approveTx.wait();
  }
  const checkout = new ethers.Contract(CHECKOUT_CONTRACT_ADDRESS, CHECKOUT_ABI, signer);
  const buyTx = await checkout.buyPolicy(orderId, amount, quoteHash);
  const receipt = await buyTx.wait();
  return { orderId, txHash: receipt?.hash ?? buyTx.hash };
}
