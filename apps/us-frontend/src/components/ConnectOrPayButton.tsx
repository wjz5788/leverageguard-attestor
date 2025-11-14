import React, { useState, useCallback } from 'react';
import { connectAndEnsureBase, WalletConnectionResult } from '../lib/wallet';
import { useAuth, loginWithWallet } from '../lib/auth';

export interface ConnectOrPayButtonProps {
  onPay: (params: WalletConnectionResult) =\u003e Promise\u003cvoid\u003e;
  disabled?: boolean;
  disabledText?: string;
}

export const ConnectOrPayButton: React.FC\u003cConnectOrPayButtonProps\u003e = ({ onPay, disabled = false, disabledText }) =\u003e {
  const { isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLoginClick = useCallback(async () =\u003e {
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

  const handlePayClick = useCallback(async () =\u003e {
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
    \u003cbutton
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
    \u003e
      {loading ? 'Processing...' : buttonText}
    \u003c/button\u003e
  );
};
