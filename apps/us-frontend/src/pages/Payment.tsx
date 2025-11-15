import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { BASE_USDC_ADDRESS, CHECKOUT_CONTRACT_ADDRESS } from '../constants';
import { ConnectOrPayButton } from '../components/ConnectOrPayButton';
import { WalletConnectionResult } from '../lib/wallet';
import { payPolicyWithWallet } from '../lib/payPolicy';

export const Payment: React.FC = () => {
  const navigate = useNavigate();
  const { id: routeOrderId } = useParams();
  const { push } = useToast();
  const [amount, setAmount] = useState('0.01');
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState<string>(routeOrderId || '');
  const [ordId, setOrdId] = useState<string>('');
  const [instId, setInstId] = useState<string>('BTC-USDT-SWAP');
  const [apiKey, setApiKey] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>('');
  const [passphrase, setPassphrase] = useState<string>('');
  const [uid, setUid] = useState<string>('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const handlePayment = async (wallet: WalletConnectionResult) => {
    setIsProcessing(true);
    try {
      const result = await payPolicyWithWallet({ amountUsdc: Number(amount) }, { address: wallet.address, ethereum: wallet.ethereum });
      try {
        await fetch('/api/v1/orders/minimal-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: result.orderId, wallet: wallet.address, premiumUSDC: Number(amount) })
        });
      } catch {}
      try {
        await fetch(`/api/v1/orders/${result.orderId}/submit-tx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: result.txHash })
        });
      } catch {}
      push({
        title: '支付完成，等待链上确认',
        desc: `orderId=${result.orderId.slice(0, 10)}…`
      });
      navigate('/success');
    } catch (error: any) {
      push({ title: error?.message || '支付失败', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const buttonLabel = isProcessing ? '处理中…' : '用 USDC 支付';
  const canPay = Boolean(
    verifyResult && (
      (verifyResult?.checks && verifyResult?.checks?.verdict === 'pass') ||
      (typeof verifyResult?.status === 'string' && verifyResult?.status?.toLowerCase() === 'verified')
    )
  );

  const handleVerify = async () => {
    if (!ordId || !instId) {
      push({ title: '请填写订单ID与交易对', type: 'error' });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/v1/verify/okx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordId,
          instId,
          live: true,
          fresh: true,
          noCache: true,
          keyMode: 'inline',
          apiKey,
          secretKey,
          passphrase,
          uid: uid || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data?.error?.msg || data?.message || data?.detail || '验证失败') as string;
        throw new Error(msg);
      }
      setVerifyResult(data);
      const liquidated = Boolean(data?.normalized?.position?.liquidated);
      push({ title: liquidated ? '订单已强平' : '订单正常', desc: liquidated ? '触发理赔条件' : '未触发理赔条件' });
    } catch (e: any) {
      push({ title: e?.message || '验证失败', type: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-6">
        <Card className="p-6">
          <h1 className="text-3xl font-bold">快速支付</h1>
          <p className="mt-2 text-stone-600">Base 主网 + USDC，直接将保费打到金库</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4 p-6">
            <div>
              <h2 className="text-xl font-semibold">产品信息</h2>
              <p className="text-sm text-stone-500">固定保单，自动触发 PremiumPaid 事件</p>
            </div>
            <div className="space-y-2 text-sm text-stone-600">
              <div>保费（USDC）：{amount || '0'}</div>
              <div>Checkout 合约：{CHECKOUT_CONTRACT_ADDRESS}</div>
              <div>USDC：{BASE_USDC_ADDRESS}</div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase text-stone-500">支付金额（USDC）</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </Card>

          <Card className="space-y-5 p-6">
            <h2 className="text-xl font-semibold">支付操作</h2>
            <div>
              <ConnectOrPayButton onPay={handlePayment} disabled={!canPay} disabledText={"请先完成订单验证"} />
            </div>
            {!canPay && (
              <p className="text-xs text-red-600 text-center">需先在下方完成订单验证并通过，才能进行支付</p>
            )}
            <p className="text-xs text-stone-500 text-center">支付会在 Base 网络完成，USDC 直接送至金库</p>
          </Card>
        </div>

        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-xl font-semibold">订单验证（强平检查）</h2>
            <p className="text-sm text-stone-500">输入合约订单号与交易对，调用交易所验证是否强平</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">订单ID</label>
              <input
                value={ordId}
                onChange={(e) => setOrdId(e.target.value)}
                placeholder="例如 2940071038556348417"
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">交易对/合约</label>
              <input
                value={instId}
                onChange={(e) => setInstId(e.target.value)}
                placeholder="例如 BTC-USDT-SWAP"
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">Secret Key</label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">UID（可选）</label>
              <input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase text-stone-500">订单ID（来源）</label>
              <input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="来自订单列表的内部ID"
                className="w-full rounded border border-stone-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="w-full rounded bg-zinc-900 text-white px-3 py-2 text-sm disabled:opacity-50"
              >
                {verifying ? '验证中…' : '验证是否强平'}
              </button>
            </div>
          </div>
          {verifyResult && (
            <div className="rounded border border-stone-200 bg-white p-3">
              <div className="text-sm">验证完成 · 证据ID：{verifyResult?.evidence?.evidenceId || verifyResult?.evidenceId || '-'}</div>
              <div className="text-xs text-stone-600 mt-1">
                强平：{verifyResult?.normalized?.position?.liquidated ? '是' : '否'} · 原因：{verifyResult?.normalized?.position?.reason || '-'}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
