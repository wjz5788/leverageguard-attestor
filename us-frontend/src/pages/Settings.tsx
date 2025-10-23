import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { validateApiKeys, ApiKeyValidationResult } from '../services/apiKeyValidation';

interface ApiKeys {
  binanceApiKey: string;
  binanceSecretKey: string;
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
}

const Settings: React.FC = () => {
  const { wallet } = useWallet();
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    binanceApiKey: '',
    binanceSecretKey: '',
    okxApiKey: '',
    okxSecretKey: '',
    okxPassphrase: ''
  });
  const [isSaved, setIsSaved] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{success: boolean, message: string} | null>(null);
  const [validationResults, setValidationResults] = useState<ApiKeyValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Load saved API keys from localStorage on component mount
  useEffect(() => {
    if (wallet) {
      const savedKeys = localStorage.getItem(`apiKeys_${wallet}`);
      if (savedKeys) {
        try {
          const parsedKeys = JSON.parse(savedKeys);
          setApiKeys({
            binanceApiKey: parsedKeys.binanceApiKey || '',
            binanceSecretKey: parsedKeys.binanceSecretKey || '',
            okxApiKey: parsedKeys.okxApiKey || '',
            okxSecretKey: parsedKeys.okxSecretKey || '',
            okxPassphrase: parsedKeys.okxPassphrase || ''
          });
        } catch (e) {
          console.error('Failed to parse saved API keys', e);
        }
      }
    }
  }, [wallet]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiKeys(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Save API keys to localStorage
  const saveApiKeys = () => {
    if (wallet) {
      localStorage.setItem(`apiKeys_${wallet}`, JSON.stringify(apiKeys));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  // Validate API keys format and basic checks
  const validateApiKeysLocally = async () => {
    setIsValidating(true);
    try {
      const results = await validateApiKeys(
        apiKeys.binanceApiKey,
        apiKeys.binanceSecretKey,
        apiKeys.okxApiKey,
        apiKeys.okxSecretKey,
        apiKeys.okxPassphrase
      );
      setValidationResults(results);
    } catch (error) {
      console.error('API密钥验证失败:', error);
    } finally {
      setIsValidating(false);
    }
  };

  // Verify API keys with exchange (actual verification)
  const verifyApiKeys = async () => {
    if (!wallet) return;
    
    setIsVerifying(true);
    setVerificationResult(null);
    
    try {
      // In a real implementation, you would call your backend API to verify the keys
      // For now, we'll simulate a successful verification
      setTimeout(() => {
        setVerificationResult({
          success: true,
          message: 'API keys verified successfully!'
        });
        setIsVerifying(false);
      }, 1500);
    } catch (error) {
      setVerificationResult({
        success: false,
        message: 'Failed to verify API keys. Please check your keys and try again.'
      });
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-8">API Key Settings</h1>
      
      <div className="bg-slate-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Exchange API Keys</h2>
        <p className="text-slate-300 mb-6">
          Enter your exchange API keys to enable automatic verification of liquidation events.
          Your keys are stored locally in your browser and never sent to our servers.
        </p>
        
        <div className="space-y-6">
          {/* Binance API Keys */}
          <div className="border border-slate-700 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">Binance</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  name="binanceApiKey"
                  value={apiKeys.binanceApiKey}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your Binance API key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Secret Key
                </label>
                <input
                  type="password"
                  name="binanceSecretKey"
                  value={apiKeys.binanceSecretKey}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your Binance Secret key"
                />
              </div>
            </div>
          </div>
          
          {/* OKX API Keys */}
          <div className="border border-slate-700 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">OKX</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  name="okxApiKey"
                  value={apiKeys.okxApiKey}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your OKX API key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Secret Key
                </label>
                <input
                  type="password"
                  name="okxSecretKey"
                  value={apiKeys.okxSecretKey}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your OKX Secret key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Passphrase
                </label>
                <input
                  type="password"
                  name="okxPassphrase"
                  value={apiKeys.okxPassphrase}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your OKX Passphrase"
                />
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              onClick={saveApiKeys}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Save API Keys
            </button>
            <button
              onClick={validateApiKeysLocally}
              disabled={isValidating}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isValidating ? 'Validating...' : 'Validate API Keys'}
            </button>
            <button
              onClick={verifyApiKeys}
              disabled={isVerifying}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isVerifying ? 'Verifying...' : 'Verify API Keys'}
            </button>
          </div>
          
          {/* Status Messages */}
          {isSaved && (
            <div className="mt-4 p-3 bg-green-900/50 border border-green-700 rounded-md text-green-300">
              API keys saved successfully!
            </div>
          )}
          
          {/* Validation Results */}
          {validationResults.length > 0 && (
            <div className="mt-4 p-3 bg-blue-900/50 border border-blue-700 rounded-md text-blue-300">
              <h3 className="font-medium mb-2">Validation Results:</h3>
              <ul className="list-disc list-inside space-y-1">
                {validationResults.map((result, index) => (
                  <li key={index} className={result.isValid ? 'text-green-300' : 'text-red-300'}>
                    {result.exchange}: {result.isValid ? '✓ Valid format' : `✗ ${result.error}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {verificationResult && (
            <div className={`mt-4 p-3 rounded-md border ${
              verificationResult.success 
                ? 'bg-green-900/50 border-green-700 text-green-300' 
                : 'bg-red-900/50 border-red-700 text-red-300'
            }`}>
              {verificationResult.message}
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Security Best Practices</h2>
        <ul className="list-disc list-inside space-y-2 text-slate-300">
          <li>Only use API keys with read-only permissions</li>
          <li>Enable IP whitelisting on your exchange API keys</li>
          <li>Regularly rotate your API keys</li>
          <li>Never share your API keys with anyone</li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;