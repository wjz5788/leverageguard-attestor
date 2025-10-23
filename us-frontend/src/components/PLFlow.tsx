import React, { useEffect, useState } from 'react';
import { getSkus, type Sku } from '../services/catalog';
import { createOrder, type OrderPayload } from '../services/order';
import { createClaim, type ClaimPayload } from '../services/claim';
import { useWallet } from '../contexts/WalletContext';

export function PLFlow() {
  const { account, isConnected, isConnecting, error, connectWallet } = useWallet();
  const [skus, setSkus] = useState<Sku[]>([]);
  const [claimOrderId, setClaimOrderId] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [buyStatus, setBuyStatus] = useState('');

  useEffect(() => {
    getSkus().then(setSkus).catch(console.error);
  }, []);

  const handleBuyClick = async (sku: Sku) => {
    if (!isConnected || !account) {
      alert('Please connect your wallet first.');
      return;
    }
    
    setBuyStatus('Creating order...');
    try {
      const payload: OrderPayload = {
        skuId: sku.id,
        exchange: sku.exchange,
        pair: 'BTCUSDT', // Placeholder
        orderRef: `client-${crypto.randomUUID()}`,
        wallet: account,
        premium: sku.premium,
        payout: sku.payout,
        paymentMethod: 'wallet',
      };
      const result = await createOrder(payload);
      setBuyStatus(`Order created successfully! Order ID: ${result.orderId}`);
      
      // 3秒后清除状态
      setTimeout(() => setBuyStatus(''), 3000);
    } catch (error: any) {
      console.error('Order creation failed:', error);
      setBuyStatus(`Failed to create order: ${error.message || 'Unknown error'}`);
      
      // 5秒后清除错误状态
      setTimeout(() => setBuyStatus(''), 5000);
    }
  };

  const handleClaimSubmit = async () => {
    if (!isConnected || !account) {
      alert('Please connect your wallet first.');
      return;
    }
    if (!claimOrderId.trim()) {
      alert('Please enter an Order ID.');
      return;
    }
    setClaimStatus('Submitting...');
    try {
      const payload: ClaimPayload = {
        orderId: claimOrderId.trim(),
        wallet: account,
        evidenceHash: `placeholder-${crypto.randomUUID()}`,
      };
      const result = await createClaim(payload);
      setClaimStatus(`Claim received! Claim ID: ${result.claimId}`);
      setClaimOrderId('');
    } catch (error: any) {
      console.error('Claim submission failed:', error);
      setClaimStatus(`Submission failed: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* --- Section 1: Product List (Our integration) --- */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Available Insurance Products</h3>
        
        {/* 钱包连接状态 */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Wallet Status</h3>
              <p className="text-sm text-gray-600">
                {isConnecting ? 'Connecting...' : 
                 isConnected ? `Connected: ${account?.slice(0, 8)}...${account?.slice(-6)}` : 
                 'Not connected'}
              </p>
              {error && <p className="text-sm text-red-600 mt-1">Error: {error}</p>}
            </div>
            {!isConnected && (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
        
        {/* 购买状态反馈 */}
        {buyStatus && (
          <div className={`mb-4 p-3 rounded ${
            buyStatus.includes('successfully') ? 'bg-green-100 text-green-800' : 
            buyStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 
            'bg-blue-100 text-blue-800'
          }`}>
            {buyStatus}
          </div>
        )}
        
        {skus.length > 0 ? (
          <ul className="space-y-3">
            {skus.map(sku => (
              <li key={sku.id} className="p-4 bg-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <strong className="text-white">{sku.title}</strong>
                  <p className="text-sm text-slate-400">
                    Exchange: {sku.exchange} | Premium: ${(sku.premium / 100).toFixed(2)} | Payout: ${(sku.payout / 100).toFixed(2)}
                  </p>
                </div>
                <button 
                  onClick={() => handleBuyClick(sku)}
                  disabled={!isConnected || buyStatus.includes('Creating')}
                  className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-700/30 transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  {buyStatus.includes('Creating') ? 'Creating Order...' : 'Buy'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">Loading products...</p>
        )}
      </div>

      {/* --- Section 2: Claim Submission (Our integration) --- */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Submit a Claim</h3>
        <div className="grid gap-4 sm:grid-cols-[1fr,auto]">
          <input 
            type="text"
            value={claimOrderId}
            onChange={(e) => setClaimOrderId(e.target.value)}
            placeholder="Enter your Order ID to submit a claim..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-indigo-400 focus:outline-none"
          />
          <button 
            onClick={handleClaimSubmit}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-700/30 transition hover:bg-emerald-400"
          >
            Submit Claim
          </button>
        </div>
        {claimStatus && <p className="text-sm text-slate-300 mt-2">{claimStatus}</p>}
      </div>
    </div>
  );
}