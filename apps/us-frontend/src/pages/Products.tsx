import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dictionary } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
// 新增：ethers（v6）
import { ethers } from 'ethers';
import { payAndSubmit } from '../lib/payPolicy';

// === 新增：常量 & 最小 ABI（① 顶部常量/ABI） ===
// 建议用环境变量：VITE_POLICY_ADDR；没有就占位 0x0（会在下单时报错提醒）
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

  // === 替换版 handleBuy（② 支付路径改为 approve→buyPolicy） ===
  const handleBuy = async () => {
    if (!address) {
      push({ title: '请先连接钱包' });
      try { await connectWallet(); } catch {}
      return;
    }
    setBuying(true);
    try {
      if ((chainId || '').toLowerCase() !== '0x2105') {
        await switchToBase(false);
      }
      const amountUSDC = '0.01';
      const res = await payAndSubmit(amountUSDC);
      push({ title: '支付交易已发起', desc: `tx=${(res?.txHash || '').slice(0, 10)}…` });
      try {
        const now = Date.now();
        const localRaw = localStorage.getItem('lp_local_orders') || '[]';
        const localArr = Array.isArray(JSON.parse(localRaw)) ? JSON.parse(localRaw) : [];
        const item = {
          id: res?.orderId || `${now}`,
          title: '24h 爆仓保',
          principal: clamp(principal, MIN_P, MAX_P),
          leverage: ensureInt(lev),
          premiumPaid: Number(feeAmt || 0),
          payoutMax: Number(payoutAmt || 0),
          status: 'active',
          coverageStartTs: new Date(now).toISOString(),
          coverageEndTs: new Date(now + 24 * 3600_000).toISOString(),
          createdAt: new Date(now).toISOString(),
          orderRef: '',
          exchangeAccountId: '',
          chain: 'Base',
          txHash: String(res?.txHash || '').trim(),
          orderDigest: '',
          skuId: 'SKU_24H_FIXED',
        };
        const merged = [item, ...localArr].filter((v, idx, arr) => {
          const key = String(v?.id || '') + '|' + String(v?.txHash || '');
          return idx === arr.findIndex(w => (String(w?.id || '') + '|' + String(w?.txHash || '')) === key);
        });
        localStorage.setItem('lp_local_orders', JSON.stringify(merged));
      } catch {}
      navigate('/account/orders');
    } catch (e: any) {
      push({ title: e?.message || '支付失败' });
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
