import React from 'react';
import { useWallet } from '../contexts/WalletContext';

export function WalletConnectNav() {
  const { account, isConnected, isConnecting, connectWallet, disconnectWallet } = useWallet();

  const shortenAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (isConnected && account) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-slate-300 hidden sm:inline">
          {shortenAddress(account)}
        </span>
        <button
          onClick={disconnectWallet}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-full transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connectWallet}
      disabled={isConnecting}
      className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full transition-colors disabled:opacity-50"
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}