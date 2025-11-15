import React, { useState, useCallback } from 'react';
import { connectAndEnsureBase, WalletConnectionResult } from '../lib/wallet';
import { useAuth, loginWithWallet } from '../lib/auth';

export interface ConnectOrPayButtonProps {
  onPay: (params: WalletConnectionResult) => Promise<void>;
  disabled?: boolean;
  disabledText?: string;
}

export const ConnectOrPayButton: React.FC<ConnectOrPayButtonProps> = ({ onPay, disabled = false, disabledText }) => {
  const { isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLoginClick = useCallback(async () => {
    try {
      setLoading(true);
      await loginWithWallet();
    } catch (err: any) {
      console.error('Wallet login failed', err);
      alert('钱包登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePayClick = useCallback(async () => {
    try {
      setLoading(true);
      const walletConnection = await connectAndEnsureBase();
      await onPay(walletConnection);
    } catch (err: any) {
      console.error('Payment failed', err);
    } finally {
      setLoading(false);
    }
  }, [onPay]);

  const buttonText = disabled ? (disabledText || '请先完成订单验证') : (isLoggedIn ? 'Pay with USDC' : '用钱包登录');
  const handleClick = disabled ? undefined : (isLoggedIn ? handlePayClick : handleLoginClick);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      style={{
        padding: '10px 16px',
        borderRadius: 8,
        border: 'none',
        cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        fontWeight: 600,
      }}
    >
      {loading ? 'Processing...' : buttonText}
    </button>
  );
};
