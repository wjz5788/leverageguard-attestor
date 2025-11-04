import React, { useEffect, useState } from "react";
import { OrderCardData, PolicyStatus, ChainName } from "../types/order";

// =============================
// 工具函数
// =============================

const toMs = (t: number | string): number => {
  if (t == null) return NaN;
  if (typeof t === "number") {
    // 判断是秒还是毫秒：小于 10^12 视为秒
    return t < 1e12 ? t * 1000 : t;
  }
  // 字符串：可能是纯数字或 ISO
  const n = Number(t);
  if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  const d = new Date(t).getTime();
  return Number.isFinite(d) ? d : NaN;
};

const fmtDate = (ts: number | string) => {
  const ms = toMs(ts);
  if (!Number.isFinite(ms)) return String(ts);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
};

const num = (n: number, p = 2) => {
  if (typeof n !== "number" || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: p, maximumFractionDigits: p });
};

const openChainTx = (chain: ChainName, tx: string) => {
  let url = "";
  if (/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    if (chain === "Base") url = `https://basescan.org/tx/${tx}`;
  }
  if (!url) url = `https://basescan.org/tx/${tx}`; // 兜底
  window.open(url, "_blank");
};

// =============================
// Mock 数据（后端失败时使用）
// =============================

function makeMockOrders(): OrderCardData[] {
  const baseNow = Date.now();
  const mk = (p: Partial<OrderCardData>): OrderCardData => ({
    id: crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    title: "24h 爆仓保",
    principal: 200,
    leverage: 10,
    premiumPaid: 3.2,
    payoutMax: 60,
    status: "active",
    coverageStartTs: Math.floor((baseNow - 60_000) / 1000),
    coverageEndTs: Math.floor((baseNow + 23 * 3600_000 + 59 * 60_000) / 1000),
    createdAt: new Date(baseNow - 5_000).toISOString(),
    orderRef: String(10_000_000_000 + Math.floor(Math.random() * 9_000_000_000)),
    exchangeAccountId: "eacc_mock",
    chain: "Base",
    txHash: "0x" + "a".repeat(64),
    orderDigest: "0x" + "b".repeat(64),
    skuId: "SKU_24H_FIXED",
    ...p,
  });

  return [
    mk({ status: "active", createdAt: new Date(baseNow - 1_000).toISOString() }),
    mk({ status: "pending_onchain", createdAt: new Date(baseNow - 2_000).toISOString() }),
    mk({ status: "claimed_pending", createdAt: new Date(baseNow - 3_000).toISOString() }),
    mk({ status: "claimed_paid", createdAt: new Date(baseNow - 4_000).toISOString() }),
    mk({ status: "expired", coverageEndTs: Math.floor((baseNow - 10_000) / 1000), createdAt: new Date(baseNow - 5_000).toISOString() }),
  ];
}

// =============================
// 子组件：订单卡
// =============================

