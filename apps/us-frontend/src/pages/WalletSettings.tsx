import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { BASE_MAINNET, BASE_SEPOLIA } from '../constants';

interface WalletSettingsProps {
  t: (key: string) => string;
}

export const WalletSettings: React.FC<WalletSettingsProps> = ({ t }) => {
  const navigate = useNavigate();
  const { address, chainId, onBase, busy, message, connectWallet, switchToBase, disconnectWallet } = useWallet();
  const [showTestnetWarning, setShowTestnetWarning] = useState(false);

  // 获取当前网络名称
  const getNetworkName = () => {
    if (chainId.toLowerCase() === BASE_MAINNET.chainId.toLowerCase()) {
      return 'Base 主网';
    }
    if (chainId.toLowerCase() === BASE_SEPOLIA.chainId.toLowerCase()) {
      return 'Base Sepolia 测试网';
    }
    return '未知网络';
  };

  // 处理切换到测试网
  const handleSwitchToTestnet = () => {
    setShowTestnetWarning(true);
  };

  // 确认切换到测试网
  const confirmSwitchToTestnet = () => {
    setShowTestnetWarning(false);
    switchToBase(true);
  };

  // 处理切换到主网
  const handleSwitchToMainnet = () => {
    switchToBase(false);
  };

  return (
    <div className="container mx-auto p-4 min-h-screen bg-purple-50">
      <header className="sticky top-0 z-10 bg-purple-50/80 backdrop-blur border-b border-purple-200">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/profile" className="text-sm text-purple-700 hover:text-purple-900">
              个人中心
            </Link>
            <span className="text-sm text-purple-400">/</span>
            <span className="text-sm font-medium text-purple-900">钱包设置</span>
          </div>
          <h1 className="text-2xl font-bold text-purple-900">钱包设置</h1>
        </div>
        {message && (
          <div className="max-w-5xl mx-auto px-4 pb-3 text-sm text-purple-700">
            {message}
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* 钱包状态卡片 */}
          <Card className="p-6 border-purple-200">
            <h2 className="text-xl font-semibold text-purple-900 mb-4">钱包连接状态</h2>
            
            {!address ? (
              <div className="space-y-4 text-center py-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600">您还未连接钱包</p>
                <Button 
                  onClick={connectWallet} 
                  disabled={busy}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {busy ? "连接中..." : "连接钱包"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 钱包地址 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">钱包地址</label>
                    <div className="flex items-center justify-between bg-purple-50 p-3 rounded-lg border border-purple-100">
                      <span className="font-mono text-sm text-purple-900 break-all">
                        {address.slice(0, 8)}...{address.slice(-6)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button 
                          onClick={() => navigator.clipboard.writeText(address)}
                          size="sm"
                          className="bg-purple-100 hover:bg-purple-200 text-purple-800"
                        >
                          复制
                        </Button>
                        <Button 
                          onClick={disconnectWallet}
                          size="sm"
                          className="bg-red-100 hover:bg-red-200 text-red-800"
                        >
                          退出
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* 当前网络 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">当前网络</label>
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={onBase ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                          {onBase ? "已连接" : "未连接"}
                        </Badge>
                        <span className="text-sm font-medium text-purple-900">{getNetworkName()}</span>
                      </div>
                      
                      {chainId.toLowerCase() !== BASE_MAINNET.chainId.toLowerCase() && (
                        <Button 
                          onClick={handleSwitchToMainnet}
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          切换到主网
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* 网络切换选项 */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-lg font-medium text-purple-900">网络切换</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg border ${onBase ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Base 主网</h4>
                            <p className="text-xs text-gray-500">推荐用于生产环境</p>
                          </div>
                        </div>
                        {onBase && (
                          <Badge className="bg-green-100 text-green-800">当前</Badge>
                        )}
                      </div>
                      <Button 
                        onClick={handleSwitchToMainnet}
                        disabled={onBase || busy}
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {busy ? "切换中..." : "切换网络"}
                      </Button>
                    </div>
                    
                    <div className={`p-4 rounded-lg border ${chainId.toLowerCase() === BASE_SEPOLIA.chainId.toLowerCase() ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Base Sepolia 测试网</h4>
                            <p className="text-xs text-gray-500">用于开发和测试</p>
                          </div>
                        </div>
                        {chainId.toLowerCase() === BASE_SEPOLIA.chainId.toLowerCase() && (
                          <Badge className="bg-blue-100 text-blue-800">当前</Badge>
                        )}
                      </div>
                      <Button 
                        onClick={handleSwitchToTestnet}
                        disabled={chainId.toLowerCase() === BASE_SEPOLIA.chainId.toLowerCase() || busy}
                        size="sm"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {busy ? "切换中..." : "切换网络"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
          
          {/* 钱包设置说明 */}
          <Card className="p-6 border-purple-200">
            <h2 className="text-lg font-semibold text-purple-900 mb-3">钱包设置说明</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <div className="mt-1 min-w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>LiqPass 目前仅支持在 Base 网络上使用，推荐使用 MetaMask 钱包</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 min-w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>所有交易均在链上进行，请确保您的钱包中有足够的 ETH 支付 gas 费用</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 min-w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>使用测试网时，您可以通过水龙头获取测试代币进行测试</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 min-w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span>保护好您的钱包私钥和助记词，避免泄露给他人</span>
              </li>
            </ul>
          </Card>
        </div>
      </main>
      
      {/* 测试网切换确认弹窗 */}
      {showTestnetWarning && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">切换到测试网</h3>
            <p className="text-gray-700 mb-4">
              您即将切换到 Base Sepolia 测试网。请注意，测试网上的交易不会产生真实资产变动，仅用于开发和测试目的。
            </p>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => setShowTestnetWarning(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 flex-1"
              >
                取消
              </Button>
              <Button 
                onClick={confirmSwitchToTestnet}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
              >
                确认切换
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};