import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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

type MockPayment = typeof mockPaymentData['1'];

interface QuotePayload {
  product: string;
  principal: number;
  leverage: number;
  k: number;
  feeRatio: number;
  feeUSDC: number;
  payoutRatio: number;
  payoutUSDC: number;
  windowHours: number;
}

type PaymentView =
  | { kind: 'link'; data: MockPayment }
  | { kind: 'quote'; data: QuotePayload };

const fmtCurrency = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPercent = (n: number) => `${(Number(n) * 100).toFixed(2)}%`;

export const Payment: React.FC<PaymentProps> = ({ t }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { address, connectWallet, onBase, switchToBase } = useWallet();
  const { push } = useToast();
  
  const [paymentData, setPaymentData] = useState<PaymentView | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const locationState = location.state as { quote?: QuotePayload } | undefined;
  const quoteFromState = locationState?.quote;

  useEffect(() => {
    if (quoteFromState) {
      setPaymentData({ kind: 'quote', data: quoteFromState });
      try {
        sessionStorage.setItem('lp_quote_preview', JSON.stringify(quoteFromState));
      } catch {
        // 非关键路径，忽略存储失败
      }
      return;
    }

    if (id === 'preview') {
      try {
        const raw = sessionStorage.getItem('lp_quote_preview');
        if (raw) {
          const parsed = JSON.parse(raw) as QuotePayload;
          setPaymentData({ kind: 'quote', data: parsed });
          return;
        }
      } catch {
        // 忽略解析错误
      }
    }

    if (id && mockPaymentData[id as keyof typeof mockPaymentData]) {
      setPaymentData({ kind: 'link', data: mockPaymentData[id as keyof typeof mockPaymentData] });
      return;
    }

    push({ title: '支付链接无效', type: 'error' });
    navigate('/');
  }, [id, navigate, push, quoteFromState]);

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
      if (paymentData?.kind === 'quote') {
        try {
          sessionStorage.removeItem('lp_quote_preview');
        } catch {
          // 忽略清理异常
        }
      }
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

  const quoteData = paymentData.kind === 'quote' ? paymentData.data : null;
  const linkData = paymentData.kind === 'link' ? paymentData.data : null;

  let paymentAmountLabel = '';
  let featureList: string[] = [];
  if (paymentData.kind === 'link' && linkData) {
    paymentAmountLabel = `${linkData.amount} USDC`;
    featureList = linkData.features;
  } else if (quoteData) {
    paymentAmountLabel = `${fmtCurrency(quoteData.feeUSDC)} USDC`;
    featureList = [
      `保障窗口 ${quoteData.windowHours} 小时`,
      `预计赔付 ${fmtCurrency(quoteData.payoutUSDC)} USDC（${fmtPercent(quoteData.payoutRatio)}）`,
      `杠杆设定 ${quoteData.leverage}x`,
      'USDC 链上支付'
    ];
  }
  const buttonText = isProcessing ? '处理中...' : paymentAmountLabel ? `确认支付 ${paymentAmountLabel}` : '确认支付';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb items={breadcrumbItems} />
      
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* 支付信息 */}
        <div>
          <h1 className="text-3xl font-bold">确认支付</h1>
          <p className="mt-2 text-stone-600">请确认支付信息并完成支付</p>
          
          <Card className="mt-6 p-6">
            {linkData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">产品</div>
                  <div className="font-semibold">{linkData.product}</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">交易对</div>
                  <Badge>{linkData.symbol}</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">保险时长</div>
                  <div>{linkData.duration} 小时</div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-stone-600">支付金额</div>
                    <div className="text-2xl font-bold text-amber-600">
                      {linkData.amount} USDC
                    </div>
                  </div>
                </div>
              </div>
            ) : quoteData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">产品</div>
                  <div className="font-semibold">{quoteData.product}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">保障窗口</div>
                  <div>{quoteData.windowHours} 小时</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">本金</div>
                  <div>{fmtCurrency(quoteData.principal)} USDT</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">杠杆</div>
                  <div>{quoteData.leverage}x</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-stone-600">赔付金额</div>
                  <div>
                    {fmtCurrency(quoteData.payoutUSDC)} USDC（{fmtPercent(quoteData.payoutRatio)}）
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-stone-600">保费金额</div>
                    <div className="text-2xl font-bold text-amber-600">
                      {fmtCurrency(quoteData.feeUSDC)} USDC
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-stone-500 text-right">
                    保费比例 {fmtPercent(quoteData.feeRatio)}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
          
          {/* 产品特性 */}
          <Card className="mt-6 p-6">
            <h3 className="font-semibold mb-4">产品特性</h3>
            <ul className="space-y-2">
              {featureList.map((feature: string, index: number) => (
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
                  {buttonText}
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
