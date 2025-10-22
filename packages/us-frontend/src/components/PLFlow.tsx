import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getSkus, type Sku } from '../services/catalog';
import { createOrder, type OrderPayload } from '../services/order';
import { createClaim, type ClaimPayload } from '../services/claim';

// Mock wallet connection for now
// In the final app, this will come from a shared context
const useWallet = () => ({
  connectedAddress: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B' // Vitalik's address as a placeholder
});

export function PLFlow() {
  const { connectedAddress } = useWallet();
  const [skus, setSkus] = useState<Sku[]>([]);
  const [claimOrderId, setClaimOrderId] = useState('');
  const [claimStatus, setClaimStatus] = useState('');

  useEffect(() => {
    getSkus().then(setSkus).catch(console.error);
  }, []);

  const handleBuyClick = async (sku: Sku) => {
    if (!connectedAddress) {
      alert('Please connect your wallet first.');
      return;
    }
    try {
      const payload: OrderPayload = {
        skuId: sku.id,
        exchange: sku.exchange,
        pair: 'BTCUSDT', // Placeholder
        orderRef: `client-${crypto.randomUUID()}`,
        wallet: connectedAddress,
        premium: sku.premium,
        payout: sku.payout,
        paymentMethod: 'wallet',
      };
      const result = await createOrder(payload);
      alert(`Order created successfully!\nOrder ID: ${result.orderId}`);
    } catch (error) {
      console.error('Order creation failed:', error);
      alert(`Failed to create order: ${error.message}`);
    }
  };

  const handleClaimSubmit = async () => {
    if (!connectedAddress) {
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
        wallet: connectedAddress,
        evidenceHash: `placeholder-${crypto.randomUUID()}`,
      };
      const result = await createClaim(payload);
      setClaimStatus(`Claim received! Claim ID: ${result.claimId}`);
      setClaimOrderId('');
    } catch (error) {
      console.error('Claim submission failed:', error);
      setClaimStatus(`Submission failed: ${error.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* --- Section 1: Product List (Our integration) --- */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Available Insurance Products</h3>
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
                  className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-700/30 transition hover:bg-indigo-400"
                >
                  Buy
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