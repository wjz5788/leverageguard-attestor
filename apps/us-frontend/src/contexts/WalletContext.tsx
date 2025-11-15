import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { WalletState } from '../types';
import { BASE_MAINNET, BASE_SEPOLIA } from '../constants';
import { loginWithWallet } from '../lib/auth';

const WalletContext = createContext<WalletState | null>(null);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("WalletContext missing");
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const onBase = (chainId || "").toLowerCase() === BASE_MAINNET.chainId.toLowerCase();

  // 钱包事件监听
  useEffect(() => {
    const w = window as any;
    const ethereum = Array.isArray(w?.ethereum?.providers)
      ? w.ethereum.providers.find((p: any) => p?.isMetaMask || p?.isBraveWallet || p?.request)
      : w?.ethereum;
    if (!ethereum) return;

    const handleAccounts = (accounts: string[]) => {
      setAddress(accounts?.[0] || "");
    };

    const handleChain = (id: string) => {
      setChainId(id || "");
    };

    // 初始化获取账户和链ID
    ethereum.request?.({ method: "eth_accounts" }).then(handleAccounts).catch(() => {});
    ethereum.request?.({ method: "eth_chainId" }).then(handleChain).catch(() => {});

    // 监听账户和链变化
    ethereum.on?.("accountsChanged", handleAccounts);
    ethereum.on?.("chainChanged", handleChain);

    return () => {
      try {
        ethereum?.removeListener?.("accountsChanged", handleAccounts);
        ethereum?.removeListener?.("chainChanged", handleChain);
      } catch {}
    };
  }, []);

  const connectWallet = useCallback(async () => {
    setMessage("");
    const w = window as any;
    const ethereum = Array.isArray(w?.ethereum?.providers)
      ? w.ethereum.providers.find((p: any) => p?.isMetaMask || p?.isBraveWallet || p?.request)
      : w?.ethereum;
    if (!ethereum) {
      setMessage("未检测到钱包。请安装 MetaMask 或使用兼容钱包。");
      return;
    }

    try {
      setBusy(true);
      const { address } = await loginWithWallet();
      setAddress(address || "");
      setChainId(BASE_MAINNET.chainId);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const switchToBase = useCallback(async (testnet = false) => {
    setMessage("");
    const target = testnet ? BASE_SEPOLIA : BASE_MAINNET;
    const w = window as any;
    const ethereum = Array.isArray(w?.ethereum?.providers)
      ? w.ethereum.providers.find((p: any) => p?.isMetaMask || p?.isBraveWallet || p?.request)
      : w?.ethereum;
    if (!ethereum) {
      setMessage("未检测到钱包。请安装 MetaMask 或使用兼容钱包。");
      return;
    }

    try {
      setBusy(true);
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.chainId }]
      });
      setChainId(target.chainId);
    } catch (error: any) {
      if (error?.code === 4902) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [target]
          });
          setChainId(target.chainId);
        } catch (addError: any) {
          setMessage(addError?.message || String(addError));
        }
      } else {
        setMessage(error?.message || String(error));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAddress("");
    setChainId("");
    setMessage("");
  }, []);

  const value: WalletState = {
    address,
    chainId,
    onBase,
    busy,
    message,
    setMessage,
    connectWallet,
    switchToBase,
    disconnectWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};