const OrderCard: React.FC<{ data: OrderCardData }> = ({ data }) => {
  const { principal, leverage, premiumPaid, payoutMax, status, coverageStartTs, coverageEndTs, createdAt, orderRef, exchangeAccountId, chain, txHash, orderDigest, title } = data;

  const endMs = toMs(coverageEndTs);
  const now = Date.now();
  const remainMs = Math.max(0, endMs - now);
  const isExpiredUi = remainMs <= 0 || status === "expired";

  const badge = (s: string) => {
    const map: Record<string, { t: string; bg: string; fg: string }> = {
      pending_onchain: { t: "上链确认中", bg: "#fef9c3", fg: "#854d0e" },
      active: { t: "生效中", bg: "#dcfce7", fg: "#065f46" },
      expired: { t: "已过期", bg: "#e5e7eb", fg: "#374151" },
      claimed_pending: { t: "理赔审核", bg: "#dbeafe", fg: "#1e3a8a" },
      claimed_paid: { t: "已赔付", bg: "#dcfce7", fg: "#065f46" },
      claimed_denied: { t: "理赔拒绝", bg: "#fee2e2", fg: "#7f1d1d" },
    };
    const v = map[s] || { t: s, bg: "#e5e7eb", fg: "#374151" };
    return <span style={{ background: v.bg, color: v.fg, padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{v.t}</span>;
  };

  const fmtRemain = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `T-${hh}:${mm}:${ss}`;
  };

  const claimEnabled = status === "active" && !isExpiredUi;

  const onClaimClick = (o: OrderCardData) => {
    // 待你确认：POST /claims/verify 还是 /claims/start ？入参 {orderId}? {orderRef}? {exchangeAccountId}?
    // 这里暂以 alert 占位，避免误调用。
    alert(`发起理赔（占位）：orderId=${o.id}, orderRef=${o.orderRef}`);
  };

  const onDetailClick = (o: OrderCardData) => {
    alert(`详情（占位）: ${o.id}`);
  };

  const btn = (disabled = false): React.CSSProperties => {
    return { padding: "8px 12px", borderRadius: 10, background: disabled ? "#f5f5f5" : "#ffffff", border: "1px solid #e5e7eb", cursor: disabled ? "not-allowed" : "pointer" };
  };

  const SmallKV: React.FC<{ k: string; v: string }> = ({ k, v }) => (
    <span style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "2px 8px", fontSize: 12 }}>
      <b style={{ color: "#334155" }}>{k}</b> <span style={{ color: "#0f172a" }}>{v}</span>
    </span>
  );

  const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#737373", whiteSpace: "nowrap", wordBreak: "keep-all" }}>{label}</span>
      <span style={{ fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>{value}</span>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      {/* 顶部 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="font-semibold">{title || "24h 爆仓保"}</div>
          <div className="flex gap-2 flex-wrap">
            <SmallKV k="Principal" v={`$${num(principal, 2)}`} />
            <SmallKV k="Leverage" v={`${leverage}×`} />
            <SmallKV k="Premium" v={`$${num(premiumPaid, 2)}`} />
            <SmallKV k="Payout Max" v={`$${num(payoutMax, 2)}`} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge(isExpiredUi ? "expired" : String(status))}
          <span className="font-mono text-sm text-gray-900">{isExpiredUi ? "T-00:00:00" : fmtRemain(remainMs)}</span>
        </div>
      </div>

      {/* 次要信息 */}
      <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm text-gray-600">
        <Field label="购买时间" value={fmtDate(createdAt)} />
        <Field label="覆盖窗口" value={`${fmtDate(coverageStartTs)} → ${fmtDate(coverageEndTs)}`} />
        <Field label="订单号" value={orderRef?.slice(-8)} mono />
        <Field label="最近校验账号" value={exchangeAccountId || "-"} mono />
      </div>

      {/* 动作 */}
      <div className="mt-3">
        <div className="flex gap-2 flex-wrap">
          <button 
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            onClick={() => openChainTx(data.chain, data.txHash)}
          >
            查看链上
          </button>
          <button 
            className={`px-3 py-2 rounded-lg border transition-colors ${
              claimEnabled 
                ? 'bg-white border-gray-200 hover:bg-gray-50 text-gray-900' 
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!claimEnabled} 
            onClick={() => onClaimClick(data)}
          >
            发起理赔
          </button>
          <button 
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            onClick={() => onDetailClick(data)}
          >
            详情
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================
// 主组件
// =============================

interface OrdersPageProps {
  t: (key: string) => string;
  apiBase?: string;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ t, apiBase = "" }) => {
  const ORDERS_URL = apiBase ? `${apiBase.replace(/\/$/, "")}/orders` : "/orders";

  // 数据与加载态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [rows, setRows] = useState<OrderCardData[]>([]);

  // 每秒 tick 触发重渲染以更新倒计时
  const [tick, setTick] = useState(0);
  useEffect(() => { 
    const timer = setInterval(() => setTick((v) => v + 1), 1000); 
    return () => clearInterval(timer); 
  }, []);

  // 拉取列表
  const refresh = async () => {
    setLoading(true); 
    setError("");
    try {
      const res = await fetch(ORDERS_URL, { method: "GET" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const list: any[] = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
      const normalized: OrderCardData[] = list.map((r: any, i: number) => ({
        id: r.id ?? r.orderId ?? `${Date.now()}-${i}`,
        title: r.title ?? "24h 爆仓保",
        principal: Number(r.principal ?? 0),
        leverage: Number(r.leverage ?? 0),
        premiumPaid: Number(r.premiumPaid ?? r.premium ?? 0),
        payoutMax: Number(r.payoutMax ?? 0),
        status: String(r.status ?? "active"),
        coverageStartTs: r.coverageStartTs ?? r.coverage_start_ts ?? r.startTs ?? r.start_at,
        coverageEndTs: r.coverageEndTs ?? r.coverage_end_ts ?? r.endTs ?? r.end_at,
        createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
        orderRef: r.orderRef ?? r.order_ref ?? "",
        exchangeAccountId: r.exchangeAccountId ?? r.exchange_account_id,
        chain: r.chain ?? "Base",
        txHash: r.txHash ?? r.tx_hash ?? "",
        orderDigest: r.orderDigest ?? r.order_digest ?? "",
        skuId: r.skuId ?? r.sku_id ?? "SKU_24H_FIXED",
      }));
      // 按 createdAt desc
      normalized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(normalized);
    } catch (e: any) {
      console.warn("/orders failed, fallback to mock:", e?.message || e);
      setError("订单服务不可用，展示演示数据");
      const mock = makeMockOrders().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(mock);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    refresh(); 
  }, [apiBase]);

  const total = rows.length;

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#3F2E20]">
      {/* 顶部条 */}
      <div className="sticky top-0 z-40 bg-[#FFF7EDF2] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-yellow-400 border border-gray-100" />
            <div className="font-semibold">订单管理</div>
            <div className="text-sm text-gray-500">倒序 · 共 {total} 笔</div>
            {loading && <div className="text-sm text-amber-800">加载中</div>}
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={refresh} 
              className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              刷新
            </button>
          </div>
        </div>
      </div>

      {/* 卡片列表 */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid gap-3">
        {rows.map((o) => (
          <OrderCard key={o.id} data={o} />
        ))}
        {rows.length === 0 && !loading && (
          <div className="p-6 bg-white border border-gray-200 rounded-xl text-gray-500 text-center">
            暂无订单
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersPage;