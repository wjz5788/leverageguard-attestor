import React, { useState, useEffect } from 'react';
import { createClaim, type ClaimPayload, getClaimStatus, mockGetClaimStatus, type ClaimStatusResponse } from '../services/claim';
import { verifyOrder, mockVerifyOrder } from '../services/verification';
import { submitPayout, mockSubmitPayout, type PayoutRequest } from '../services/payout';

export function ClaimPage() {
  const [orderId, setOrderId] = useState('');
  const [wallet, setWallet] = useState('');
  const [evidenceHash, setEvidenceHash] = useState('');
  const [reason, setReason] = useState('liquidation');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isProcessingPayout, setIsProcessingPayout] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [claimResult, setClaimResult] = useState<any>(null);
  const [payoutResult, setPayoutResult] = useState<any>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatusResponse | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // 自动连接钱包功能
  useEffect(() => {
    // 检查是否有已连接的钱包
    const connectedWallet = localStorage.getItem('connectedWallet');
    if (connectedWallet) {
      setWallet(connectedWallet);
    }
  }, []);

  const handleConnectWallet = async () => {
    try {
      // 模拟连接小狐狸钱包
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        if (accounts.length > 0) {
          const walletAddress = accounts[0];
          setWallet(walletAddress);
          localStorage.setItem('connectedWallet', walletAddress);
          setMessage('钱包连接成功！');
          setMessageType('success');
        }
      } else {
        setMessage('请安装MetaMask钱包');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      setMessage('钱包连接失败，请重试');
      setMessageType('error');
    }
  };

  const handleVerifyOrder = async () => {
    if (!orderId.trim()) {
      setMessage('请输入订单号');
      setMessageType('error');
      return;
    }

    if (!wallet.trim()) {
      setMessage('请先连接钱包');
      setMessageType('error');
      return;
    }

    setIsVerifying(true);
    setMessage('');
    setVerificationResult(null);

    try {
      // 在开发环境中使用mock验证，生产环境使用真实API
      const verifyFunction = process.env.NODE_ENV === 'development' ? mockVerifyOrder : verifyOrder;
      
      const result = await verifyFunction({
        orderRef: orderId,
        wallet: wallet,
        exchange: 'binance', // 默认交易所，实际应用中应该让用户选择
        pair: 'BTCUSDT' // 默认交易对
      });

      setVerificationResult(result);
      
      if (result.isValid) {
        setMessage('订单验证通过！');
        setMessageType('success');
        // 自动填充证据哈希（实际应用中应该从验证结果中获取）
        setEvidenceHash(`evidence_${orderId}_${Date.now()}`);
      } else {
        setMessage(`订单验证失败：${result.errorMessage || '订单不存在或不符合理赔条件'}`);
        setMessageType('error');
      }
    } catch (error) {
      console.error('Error verifying order:', error);
      setMessage('订单验证失败，请检查订单号是否正确');
      setMessageType('error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!verificationResult?.isValid) {
      setMessage('请先验证订单');
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    setMessage('');
    
    try {
      const payload: ClaimPayload = {
        orderId: orderId.trim(),
        wallet: wallet.trim(),
        evidenceHash: evidenceHash.trim(),
        reason,
      };
      
      const result = await createClaim(payload);
      
      setClaimResult(result);
      setMessage(`理赔提交成功！理赔编号：${result.claimId}`);
      setMessageType('success');
      
      // 自动触发赔付（模拟管理员操作）
      await handleProcessPayout(result.claimId);
    } catch (error) {
      console.error('Error submitting claim:', error);
      setMessage(`理赔提交失败：${error.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessPayout = async (claimId: string) => {
    setIsProcessingPayout(true);
    setMessage('正在处理赔付...');
    
    try {
      // 在开发环境中使用mock赔付，生产环境使用真实API
      const payoutFunction = process.env.NODE_ENV === 'development' ? mockSubmitPayout : submitPayout;
      
      const payoutRequest: PayoutRequest = {
        claimId: claimId,
      };
      
      const result = await payoutFunction(payoutRequest);
      
      setPayoutResult(result);
      setMessage(`赔付处理成功！交易哈希：${result.transactionHash}`);
      setMessageType('success');
    } catch (error) {
      console.error('Error processing payout:', error);
      setMessage(`赔付处理失败：${error.message}`);
      setMessageType('error');
    } finally {
      setIsProcessingPayout(false);
    }
  };

  // 查询理赔状态
  const handleCheckClaimStatus = async (claimId: string) => {
    setIsCheckingStatus(true);
    setClaimStatus(null);
    
    try {
      let result;
      if (process.env.NODE_ENV === 'development') {
        result = await mockGetClaimStatus(claimId);
      } else {
        result = await getClaimStatus(claimId);
      }
      
      setClaimStatus(result);
      console.log('理赔状态查询成功:', result);
    } catch (error) {
      console.error('理赔状态查询失败:', error);
      setClaimStatus({ 
        claimId: claimId,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '未知错误'
      } as ClaimStatusResponse);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-6">Submit a Claim</h1>
      
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${
          messageType === 'success' 
            ? 'bg-green-900 text-green-200' 
            : 'bg-red-900 text-red-200'
        }`}>
          {message}
        </div>
      )}
      
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">Claim Information</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Order ID
            </label>
            <input 
              type="text" 
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Enter your order ID"
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
              placeholder="Enter your wallet address"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Evidence Hash
            </label>
            <input 
              type="text" 
              value={evidenceHash}
              onChange={(e) => setEvidenceHash(e.target.value)}
              placeholder="Enter evidence hash"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Reason
            </label>
            <select 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            >
              <option value="liquidation">Liquidation</option>
              <option value="partial_liquidation">Partial Liquidation</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isLoading ? 'Submitting...' : 'Submit Claim'}
          </button>
        </form>
      </div>
      
      {/* 理赔结果展示 */}
      {claimResult && (
        <div className="mt-8 bg-green-900 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">理赔提交成功</h2>
          <div className="space-y-2 text-green-200">
            <p><strong>理赔编号：</strong>{claimResult.claimId}</p>
            <p><strong>提交时间：</strong>{new Date().toLocaleString()}</p>
            <p><strong>状态：</strong>已提交，等待处理</p>
          </div>
        </div>
      )}

      {/* 赔付结果展示 */}
      {payoutResult && (
        <div className="mt-8 bg-blue-900 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">赔付处理成功</h2>
          <div className="space-y-2 text-blue-200">
            <p><strong>理赔编号：</strong>{payoutResult.claimId}</p>
            <p><strong>收款地址：</strong>{payoutResult.recipient}</p>
            <p><strong>赔付金额：</strong>{payoutResult.amount} USDC</p>
            <p><strong>交易哈希：</strong>
              <a 
                href={`https://basescan.org/tx/${payoutResult.transactionHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:text-blue-100"
              >
                {payoutResult.transactionHash}
              </a>
            </p>
            <p><strong>状态：</strong>已支付</p>
          </div>
        </div>
      )}

      {/* 理赔状态查询区域 */}
      {claimResult && (
        <div className="mt-8 bg-purple-900 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-white">理赔状态查询</h2>
            <button
              onClick={() => handleCheckClaimStatus(claimResult.claimId)}
              disabled={isCheckingStatus}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed"
            >
              {isCheckingStatus ? '查询中...' : '查询状态'}
            </button>
          </div>
          
          {claimStatus && (
            <div className="mt-4 space-y-2 text-purple-200">
              <h3 className="text-xl font-semibold mb-2">当前状态:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p><strong>理赔ID:</strong> {claimStatus.claimId}</p>
                  <p><strong>订单ID:</strong> {claimStatus.orderId}</p>
                  <p><strong>钱包地址:</strong> {claimStatus.wallet}</p>
                </div>
                <div>
                  <p><strong>状态:</strong> 
                    <span className={`font-semibold ${
                      claimStatus.status === 'paid' ? 'text-green-400' :
                      claimStatus.status === 'approved' ? 'text-blue-400' :
                      claimStatus.status === 'pending' ? 'text-yellow-400' :
                      claimStatus.status === 'rejected' ? 'text-red-400' :
                      'text-gray-400'
                    }`}>
                      {claimStatus.status === 'paid' ? '已赔付' :
                       claimStatus.status === 'approved' ? '已批准' :
                       claimStatus.status === 'pending' ? '处理中' :
                       claimStatus.status === 'rejected' ? '已拒绝' :
                       claimStatus.status === 'error' ? '错误' : claimStatus.status}
                    </span>
                  </p>
                  <p><strong>创建时间:</strong> {claimStatus.createdAt}</p>
                </div>
              </div>
              
              {claimStatus.payoutAmount && (
                <p><strong>赔付金额:</strong> {claimStatus.payoutAmount} USDC</p>
              )}
              
              {claimStatus.transactionHash && (
                <p><strong>交易哈希:</strong> 
                  <a href={`https://basescan.org/tx/${claimStatus.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline ml-2">
                    {claimStatus.transactionHash.slice(0, 10)}...{claimStatus.transactionHash.slice(-8)}
                  </a>
                </p>
              )}
              
              {claimStatus.errorMessage && (
                <p className="text-red-400"><strong>错误信息:</strong> {claimStatus.errorMessage}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 流程说明 */}
      <div className="mt-8 bg-slate-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-white mb-4">理赔流程说明</h2>
        <ol className="list-decimal list-inside space-y-2 text-slate-300">
          <li>连接小狐狸钱包</li>
          <li>输入爆仓订单号并验证</li>
          <li>提交理赔申请</li>
          <li>系统自动处理赔付</li>
          <li>USDC赔付到您的钱包地址</li>
          <li>使用"查询状态"按钮跟踪理赔进度</li>
        </ol>
      </div>
    </div>
  );
}