import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dictionary } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';

// 公共函数
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const ensureInt = (n: any) => {
  const x = Math.round(Number(n ?? 0));
  return Number.isFinite(x) ? x : 0;
};

// ============================
// 产品页：整合报价计算
// ============================
const MIN_P = 50, MAX_P = 500;
const MIN_L = 10, MAX_L = 100; // 杠杆范围

const fmtUSD = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => (Number(n) * 100).toFixed(2) + "%";

function computeQuote(principal: number, lev: number, k: number) {
  const p = clamp(Number(principal || 0), MIN_P, MAX_P);
  const L = Number(lev);
  const K = Number(k || 1);
  const baseFee = Math.min(0.15, 0.05 + (L - 20) * 0.001 + (p / 500) * 0.02);
  const fee = Math.min(0.15, baseFee * K);
  const payout = Math.min(0.5, Math.max(0.1, 0.25 + (L - 50) * 0.005 - (p / 500) * 0.1));
  return { p, baseFee, fee, payout, feeAmt: p * fee, payoutAmt: p * payout };
}

interface ProductsProps {
  t: Dictionary;
}

export const Products: React.FC<ProductsProps> = ({ t }) => {
  // 恢复持久化
  const initPrincipal = (() => { try { return Number(localStorage.getItem("lp_principal")) || 200; } catch { return 200; } })();
  const initLev = (() => { try { return ensureInt(localStorage.getItem("lp_lev")) || 20; } catch { return 20; } })();
  
  // 定价系数 k 默认固定为 1.0
  const initK = 1; 

  const [principal, setPrincipal] = useState<number>(initPrincipal);
  const [lev, setLev] = useState<number>(initLev);
  const [k, setK] = useState<number>(initK);

  // 持久化
  useEffect(() => { try { localStorage.setItem("lp_principal", String(principal)); } catch {} }, [principal]);
  useEffect(() => { try { localStorage.setItem("lp_lev", String(lev)); } catch {} }, [lev]);

  const navigate = useNavigate();
  const { address, connectWallet, chainId, switchToBase } = useWallet();
  const { push } = useToast();
  const { baseFee, fee, payout, feeAmt, payoutAmt, p } = useMemo(() => computeQuote(principal, lev, k), [principal, lev, k]);
  const [buying, setBuying] = useState(false);

  const handleBuy = async () => {
    if (!address) {
      push({ title: '请先连接钱包' });
      try { await connectWallet(); } catch {}
      return;
    }
    setBuying(true);
    try {
      // 1) 预览报价，获取幂等键
      const previewRes = await fetch('/api/v1/orders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: 'sku_24h_liq',
          principal: p,
          leverage: lev,
          wallet: address
        })
      });
      if (!previewRes.ok) {
        const err = await previewRes.json().catch(() => ({}));
        throw new Error(err?.message || `报价失败 ${previewRes.status}`);
      }
      const preview = await previewRes.json();
      const quote = preview?.quote;
      if (!quote?.idempotencyKey || !quote?.premiumUSDC) {
        throw new Error('报价无效');
      }

      // 2) 确保网络为后端要求的链（Base 主网）
      const payCfg = quote.payment || preview?.payment; // 兼容写法
      const targetChainId: string = payCfg?.chainId || '0x2105';
      if ((chainId || '').toLowerCase() !== String(targetChainId).toLowerCase()) {
        await switchToBase(false);
      }

      // 3) 使用 USDC 合约进行转账到金库（上链）
      const usdc = payCfg?.usdcContract || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const vault = payCfg?.spenderOrVault;
      if (!vault) throw new Error('支付金库地址缺失');

      const toUnits = (val: string | number, decimals = 6) => {
        const s = String(val);
        const [i, f = ''] = s.split('.');
        const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
        return (BigInt(i || '0') * (10n ** BigInt(decimals))) + BigInt(frac || '0');
      };
      const amount = toUnits(quote.premiumUSDC, 6);

      const methodSelector = '0xa9059cbb'; // transfer(address,uint256)
      const pad32 = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
      const encAddr = (addr: string) => pad32(addr.toLowerCase().replace(/^0x/, ''));
      const encUint = (n: bigint) => pad32(n.toString(16));
      const data = methodSelector + encAddr(vault) + encUint(amount);

      const eth = (window as any).ethereum;
      if (!eth) throw new Error('未检测到以太坊钱包');

      const txHash: string = await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from: address, to: usdc, data, value: '0x0' }]
      });

      // 可选：简易轮询确认上链
      try {
        for (let i = 0; i < 10; i++) {
          const receipt = await eth.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
          if (receipt && receipt.status) break;
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch {}

      // 4) 创建订单（带上链交易哈希，标记已支付）
      const createRes = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: 'sku_24h_liq',
          principal: p,
          leverage: lev,
          wallet: address,
          premiumUSDC: Number(quote.premiumUSDC),
          idempotencyKey: quote.idempotencyKey,
          paymentMethod: 'approve_transfer',
          paymentTx: txHash
        })
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err?.message || `下单失败 ${createRes.status}`);
      }
      push({ title: '下单成功' });
      navigate('/account/orders');
    } catch (e: any) {
      push({ title: e?.message || '下单失败' });
    } finally {
      setBuying(false);
    }
  };

  const handleCreateLink = () => {
    // 导航到创建链接页面，带上当前参数
    const params = new URLSearchParams({
      principal: String(p),
      leverage: String(lev),
      product: '24h'
    });
    window.location.href = `/links/create?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <style>{`
        /* 修正 Range Slider 的样式，使其在不同浏览器中保持一致 */
        input[type="range"] {
          -webkit-appearance: none;
           appearance: none;
           width: 100%;
           height: 6px;
           background: #e7e5e4; /* stone-200 */
           border-radius: 9999px;
           outline: none;
           opacity: 0.9;
           transition: opacity .2s;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: #ffffff; /* white */
          border: 1px solid #d6d3d1; /* stone-300 */
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #ffffff;
          border: 1px solid #d6d3d1;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页面标题 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-stone-900 mb-4">LiqPass 产品中心</h1>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            体验我们的爆仓保险产品，自定义参数，实时查看报价，创建专业的支付链接
          </p>
        </div>

        {/* 产品展示区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* 左侧：配置面板 */}
          <div className="lg:col-span-3">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold text-stone-900 mb-6">24小时爆仓保</h2>
              
              <div className="space-y-6">
                {/* 本金 */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    本金（USDT）<span className="ml-2 text-stone-400">范围 {MIN_P}-{MAX_P}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={MIN_P}
                      max={MAX_P}
                      step={10}
                      value={clamp(principal, MIN_P, MAX_P)}
                      onChange={(e) => setPrincipal(Number(e.target.value))}
                      className="w-full"
                    />
                    <input
                      type="number"
                      min={MIN_P}
                      max={MAX_P}
                      step={1}
                      value={clamp(ensureInt(principal), MIN_P, MAX_P)}
                      onChange={(e) => setPrincipal(ensureInt(e.target.value))}
                      className="w-28 px-3 py-2 rounded-lg border border-stone-300"
                    />
                  </div>
                </div>

                {/* 杠杆 */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    杠杆（x）<span className="ml-2 text-stone-400">范围 {MIN_L}-{MAX_L}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={MIN_L}
                      max={MAX_L}
                      step={1}
                      value={clamp(lev, MIN_L, MAX_L)}
                      onChange={(e) => setLev(Number(e.target.value))}
                      className="w-full"
                    />
                    <input
                      type="number"
                      min={MIN_L}
                      max={MAX_L}
                      step={1}
                      value={clamp(ensureInt(lev), MIN_L, MAX_L)}
                      onChange={(e) => setLev(ensureInt(e.target.value))}
                      className="w-28 px-3 py-2 rounded-lg border border-stone-300"
                    />
                  </div>
                </div>
                
                {/* 定价系数 */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">定价系数 k</label>
                  <div className="flex items-center justify-between gap-3 p-3 bg-stone-100 rounded-lg border border-stone-300">
                    <span className="text-sm text-stone-600">默认固定为</span>
                    <span className="font-semibold text-stone-900 text-lg">1.00</span>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">最终保费比例 = min(15%， baseFee × 1.00)</p>
                </div>

                {/* 产品特性 */}
                <div className="pt-4 border-t border-stone-200">
                  <h3 className="font-semibold text-stone-900 mb-3">产品特性</h3>
                  <ul className="space-y-2 text-sm text-stone-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                      24小时保障窗口
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                      爆仓自动赔付
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                      USDC链上支付
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                      透明定价机制
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>

          {/* 右侧：报价和操作 */}
          <div className="lg:col-span-2">
            <Card className="p-6 sticky top-6">
              <h3 className="text-xl font-semibold text-stone-900 mb-4">保障详情</h3>
              
              <div className="space-y-3 text-sm">
                <Row label="本金">{fmtUSD(clamp(principal, MIN_P, MAX_P))} USDT</Row>
                <Row label="杠杆">{lev}x</Row>
                <Row label="定价系数">{Number(k).toFixed(2)}</Row>
                <div className="h-px bg-stone-200 my-2" />
                <Row label="保费比例（基础）">{fmtPct(baseFee)}</Row>
                <Row label="保费比例（最终）">{fmtPct(fee)}</Row>
                <Row label="保费金额">{fmtUSD(feeAmt)} USDT</Row>
                <div className="h-px bg-stone-200 my-2" />
                <Row label="赔付比例">{fmtPct(payout)}</Row>
                <Row label="赔付金额">{fmtUSD(payoutAmt)} USDT</Row>
              </div>

              <div className="mt-6 space-y-3">
                <Button 
                  onClick={handleBuy} 
                  disabled={buying}
                  className="w-full py-3 bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-60"
                >
                  {buying ? '下单中…' : '立即投保'}
                </Button>
                
                <Button 
                  onClick={handleCreateLink} 
                  variant="outline"
                  className="w-full py-3 border-stone-300 text-stone-700 hover:bg-stone-50"
                >
                  创建支付链接
                </Button>
              </div>

              <p className="mt-4 text-xs text-stone-500">
                真实投保需：连接钱包 → 生成订单 → USDC 支付 → 链上登记
              </p>
            </Card>
          </div>
        </div>


      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="text-stone-500">{label}</div>
      <div className="font-medium text-stone-900">{children}</div>
    </div>
  );
}
