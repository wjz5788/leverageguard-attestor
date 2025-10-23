import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from './WalletContext';

interface ApiKeys {
  binanceApiKey: string;
  binanceSecretKey: string;
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
}

interface ApiKeyContextType {
  apiKeys: ApiKeys;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeys>>;
  saveApiKeys: () => void;
  loadApiKeys: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { wallet } = useWallet();
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    binanceApiKey: '',
    binanceSecretKey: '',
    okxApiKey: '',
    okxSecretKey: '',
    okxPassphrase: ''
  });

  // Load API keys from localStorage
  const loadApiKeys = () => {
    if (wallet) {
      const savedKeys = localStorage.getItem(`apiKeys_${wallet}`);
      if (savedKeys) {
        try {
          const parsedKeys = JSON.parse(savedKeys);
          setApiKeys({
            binanceApiKey: parsedKeys.binanceApiKey || '',
            binanceSecretKey: parsedKeys.binanceSecretKey || '',
            okxApiKey: parsedKeys.okxApiKey || '',
            okxSecretKey: parsedKeys.okxSecretKey || '',
            okxPassphrase: parsedKeys.okxPassphrase || ''
          });
        } catch (e) {
          console.error('Failed to parse saved API keys', e);
        }
      }
    }
  };

  // Save API keys to localStorage
  const saveApiKeys = () => {
    if (wallet) {
      localStorage.setItem(`apiKeys_${wallet}`, JSON.stringify(apiKeys));
    }
  };

  // Load API keys when wallet changes
  useEffect(() => {
    loadApiKeys();
  }, [wallet]);

  return (
    <ApiKeyContext.Provider value={{ apiKeys, setApiKeys, saveApiKeys, loadApiKeys }}>
      {children}
    </ApiKeyContext.Provider>
  );
};

export const useApiKeys = (): ApiKeyContextType => {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKeys must be used within an ApiKeyProvider');
  }
  return context;
};