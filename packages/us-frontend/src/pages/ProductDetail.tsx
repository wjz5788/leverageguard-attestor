import React, { useEffect, useState } from 'react';
import { getSkus, type Sku } from '../services/catalog';

export function ProductDetailPage() {
  const [sku, setSku] = useState<Sku | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        // Get the SKU ID from URL path
        const pathParts = window.location.pathname.split('/');
        const productId = pathParts[pathParts.length - 1];
        
        const skus = await getSkus();
        const foundSku = skus.find(s => s.id === productId);
        if (foundSku) {
          setSku(foundSku);
        } else {
          setError('Product not found');
        }
      } catch (err) {
        setError('Failed to load product details');
        console.error('Error loading product:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, []);

  const handleBuyNow = () => {
    window.location.href = '/verify';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (error || !sku) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-4">{error || 'Product not found'}</div>
          <a href="/products" className="text-indigo-400 hover:text-indigo-300 underline">
            Back to Products
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <div className="mb-8">
          <nav className="flex items-center space-x-2 text-sm">
            <a href="/products" className="text-slate-400 hover:text-slate-300">Products</a>
            <span className="text-slate-600">/</span>
            <span className="text-white">{sku.title}</span>
          </nav>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Product Header */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">{sku.title}</h1>
                <p className="text-slate-400">Leveraged trading protection for {sku.exchange}</p>
              </div>
              <span className="px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-full text-sm font-medium">
                {sku.exchange}
              </span>
            </div>

            {/* Pricing */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-slate-900/50 rounded-xl p-6">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Premium</h3>
                <div className="text-3xl font-bold text-white">${(sku.premium / 100).toFixed(2)}</div>
                <p className="text-sm text-slate-500 mt-1">One-time payment</p>
              </div>
              <div className="bg-slate-900/50 rounded-xl p-6">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Coverage Amount</h3>
                <div className="text-3xl font-bold text-emerald-400">${(sku.payout / 100).toFixed(2)}</div>
                <p className="text-sm text-slate-500 mt-1">Maximum payout</p>
              </div>
            </div>

            <button
              onClick={handleBuyNow}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 transform hover:-translate-y-0.5"
            >
              Purchase Insurance
            </button>
          </div>

          {/* Product Details */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* Coverage Details */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Coverage Details</h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Coverage Period:</span>
                  <span className="text-white">24 Hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Exchange:</span>
                  <span className="text-white">{sku.exchange}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payout Currency:</span>
                  <span className="text-white">USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Claim Processing:</span>
                  <span className="text-white">Automatic</span>
                </div>
              </div>
            </div>

            {/* Key Features */}
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Key Features</h2>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  <span className="text-slate-300">Instant payout in USDC</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  <span className="text-slate-300">24-hour coverage period</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  <span className="text-slate-300">Automatic claim processing</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  <span className="text-slate-300">On-chain verification</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3"></div>
                  <span className="text-slate-300">Base network support</span>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-8 mt-8">
            <h2 className="text-2xl font-semibold text-white mb-6">How It Works</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold">1</span>
                </div>
                <h3 className="text-lg font-medium text-indigo-300 mb-2">Connect Wallet</h3>
                <p className="text-slate-400 text-sm">Connect your MetaMask wallet and ensure you're on Base network.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold">2</span>
                </div>
                <h3 className="text-lg font-medium text-indigo-300 mb-2">Pay Premium</h3>
                <p className="text-slate-400 text-sm">Pay the insurance premium in USDC to activate your coverage.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold">3</span>
                </div>
                <h3 className="text-lg font-medium text-indigo-300 mb-2">Trade Protected</h3>
                <p className="text-slate-400 text-sm">Your leveraged position is now protected against liquidation.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold">4</span>
                </div>
                <h3 className="text-lg font-medium text-indigo-300 mb-2">Automatic Payout</h3>
                <p className="text-slate-400 text-sm">If liquidation occurs, receive automatic payout in USDC.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-8">
            <button
              onClick={handleBuyNow}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-4 px-12 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 transform hover:-translate-y-0.5"
            >
              Get Insurance Now
            </button>
            <p className="text-slate-500 text-sm mt-3">
              Secure your leveraged trading position today
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}