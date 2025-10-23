import React, { useState, useCallback } from 'react';

// Constants from the original code
const MIN_PRINCIPAL = 50;
const MAX_PRINCIPAL = 500;
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 100;
const PREMIUM_RATE = 0.02; // 2% premium rate
const PAYOUT_RATE = 0.85; // 85% payout rate

// Core calculation functions
const calcPremium = (principal: number, leverage: number): number => {
  return principal * leverage * PREMIUM_RATE;
};

const calcPayout = (principal: number, leverage: number): number => {
  return principal * leverage * PAYOUT_RATE;
};

const calcPremiumRate = (principal: number, leverage: number): number => {
  return PREMIUM_RATE * 100;
};

const calcPayoutRate = (principal: number, leverage: number): number => {
  return PAYOUT_RATE * 100;
};

interface QuoteData {
  id: string;
  principal: number;
  leverage: number;
  premium: number;
  payout: number;
  premiumRate: number;
  payoutRate: number;
  expiresAt: Date;
}

interface QuoteCalculatorProps {
  onQuoteGenerated?: (quote: QuoteData) => void;
  className?: string;
}

const QuoteCalculator: React.FC<QuoteCalculatorProps> = ({ 
  onQuoteGenerated, 
  className = '' 
}) => {
  const [principal, setPrincipal] = useState<string>('');
  const [leverage, setLeverage] = useState<string>('');
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const validateInputs = useCallback((principalValue: number, leverageValue: number): string => {
    if (isNaN(principalValue) || isNaN(leverageValue)) {
      return 'Please enter valid numbers';
    }
    
    if (principalValue < MIN_PRINCIPAL || principalValue > MAX_PRINCIPAL) {
      return `Principal must be between ${MIN_PRINCIPAL}-${MAX_PRINCIPAL} USDT`;
    }
    
    if (leverageValue < MIN_LEVERAGE || leverageValue > MAX_LEVERAGE) {
      return `Leverage must be between ${MIN_LEVERAGE}-${MAX_LEVERAGE}x`;
    }
    
    return '';
  }, []);

  const generateQuote = useCallback(async () => {
    const principalValue = parseFloat(principal);
    const leverageValue = parseFloat(leverage);
    
    const validationError = validateInputs(principalValue, leverageValue);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const premium = calcPremium(principalValue, leverageValue);
      const payout = calcPayout(principalValue, leverageValue);
      const premiumRate = calcPremiumRate(principalValue, leverageValue);
      const payoutRate = calcPayoutRate(principalValue, leverageValue);
      
      const quoteData: QuoteData = {
        id: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        principal: principalValue,
        leverage: leverageValue,
        premium,
        payout,
        premiumRate,
        payoutRate,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };
      
      setQuote(quoteData);
      onQuoteGenerated?.(quoteData);
    } catch (err) {
      setError('Failed to generate quote, please try again');
    } finally {
      setLoading(false);
    }
  }, [principal, leverage, validateInputs, onQuoteGenerated]);

  const formatCurrency = (amount: number): string => {
    return amount.toFixed(2);
  };

  const formatPercentage = (rate: number): string => {
    return rate.toFixed(1);
  };

  const formatExpiry = (date: Date): string => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    return `Expires in ${minutes} minutes`;
  };

  return (
    <div className={`quote-calculator ${className}`}>
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Quote Calculator</h2>
        
        {/* Input Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="principal" className="block text-sm font-medium text-gray-700 mb-2">
              Principal (USDT)
            </label>
            <input
              id="principal"
              type="number"
              min={MIN_PRINCIPAL}
              max={MAX_PRINCIPAL}
              step="0.01"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder={`${MIN_PRINCIPAL}-${MAX_PRINCIPAL}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Range: {MIN_PRINCIPAL}-{MAX_PRINCIPAL} USDT
            </p>
          </div>
          
          <div>
            <label htmlFor="leverage" className="block text-sm font-medium text-gray-700 mb-2">
              Leverage
            </label>
            <input
              id="leverage"
              type="number"
              min={MIN_LEVERAGE}
              max={MAX_LEVERAGE}
              step="0.1"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              placeholder={`${MIN_LEVERAGE}-${MAX_LEVERAGE}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Range: {MIN_LEVERAGE}-{MAX_LEVERAGE}x
            </p>
          </div>
          
          <button
            onClick={generateQuote}
            disabled={loading || !principal || !leverage}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Calculating...' : 'Get Quote'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="text-red-800">
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quote Results */}
        {quote && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-lg font-semibold text-blue-800 mb-3">Quote Details</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded-md p-3">
                  <div className="text-sm text-gray-600">Quote ID</div>
                  <div className="text-sm font-mono text-gray-800 break-all">{quote.id}</div>
                </div>
                
                <div className="bg-white rounded-md p-3">
                  <div className="text-sm text-gray-600">Validity</div>
                  <div className="text-sm font-medium text-gray-800">{formatExpiry(quote.expiresAt)}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-md p-4">
                  <div className="text-sm text-gray-600 mb-1">Premium</div>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(quote.premium)} USDT</div>
                  <div className="text-xs text-gray-500">Rate: {formatPercentage(quote.premiumRate)}%</div>
                </div>
                
                <div className="bg-white rounded-md p-4">
                  <div className="text-sm text-gray-600 mb-1">Payout</div>
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(quote.payout)} USDT</div>
                  <div className="text-xs text-gray-500">Rate: {formatPercentage(quote.payoutRate)}%</div>
                </div>
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className="bg-gray-50 rounded-md p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Calculation Summary</h4>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Principal: {formatCurrency(quote.principal)} USDT × Leverage: {quote.leverage}x</div>
                <div>Premium = {formatCurrency(quote.principal)} × {quote.leverage} × {formatPercentage(PREMIUM_RATE)}% = {formatCurrency(quote.premium)} USDT</div>
                <div>Payout = {formatCurrency(quote.principal)} × {quote.leverage} × {formatPercentage(PAYOUT_RATE)}% = {formatCurrency(quote.payout)} USDT</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteCalculator;
export type { QuoteData, QuoteCalculatorProps };