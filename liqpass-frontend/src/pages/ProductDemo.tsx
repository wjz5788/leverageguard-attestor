import React, { useEffect, useMemo, useState } from 'react';
import { Dictionary } from '../types';

// 公共函数
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const ensureInt = (n: any) => {
  const x = Math.round(Number(n ?? 0));
  return Number.isFinite(x) ? x : 0;
};

// ============================
// 演示页：整合报价计算
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

// 模拟 alert，避免在 iframe 中卡住
function showModal(title: string, content: string) {
  let modalBackdrop = document.getElementById('demo-modal-backdrop');
  if (modalBackdrop) {
    modalBackdrop.remove();
  }

  modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'demo-modal-backdrop';
  modalBackdrop.className = "fixed inset-0 bg-black/30 z-40 flex items-center justify-center";
  
  const modalContent = document.createElement('div');
  modalContent.className = "bg-white rounded-lg shadow-xl w-full max-w-md m-4 p-5";
  
  const modalTitle = document.createElement('h3');
  modalTitle.className = "text-lg font-medium mb-3";
  modalTitle.textContent = title;
  
  const modalPre = document.createElement('pre');
  modalPre.className = "bg-stone-100 p-3 rounded text-sm overflow-auto";
  modalPre.textContent = content;
  
  const closeButton = document.createElement('button');
  closeButton.className = "mt-4 w-full py-2 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800";
  closeButton.textContent = "关闭";
  
  modalContent.appendChild(modalTitle);
  modalContent.appendChild(modalPre);
  modalContent.appendChild(closeButton);
  modalBackdrop.appendChild(modalContent);
  document.body.appendChild(modalBackdrop);

  const closeModal = () => {
    if (modalBackdrop) {
      modalBackdrop.remove();
    }
  };

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });
  closeButton.addEventListener('click', closeModal);
}

interface ProductDemoProps {
  t: Dictionary;
}

export const ProductDemo: React.FC<ProductDemoProps> = ({ t }) => {
  // 恢复持久化
  const initPrincipal = (() => { try { return Number(localStorage.getItem("lp_principal")) || 200; } catch { return 200; } })();
  const initLev = (() => { try { return ensureInt(localStorage.getItem("lp_lev")) || 20; } catch { return 20; } })();
  
  // [修改] 定价系数 k 默认固定为 1.0
  const initK = 1; 

  const [principal, setPrincipal] = useState<number>(initPrincipal);
  const [lev, setLev] = useState<number>(initLev); // 提交后的有效值
  const [k, setK] = useState<number>(initK);

  // 持久化
  useEffect(() => { try { localStorage.setItem("lp_principal", String(principal)); } catch {} }, [principal]);
  useEffect(() => { try { localStorage.setItem("lp_lev", String(lev)); } catch {} }, [lev]);
  // [移除] 移除 k 的持久化，因为它是固定的
  // useEffect(() => { try { localStorage.setItem("lp_k", String(k)); } catch {} }, [k]);

  const { baseFee, fee, payout, feeAmt, payoutAmt, p } = useMemo(() => computeQuote(principal, lev, k), [principal, lev, k]);

  const handleBuy = () => {
    const payload = {
      product: "24h-LiqPass",
      principal: p,
      leverage: lev,
      k,
      feeRatio: Number(fee.toFixed(6)),
      feeUSDC: Number(feeAmt.toFixed(2)),
      payoutRatio: Number(payout.toFixed(6)),
      payoutUSDC: Number(payoutAmt.toFixed(2)),
      windowHours: 24,
    };
    showModal("下单参数（演示）", JSON.stringify(payload, null, 2));
  };

  return (
    <div className="min-h-screen w-full bg-orange-50 text-stone-800">
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
      <header className="max-w-5xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-stone-900/90 text-white grid place-items-center text-sm font-bold">LP</div>
          <h1 className="text-xl font-semibold">LiqPass · 24h 爆仓保</h1>
        </div>
        <div className="text-sm text-stone-500">演示页 · 杠杆模块重构</div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-stone-200 p-5">
          <h2 className="text-lg font-semibold mb-4">配置参数</h2>

          {/* 本金 */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-stone-700">本金（USDT）<span className="ml-2 text-stone-400">范围 {MIN_P}-{MAX_P}</span></label>
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

          {/* 杠杆：与本金滑动保持一致 */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-stone-700">杠杆（x）<span className="ml-2 text-stone-400">范围 {MIN_L}-{MAX_L}</span></label>
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
          
          {/* 定价系数 k (固定为 1.00) */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-stone-700">定价系数 k</label>
            <div className="flex items-center justify-between gap-3 p-2 bg-stone-100 rounded-lg border border-stone-300">
              <span className="text-sm text-stone-600">默认固定为</span>
              <span className="font-semibold text-stone-900 text-lg">1.00</span>
            </div>
            <p className="mt-2 text-xs text-stone-500">最终保费比例 = min(15%， baseFee × 1.00)。</p>
          </div>
        </section>

        {/* 右：报价卡 */}
        <aside className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-stone-200 p-5 h-fit sticky top-6">
          <h3 className="text-lg font-semibold mb-4">24 小时覆盖窗口</h3>
          <div className="space-y-3 text-sm">
            <Row label="本金">{fmtUSD(clamp(principal, MIN_P, MAX_P))} USDT</Row>
            <Row label="杠杆">{lev}x</Row>
            <Row label="定价系数 k">{Number(k).toFixed(2)}</Row>
            <div className="h-px bg-stone-200 my-2" />
            <Row label="保费比例（base）">{fmtPct(baseFee)}</Row>
            <Row label="保费比例（最终）">{fmtPct(fee)}</Row>
            <Row label="保费额">{fmtUSD(feeAmt)} USDT</Row>
            <div className="h-px bg-stone-200 my-2" />
            <Row label="赔付比例">{fmtPct(payout)}</Row>
            <Row label="赔付额（爆仓触发）">{fmtUSD(payoutAmt)} USDT</Row>
          </div>

          <button onClick={handleBuy} className="mt-6 w-full py-3 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2">下单（演示）</button>
          <p className="mt-3 text-xs text-stone-500">真实下单需：连接钱包 → 生成订单 → USDC 支付 → 后端/合约登记。</p>
        </aside>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="text-stone-500">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}