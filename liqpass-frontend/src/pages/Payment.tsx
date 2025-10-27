import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { Dictionary } from '../types';

interface PaymentProps {
  t: Dictionary;
}

// 模拟支付链接数据
const mockPaymentData = {
  '1': {
    id: '1',
    product: '24h',
    symbol: 'BTCUSDT',
    amount: 20,
    duration: 24,
    description: '24小时BTC/USDT爆仓保险',
    features: [
      '24小时内有效',
      'BTC/USDT交易对',
      '固定赔付金额',
      '自动理赔'
    ]
  },
  '2': {
    id: '2',
    product: '7d',
    symbol: 'ETHUSDT',
    amount: 15,
    duration: 168,
    description: '7天ETH/USDT爆仓保险',
    features: [
      '7天内有效',
      'ETH/USDT交易对',
      '固定赔付金额',
      '自动理赔'
    ]
  },
  '3': {
    id: '3',
    product: '30d',
    symbol: 'SOLUSDT',
    amount: 10,
    duration: 720,
    description: '30天SOL/USDT爆仓保险',
    features: [
      '30天内有效',
      'SOL/USDT交易对',
      '固定赔付金额',
      '自动理赔'
    ]
  }
};

export const Payment: React.FC<PaymentProps> = ({ t }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address, connectWallet, onBase, switchToBase } = useWallet();
  const { push } = useToast();
  
  const [paymentData, setPaymentData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (id && mockPaymentData[id as keyof typeof mockPaymentData]) {
      setPaymentData(mockPaymentData[id as keyof typeof mockPaymentData]);
    } else {
      push({ title: '支付链接无效', type: 'error' });
      navigate('/');
    }
  }, [id, navigate, push]);

  const handlePayment = async () => {
    if (!address) {
      push({ title: t.walletRequired, type: 'error' });
      return;
    }

    if (!onBase) {
      push({ title: '请切换到Base网络', type: 'error' });
      return;
    }

    setIsProcessing(true);
    
    // 模拟支付处理
    setTimeout(() => {
      setIsProcessing(false);
      push({ title: '支付成功', type: 'success' });
      navigate('/success');
    }, 2000);
  };

  const breadcrumbItems = [
    { label: t.home, to: '/' },
    { label: '支付' }
  ];

  if (!paymentData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-center">加载中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb items={breadcrumbItems} />
      
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* 支付信息 */}
        <div>
          <h1 className="text-3xl font-bold">确认支付</h1>
          <p className="mt-2 text-stone-600">请确认支付信息并完成支付</p>
          
          <Card className="mt-6 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-stone-600">产品</div>
                <div className="font-semibold">{paymentData.product}</div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-stone-600">交易对</div>
                <Badge>{paymentData.symbol}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-stone-600">保险时长</div>
                <div>{paymentData.duration} 小时</div>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">支付金额</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {paymentData.amount} USDC
                  </div>
                </div>
              </div>
            </div>
          </Card>
          
          {/* 产品特性 */}
          <Card className="mt-6 p-6">
            <h3 className="font-semibold mb-4">产品特性</h3>
            <ul className="space-y-2">
              {paymentData.features.map((feature: string, index: number) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-amber-600" />
                  {feature}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 支付操作 */}
        <div>
          <Card className="p-6">
            <h3 className="font-semibold mb-4">支付方式</h3>
            
            {!address ? (
              <div className="space-y-4">
                <div className="text-sm text-stone-600">请连接钱包以继续支付</div>
                <Button onClick={connectWallet} className="w-full">
                  连接钱包
                </Button>
              </div>
            ) : !onBase ? (
              <div className="space-y-4">
                <div className="text-sm text-stone-600">请切换到Base网络</div>
                <Button onClick={switchToBase} className="w-full">
                  切换到Base
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">钱包地址</span>
                  <span className="font-mono">{address.slice(0, 8)}...{address.slice(-6)}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">网络</span>
                  <Badge variant="success">Base</Badge>
                </div>
                
                <Button 
                  onClick={handlePayment}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? '处理中...' : `支付 ${paymentData.amount} USDC`}
                </Button>
                
                <div className="text-xs text-stone-500 text-center">
                  支付将在Base网络上进行
                </div>
              </div>
            )}
          </Card>
          
          {/* 支付说明 */}
          <Card className="mt-6 p-6">
            <h4 className="font-semibold mb-3">支付说明</h4>
            <ul className="space-y-2 text-sm text-stone-600">
              <li>• 支付完成后保险立即生效</li>
              <li>• 保险期间内如发生爆仓将自动理赔</li>
              <li>• 支付金额将锁定在智能合约中</li>
              <li>• 支持Base网络上的USDC支付</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};