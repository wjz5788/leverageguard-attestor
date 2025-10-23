import React, { useState, useEffect } from 'react';
import { submitVerification } from '../services/verify';
import type { ExchangeId, TradingPairId } from '../config/verification';
import { TRADING_PAIR_OPTIONS } from '../config/verification';

export function OrderVerificationPage() {
  const [orderId, setOrderId] = useState('');
  const [exchange, setExchange] = useState<ExchangeId>('Binance');
  const [pair, setPair] = useState('');
  const [wallet, setWallet] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [error, setError] = useState('');

  const exchanges: ExchangeId[] = ['Binance', 'OKX'];
  
  // 根据选择的交易所过滤可用的交易对
  const getAvailablePairs = () => {
    return TRADING_PAIR_OPTIONS.filter(pair => pair.exchangeId === exchange);
  };

  const handleVerifyOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setVerificationResult(null);

    try {
      const request = {
        exchange,
        pairId: pair as TradingPairId,
        orderId,
        wallet,
        skuCode: 'DAY_24H_FIXED',
        env: 'production',
        principal: 1000,
        leverage: 10,
      };

      const result = await submitVerification(request);
      setVerificationResult(result);
    } catch (err: any) {
      setError(err.message || '验证失败，请检查订单信息');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-8">订单验证</h1>
      
      <div className="bg-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">输入订单信息</h2>
        
        <form onSubmit={handleVerifyOrder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              交易所
            </label>
            <select 
              value={exchange} 
              onChange={(e) => setExchange(e.target.value as ExchangeId)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            >
              {exchanges.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              交易对
            </label>
            <select 
              value={pair} 
              onChange={(e) => setPair(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            >
              <option value="">选择交易对</option>
              {getAvailablePairs().map(p => (
                <option key={p.id} value={p.id}>{p.label.en}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              订单号
            </label>
            <input 
              type="text" 
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="请输入订单号"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              钱包地址
            </label>
            <input 
              type="text" 
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="请输入钱包地址"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? '验证中...' : '验证订单'}
          </button>
        </form>
      </div>
      
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}
      
      {verificationResult && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">验证结果</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-300">状态:</span>
              <span className={`font-medium ${
                verificationResult.status === 'ok' ? 'text-green-400' : 'text-red-400'
              }`}>
                {verificationResult.status === 'ok' ? '验证成功' : '验证失败'}
              </span>
            </div>
            
            {verificationResult.exchange && (
              <div className="flex justify-between">
                <span className="text-slate-300">交易所:</span>
                <span className="text-white">{verificationResult.exchange}</span>
              </div>
            )}
            
            {verificationResult.pair && (
              <div className="flex justify-between">
                <span className="text-slate-300">交易对:</span>
                <span className="text-white">{verificationResult.pair}</span>
              </div>
            )}
            
            {verificationResult.orderRef && (
              <div className="flex justify-between">
                <span className="text-slate-300">订单号:</span>
                <span className="text-white">{verificationResult.orderRef}</span>
              </div>
            )}
            
            {verificationResult.eligible !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-300">是否符合条件:</span>
                <span className={`font-medium ${
                  verificationResult.eligible ? 'text-green-400' : 'text-red-400'
                }`}>
                  {verificationResult.eligible ? '是' : '否'}
                </span>
              </div>
            )}
            
            {verificationResult.parsed && (
              <div className="mt-4 p-3 bg-slate-700 rounded-lg">
                <h4 className="text-sm font-medium text-slate-300 mb-2">订单详情</h4>
                <div className="space-y-1 text-sm">
                  {verificationResult.parsed.side && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">方向:</span>
                      <span className="text-white">{verificationResult.parsed.side}</span>
                    </div>
                  )}
                  {verificationResult.parsed.avgPx && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">平均价格:</span>
                      <span className="text-white">{verificationResult.parsed.avgPx}</span>
                    </div>
                  )}
                  {verificationResult.parsed.qty && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">数量:</span>
                      <span className="text-white">{verificationResult.parsed.qty}</span>
                    </div>
                  )}
                  {verificationResult.parsed.liqPx && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">强平价格:</span>
                      <span className="text-white">{verificationResult.parsed.liqPx}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {verificationResult.quote && (
              <div className="mt-4 p-3 bg-slate-700 rounded-lg">
                <h4 className="text-sm font-medium text-slate-300 mb-2">保险报价</h4>
                <div className="space-y-1 text-sm">
                  {verificationResult.quote.premium && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">保费:</span>
                      <span className="text-white">${verificationResult.quote.premium}</span>
                    </div>
                  )}
                  {verificationResult.quote.payoutCap && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">最高赔付:</span>
                      <span className="text-white">${verificationResult.quote.payoutCap}</span>
                    </div>
                  )}
                  {verificationResult.quote.currency && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">货币:</span>
                      <span className="text-white">{verificationResult.quote.currency}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}