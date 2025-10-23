import React, { useEffect, useState } from 'react';
import { initHome } from './homeInit';
import { getSkus, type Sku } from '../services/catalog';

export function HomePage() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load products for preview
    getSkus()
      .then((data) => {
        setSkus(data.slice(0, 3)); // Show max 3 products on homepage
      })
      .catch((error) => {
        console.error('Failed to load products for homepage:', error);
        // When the homepage fails to load, do not display errors, just hide the product preview
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">LiqPass</h1>
      <p className="text-xl text-slate-300 mb-8">
        On-chain liquidation insurance for leveraged traders.
      </p>
      
      {/* MetaMask Wallet Connection Area */}
      <div className="bg-slate-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-4">Connect Wallet</h2>
        <p className="text-slate-300 mb-4">
          Connect your MetaMask wallet to get started with Base network USDC payments.
        </p>
        <div data-wallet-slot className="mb-4"></div>
        <div data-wallet-status className="text-sm text-slate-400"></div>
        <div data-signature-preview className="mt-2 text-xs text-slate-500 font-mono break-all"></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Protection</h2>
          <p className="text-slate-300">
            Get insurance coverage for your leveraged trading positions to protect against liquidation risks.
          </p>
        </div>
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Fast Claims</h2>
          <p className="text-slate-300">
            Submit evidence of liquidation and receive automated payouts through smart contracts.
          </p>
        </div>
      </div>
      
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-slate-300">
          <li>Purchase insurance for your leveraged position</li>
          <li>Trade normally on your preferred exchange</li>
          <li>If liquidation occurs, submit evidence through our platform</li>
          <li>Receive automated payout to your wallet</li>
        </ol>
      </div>
      
      <div className="mt-8 text-center">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a 
            href="/products" 
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/40"
          >
            View Products
          </a>
          <a 
            href="/verify" 
            className="inline-flex items-center justify-center rounded-full border-2 border-white/20 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-white/10 hover:border-white/30"
          >
            Get Started
          </a>
        </div>
      </div>

      {/* Products Preview Section */}
      <div className="py-16 bg-slate-800/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Available Insurance Products</h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Choose from our curated selection of insurance products for major exchanges
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {loading ? (
              <div className="col-span-full text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading products...</p>
              </div>
            ) : skus.length > 0 ? (
              skus.slice(0, 3).map((sku) => (
                <div key={sku.id} className="bg-slate-900/50 rounded-xl border border-slate-700 p-6 hover:border-indigo-500 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{sku.title}</h3>
                    <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                      {sku.exchange}
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Premium:</span>
                      <span className="text-white">${(sku.premium / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Coverage:</span>
                      <span className="text-emerald-400">${(sku.payout / 100).toFixed(2)}</span>
                    </div>
                  </div>
                  <a
                    href={`/product/${sku.id}`}
                    className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-lg transition-colors"
                  >
                    View Details
                  </a>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-8">
                <p className="text-slate-400">No products available at the moment.</p>
              </div>
            )}
          </div>

          <div className="text-center mt-8">
            <a
              href="/products"
              className="inline-flex items-center text-indigo-400 hover:text-indigo-300 font-medium"
            >
              View All Products →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
