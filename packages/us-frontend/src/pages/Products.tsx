import React, { useEffect, useState } from 'react';
import { getSkus, type Sku } from '../services/catalog';

export function ProductsPage() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSkus()
      .then(setSkus)
      .catch((error) => {
        console.error('Failed to load products:', error);
        setError(error.message || 'Failed to load products');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleBuyNow = (sku: Sku) => {
    // Navigate to verify page with pre-selected SKU
    window.location.href = '/verify';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <div className="mt-2 text-gray-400">Loading products...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-4">❌ Failed to load</div>
          <div className="text-gray-300 mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Insurance Products
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            Protect your leveraged trading positions with our on-chain liquidation insurance. 
            Choose from our curated selection of insurance products designed for major exchanges.
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          {skus.map((sku) => (
            <div key={sku.id} className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 hover:border-indigo-500 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10">
              {/* Product Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold text-white">
                    <a href={`/product/${sku.id}`} className="hover:text-indigo-300 transition-colors">
                      {sku.title}
                    </a>
                  </h3>
                  <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-sm rounded-full">
                    {sku.exchange}
                  </span>
                </div>
                <p className="text-slate-400 text-sm">
                  Protection for leveraged trading positions on {sku.exchange}
                </p>
              </div>

              {/* Coverage Details */}
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Premium:</span>
                  <span className="text-white font-semibold">${(sku.premium / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Coverage Amount:</span>
                  <span className="text-emerald-400 font-semibold">${(sku.payout / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Coverage Period:</span>
                  <span className="text-white">24 Hours</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-6">
                <div className="flex items-center text-sm text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  Instant payout in USDC
                </div>
                <div className="flex items-center text-sm text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  24-hour coverage period
                </div>
                <div className="flex items-center text-sm text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  Automatic claim processing
                </div>
                <div className="flex items-center text-sm text-slate-300">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  Base network support
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleBuyNow(sku)}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 transform hover:-translate-y-0.5"
              >
                Get Insurance Now
              </button>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {skus.length === 0 && (
          <div className="text-center py-12">
            <div className="text-slate-400 text-lg mb-4">No insurance products available at the moment.</div>
            <p className="text-slate-500">Please check back later or contact support.</p>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-16 bg-slate-800/30 rounded-2xl border border-slate-700 p-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-white mb-4">How It Works</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-indigo-300 mb-2">1. Choose Your Product</h3>
              <p className="text-slate-400">Select an insurance product based on your exchange and coverage needs.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-indigo-300 mb-2">2. Connect Wallet</h3>
              <p className="text-slate-400">Connect your MetaMask wallet and ensure you're on Base network.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-indigo-300 mb-2">3. Pay Premium</h3>
              <p className="text-slate-400">Pay the insurance premium in USDC to activate your coverage.</p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-indigo-300 mb-2">4. Automatic Protection</h3>
              <p className="text-slate-400">Your position is now protected. Claims are processed automatically.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}