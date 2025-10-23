import React, { useState, useCallback } from 'react';
import QuoteCalculator, { QuoteData } from '../components/QuoteCalculator';

const QuoteDemo: React.FC = () => {
  const [quoteHistory, setQuoteHistory] = useState<QuoteData[]>([]);
  
  const handleQuoteGenerated = useCallback((quote: QuoteData) => {
    setQuoteHistory(prev => [quote, ...prev.slice(0, 9)]); // Keep only last 10 quotes
  }, []);
  
  const formatCurrency = (amount: number): string => {
    return amount.toFixed(2);
  };
  
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString('en-US');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quote Calculator Demo</h1>
          <p className="text-gray-600">Interactive Quote Calculation Tool</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Calculator Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quote Calculator</h2>
            <QuoteCalculator onQuoteGenerated={handleQuoteGenerated} />
          </div>
          
          {/* History Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">History</h2>
            {quoteHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No quote history</p>
                <p className="text-sm mt-2">Generate quotes using the calculator to view history</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {quoteHistory.map((quote) => (
                  <div key={quote.id} className="border border-gray-200 rounded-md p-3 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">
                          {formatCurrency(quote.principal)} USDT × {quote.leverage}x
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(quote.expiresAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-600 font-medium">
                          Premium: {formatCurrency(quote.premium)} USDT
                        </div>
                        <div className="text-blue-600 font-medium">
                          Payout: {formatCurrency(quote.payout)} USDT
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Info Section */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-medium text-gray-900 mb-2">Real-time Calculation</h3>
              <p className="text-sm text-gray-600">
                Enter principal and leverage to instantly get premium and payout calculations
              </p>
            </div>
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-medium text-gray-900 mb-2">Data Validation</h3>
              <p className="text-sm text-gray-600">
                Automatically validates input data ranges to ensure accurate results
              </p>
            </div>
            <div className="border border-gray-200 rounded-md p-4">
              <h3 className="font-medium text-gray-900 mb-2">History Tracking</h3>
              <p className="text-sm text-gray-600">
                Saves the last 10 calculations for easy comparison and reference
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteDemo;