import React, { useState, useEffect } from 'react';
import { fetchOrderHistory, type OrderHistoryItem } from '../services/order';

export function OrderHistoryPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress.trim()) {
      setError('Please enter a wallet address');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const history = await fetchOrderHistory(walletAddress.trim());
      setOrders(history);
    } catch (err) {
      setError('Failed to fetch order history. Please try again.');
      console.error('Error fetching order history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return (amount / 100).toFixed(2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">Order History</h1>
      
      <div className="bg-slate-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-4">Search Orders</h2>
        
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1">
            <input 
              type="text" 
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter wallet address"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-2 px-6 rounded transition-colors"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-4 bg-red-900 text-red-200 rounded-lg">
            {error}
          </div>
        )}
      </div>
      
      {orders.length > 0 ? (
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Order History</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Exchange</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Pair</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Premium</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Payout</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">{order.id.substring(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{order.exchange}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{order.pair}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">${formatCurrency(order.premium)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">${formatCurrency(order.payout)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        order.status === 'created' ? 'bg-green-900 text-green-200' :
                        order.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !isLoading && walletAddress ? (
        <div className="bg-slate-800 rounded-lg p-6 text-center">
          <p className="text-slate-300">No orders found for this wallet address.</p>
        </div>
      ) : null}
    </div>
  );
}