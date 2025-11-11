import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { Dictionary } from '../types';
import { ethers } from 'ethers';

// 合约地址和ABI配置
const POLICY_ADDR: string =
  (import.meta as any).env?.VITE_POLICY_ADDR ||
  '0x0000000000000000000000000000000000000000';
const USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC(6d)
const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
];
const POLICY_ABI = [
  'function buyPolicy((address wallet,uint32 skuId,bytes32 exchangeId,bytes32 accountHash,uint256 deadline,uint256 nonce,bytes32 voucherId),bytes,(address wallet,bytes32 inputHash,uint96 price,uint96 maxPayout,uint32 durationHours,bytes32 quoteId,uint256 deadline,uint256 chainId,address contractAddr),bytes,uint32 skuId,uint96 notional,bytes32 verifyHash) returns (uint256)',
  'event PolicyPurchased(uint256 indexed policyId,address indexed buyer,uint32 skuId,uint96 price,bytes32 quoteId,bytes32 inputHash,bytes32 verifyHash)'
];

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

    if (!POLICY_ADDR || POLICY_ADDR === '0x0000000000000000000000000000000000000000') {
      push({ title: '缺少合约地址：请设置 VITE_POLICY_ADDR', type: 'error' });
      return;
    }

    setIsProcessing(true);
    
    try {
      // 1) 向后端要参数化报价（PRICER 出签）
      const quoteData = paymentData?.kind === 'quote' ? paymentData.data : null;
      const linkData = paymentData?.kind === 'link' ? paymentData.data : null;
      
      let quotePayload: any;
      
      if (quoteData) {
        // 使用来自报价页面的数据
        quotePayload = {
          principal: quoteData.principal,
          leverage: quoteData.leverage,
          durationHours: quoteData.windowHours,
          skuId: 101, // 默认SKU
          wallet: address
        };
      } else if (linkData) {
        // 使用来自支付链接的数据
        quotePayload = {
          principal: linkData.amount * 10, // 转换为本金
          leverage: 20, // 默认杠杆
          durationHours: linkData.duration,
          skuId: 101, // 默认SKU
          wallet: address
        };
      } else {
        throw new Error('无效的支付数据');
      }

      const qRes = await fetch('/api/v1/pricing/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload)
      });
      
      if (!qRes.ok) throw new Error('报价失败');
      const q = await qRes.json();
      const { quote, quoteSig, idempotencyKey } = q || {};
      if (!quote?.price || !quoteSig) throw new Error('报价签名缺失');
      if (String(quote.contractAddr).toLowerCase() !== POLICY_ADDR.toLowerCase()) {
        throw new Error('合约路由不匹配');
      }
      
      const now = Math.floor(Date.now()/1000);
      if (now > Number(quote.deadline)) throw new Error('报价已过期，请刷新');

      // 2) 向后端要 Voucher（ATTESTOR 出签）
      const vRes = await fetch('/api/v1/voucher/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          skuId: quote.skuId ?? 101,
          exchangeId: quote.exchangeId ?? '0x6f6b785f000000000000000000000000000000000000000000000000000000', // "okx" 占位
          accountHash: quote.accountHash
        })
      });
      
      if (!vRes.ok) throw new Error('资格凭证失败');
      const v = await vRes.json();
      const { voucher, voucherSig, verifyHash } = v || {};
      if (!voucher || !voucherSig) throw new Error('Voucher 签名缺失');

      // 3) allowance 不足则 approve
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(USDC_ADDR, ERC20_ABI, signer);
      const need = BigInt(quote.price); // 后端返回 6 位整数
      const cur: bigint = await usdc.allowance(await signer.getAddress(), POLICY_ADDR);
      
      if (cur < need) {
        const txA = await usdc.approve(POLICY_ADDR, need);
        await txA.wait();
      }

      // 4) 调合约 buyPolicy（链上扣费+铸 SBT）
      const policy = new ethers.Contract(POLICY_ADDR, POLICY_ABI, signer);
      const skuId = Number(quote.skuId ?? 101);
      const notional = BigInt(Math.round(quotePayload.principal * quotePayload.leverage)) * 1_000_000n;
      const _verifyHash = verifyHash ?? quote.inputHash;

      const tx = await policy.buyPolicy(
        voucher, voucherSig,
        quote,   quoteSig,
        skuId,   notional, _verifyHash
      );
      const rc = await tx.wait();

      // 5) 从事件抓 policyId，再落订单（以链上为准）
      let policyId: string | undefined;
      try {
        for (const l of rc.logs ?? []) {
          const parsed = policy.interface.parseLog(l);
          if (parsed?.name === 'PolicyPurchased') {
            policyId = parsed?.args?.policyId?.toString();
            break;
          }
        }
      } catch {}
      
      if (!policyId) throw new Error('链上未返回 policyId');

      const createRes = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          policyId,
          wallet: address,
          principal: quotePayload.principal,
          leverage: quotePayload.leverage,
          premiumUSDC_6d: String(need),
          chain: 'base',
          purchaseTx: tx.hash,
          paymentMethod: 'buyPolicy'
        })
      });
      
      if (!createRes.ok) throw new Error('创建订单失败');

      // 清理session storage
      if (paymentData?.kind === 'quote') {
        try {
          sessionStorage.removeItem('lp_quote_preview');
        } catch {
          // 忽略清理异常
        }
      }
      
      push({ title: '支付成功', type: 'success' });
      navigate('/success');
    } catch (e: any) {
      push({ title: e?.message || '支付失败', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
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
