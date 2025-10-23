import React, { useState, useEffect } from 'react';

export function VerifyPage() {
  const [skus, setSkus] = useState([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [exchange, setExchange] = useState('');
  const [pair, setPair] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [wallet, setWallet] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  useEffect(() => {
    // Fetch available SKUs from the backend
    fetch('/catalog/skus')
      .then(response => response.json())
      .then(data => {
        setSkus(data);
        if (data.length > 0) {
          setSelectedSku(data[0].id);
          setExchange(data[0].exchange);
        }
      })
      .catch(error => {
        console.error('Error fetching SKUs:', error);
        setMessage('Failed to load available products');
        setMessageType('error');
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    
    try {
      const response = await fetch('/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey(),
        },
        body: JSON.stringify({
          skuId: selectedSku,
          exchange,
          pair,
          orderRef,
          wallet,
          paymentMethod,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(`Order created successfully! Order ID: ${data.orderId}`);
        setMessageType('success');
        // Reset form
        setOrderRef('');
        setWallet('');
        setPaymentMethod('');
      } else {
        setMessage(data.message || 'Failed to create order');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      setMessage('An error occurred while creating your order');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const generateIdempotencyKey = () => {
    return `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const selectedSkuData = skus.find(sku => sku.id === selectedSku);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">Purchase Insurance</h1>
      
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          messageType === 'success' 
            ? 'bg-green-900 text-green-200' 
            : 'bg-red-900 text-red-200'
        }`}>
          {message}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Product Details</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Insurance Plan
            </label>
            <select 
              value={selectedSku} 
              onChange={(e) => {
                setSelectedSku(e.target.value);
                const sku = skus.find(s => s.id === e.target.value);
                if (sku) setExchange(sku.exchange);
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
            >
              {skus.map(sku => (
                <option key={sku.id} value={sku.id}>
                  {sku.title} - ${sku.premium} premium, ${sku.payout} coverage
                </option>
              ))}
            </select>
          </div>
          
          {selectedSkuData && (
            <div className="bg-slate-700 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-medium text-white mb-2">Plan Details</h3>
              <div className="space-y-2 text-slate-300">
                <p><span className="font-medium">Premium:</span> ${selectedSkuData.premium}</p>
                <p><span className="font-medium">Coverage:</span> ${selectedSkuData.payout}</p>
                <p><span className="font-medium">Exchange:</span> {selectedSkuData.exchange}</p>
                <p><span className="font-medium">Duration:</span> 24 hours</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Order Information</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Exchange
              </label>
              <input 
                type="text" 
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                required
                readOnly
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Trading Pair
              </label>
              <input 
                type="text" 
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                placeholder="e.g., BTC/USDT"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                required
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Order Reference
              </label>
              <input 
                type="text" 
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                placeholder="Exchange order ID"
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
                placeholder="Your wallet address"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                required
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Method
              </label>
              <select 
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                required
              >
                <option value="">Select payment method</option>
                <option value="usdc">USDC</option>
                <option value="usdt">USDT</option>
                <option value="eth">ETH</option>
              </select>
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              {isLoading ? 'Processing...' : 'Purchase Insurance'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
