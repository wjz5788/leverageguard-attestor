import React, { useState } from 'react';
import { createClaim, type ClaimPayload } from '../services/claim';

export function ClaimPage() {
  const [orderId, setOrderId] = useState('');
  const [wallet, setWallet] = useState('');
  const [evidenceHash, setEvidenceHash] = useState('');
  const [reason, setReason] = useState('liquidation');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const payload: ClaimPayload = {
        orderId: orderId.trim(),
        wallet: wallet.trim(),
        evidenceHash: evidenceHash.trim(),
        reason,
      };
      
      const result = await createClaim(payload);
      
      setMessage(`Claim submitted successfully! Claim ID: ${result.claimId}`);
      setMessageType('success');
      // Reset form
      setOrderId('');
      setWallet('');
      setEvidenceHash('');
      setReason('liquidation');
    } catch (error) {
      console.error('Error submitting claim:', error);
      setMessage(`Failed to submit claim: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">Submit a Claim</h1>
      
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          messageType === 'success' 
            ? 'bg-green-900 text-green-200' 
            : 'bg-red-900 text-red-200'
        }`}>
          {message}
        </div>
      )}
      
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Claim Information</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Order ID
            </label>
            <input 
              type="text" 
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter your order ID"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Wallet Address
            </label>
            <input 
              type="text" 
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Enter your wallet address"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Evidence Hash
            </label>
            <input 
              type="text" 
              value={evidenceHash}
              onChange={(e) => setEvidenceHash(e.target.value)}
              placeholder="Enter evidence hash"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Reason
            </label>
            <select 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            >
              <option value="liquidation">Liquidation</option>
              <option value="partial_liquidation">Partial Liquidation</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isLoading ? 'Submitting...' : 'Submit Claim'}
          </button>
        </form>
      </div>
      
      <div className="mt-8 bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">What happens next?</h2>
        <ol className="list-decimal list-inside space-y-2 text-slate-300">
          <li>Your claim will be reviewed by our team</li>
          <li>We'll verify the evidence provided</li>
          <li>Once approved, the payout will be processed automatically</li>
          <li>You'll receive the payout to your wallet address</li>
        </ol>
      </div>
    </div>
  );
}