import React from 'react';

export function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">Help & FAQ</h1>
      
      <div className="space-y-6">
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">What is LiqPass?</h2>
          <p className="text-slate-300">
            LiqPass is an on-chain liquidation insurance platform that provides protection for leveraged traders 
            against liquidation risks on centralized exchanges.
          </p>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">How does the insurance work?</h2>
          <p className="text-slate-300 mb-3">
            When you purchase insurance through LiqPass:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li>You pay a premium based on your position size and duration</li>
            <li>We record your insurance policy on-chain</li>
            <li>If your position gets liquidated, you can submit evidence</li>
            <li>Once verified, you receive an automated payout to your wallet</li>
          </ul>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">What evidence is required for a claim?</h2>
          <p className="text-slate-300 mb-3">
            To submit a successful claim, you'll need to provide:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li>Exchange transaction ID showing the liquidation</li>
            <li>Screenshot or API data showing the liquidation event</li>
            <li>Timestamp of the liquidation</li>
            <li>Your wallet address that was used for the insurance purchase</li>
          </ul>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">Which exchanges are supported?</h2>
          <p className="text-slate-300">
            Currently, we support major exchanges including Binance and OKX. We're continuously working to add 
            support for more exchanges.
          </p>
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">How are payouts processed?</h2>
          <p className="text-slate-300">
            Payouts are processed automatically through our smart contract once your claim is verified. 
            The payout amount is sent directly to your wallet address in USDC or other supported stablecoins.
          </p>
        </div>
      </div>
      
      <div className="mt-8 bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Still have questions?</h2>
        <p className="text-slate-300 mb-4">
          If you couldn't find the answer to your question, please don't hesitate to contact our support team.
        </p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">
          Contact Support
        </button>
      </div>
    </div>
  );
}
