import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { OrderCardData } from "../types/order";
import { getExplorerTxUrl } from "../lib/explorer";
import { authFetchJson } from "../lib/authFetch";

// 时间工具：支持秒/毫秒/ISO 字符串
const toMs = (t: number | string): number => {
  if (t == null) return NaN;
  if (typeof t === "number") {
    return t < 1e12 ? t * 1000 : t;
  }
  const n = Number(t);
  if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  const d = new Date(t).getTime();
  return Number.isFinite(d) ? d : NaN;
};

const fmtDate = (ts: number | string) => {
  const ms = toMs(ts);
  if (!Number.isFinite(ms)) return String(ts ?? "");
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
};

const fmtRemain = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `T-${hh}:${mm}:${ss}`;
};

// 从 localStorage 中读取本地订单（订单管理页镜像的数据）
const loadLocalOrder = (orderId: string): OrderCardData | null => {
  try {
    const raw = localStorage.getItem("lp_local_orders");
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const found = list.find((o: any) => String(o.id) === String(orderId));
    return found || null;
  } catch (e) {
    console.warn("读取本地订单失败:", e);
    return null;
  }
};

// 演示用订单：本地没有数据时兜底
const buildDemoOrder = (id: string): OrderCardData => {
  const now = Date.now();
  return {
    id,
    title: "24h 爆仓保",
    principal: 200,
    leverage: 10,
    premiumPaid: 3.2,
    payoutMax: 60,
    status: "active",
    coverageStartTs: Math.floor((now - 60_000) / 1000),
    coverageEndTs: Math.floor((now + 24 * 3600_000 - 60_000) / 1000),
    createdAt: new Date(now - 5_000).toISOString(),
    orderRef: "",
    exchangeAccountId: "eacc_demo",
    chain: "Base",
    txHash: "0x" + "a".repeat(64),
    orderDigest: "",
    skuId: "SKU_24H_FIX",
  };
};

interface OrderDetailProps {
  // 预留：后面可以从外面注入 t / apiBase 等
}

const OrderDetailPage: React.FC<OrderDetailProps> = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // 没有 id，直接提示错误
  if (!id) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-3">订单 ID 缺失</div>
          <button
            onClick={() => navigate("/orders")}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
          >
            返回订单列表
          </button>
        </div>
      </div>
    );
  }

  const [order, setOrder] = useState<OrderCardData | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);

  useEffect(() => {
    let aborted = false;

    const mapDetailToCard = (resp: any): OrderCardData => {
      const o = resp?.order || {};
      const sku = o?.sku || {};
      const created = o.createdAt || new Date().toISOString();
      const windowHours = Number(sku.windowHours ?? 24);
      const startIso = created;
      const endIso = new Date(new Date(created).getTime() + windowHours * 3600_000).toISOString();
      const premium6d = Number(o.premiumUSDC6d ?? 0);
      const payout6d = Number(o.payoutUSDC6d ?? 0);
      return {
        id: o.id ?? id,
        title: sku.title || "24h 爆仓保",
        principal: Number(o.principal ?? 0),
        leverage: Number(o.leverage ?? 0),
        premiumPaid: premium6d > 0 ? premium6d / 1_000_000 : 0,
        payoutMax: payout6d > 0 ? payout6d / 1_000_000 : 0,
        status: String(o.status ?? "active"),
        coverageStartTs: startIso,
        coverageEndTs: endIso,
        createdAt: created,
        orderRef: String(o.orderRef || ""),
        exchangeAccountId: o.exchange || "",
        chain: "Base",
        txHash: String(o.paymentTx || "").trim(),
        orderDigest: String(o.orderDigest || ""),
        skuId: o.skuId || sku.code || "SKU_24H_FIX",
      };
    };

    const load = async () => {
      try {
        // 后端详情（钱包会话或API Key均可）
        const resp = await authFetchJson<any>(`/api/v1/orders/${encodeURIComponent(id)}`);
        const data = Array.isArray(resp?.orders) ? resp.orders[0] : resp;
        const card = mapDetailToCard(data);
        if (aborted) return;
        setOrder(card);
        setIsMock(false);
      } catch (e) {
        // 回退到本地镜像或演示数据
        const localOrder = loadLocalOrder(id);
        const fallback = localOrder || buildDemoOrder(id);
        if (aborted) return;
        setOrder(fallback);
        setIsMock(!localOrder);
      }
    };

    load();
    return () => { aborted = true; };
  }, [id]);

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="text-center text-sm text-gray-600">加载中...</div>
      </div>
    );
  }

  // 状态 & 倒计时（用 coverageEndTs，如果无效就当作现在）
  const rawEndMs = toMs(order.coverageEndTs || order.createdAt);
  const endMs = Number.isFinite(rawEndMs) ? rawEndMs : Date.now();
  const now = Date.now();
  const remainMs = Math.max(0, endMs - now);
  const isExpired = remainMs <= 0 || order.status === "expired";

  const statusLabel = isExpired ? "已过期" : "生效中";
  const remainLabel = isExpired ? "T-00:00:00" : fmtRemain(remainMs);
  const runningLabel = isExpired ? "保障已结束" : `剩余 ${remainLabel}`;

  const createdAtLabel = fmtDate(order.createdAt);
  const coverageFromLabel = fmtDate(order.coverageStartTs);
  const coverageToLabel = fmtDate(order.coverageEndTs);

  // 链上交易 URL（Base 默认）
  const txUrl =
    order.txHash && order.txHash.length > 0
      ? getExplorerTxUrl({ chainId: null, txHash: order.txHash })
      : "";

  const handleViewTx = () => {
    if (!txUrl) return;
    window.open(txUrl, "_blank", "noopener,noreferrer");
  };

  // 发起理赔：跳转到赔付管理页，带 orderId
  const handleClaim = () => {
    navigate(`/claims?orderId=${order.id}`);
  };

  return (
    <div className="min-h-screen bg-[#FFF7ED] px-6 py-4 flex flex-col gap-4">
      {/* 顶部提示条：ID + 演示标记 */}
      <div className="w-full max-w-5xl mx-auto">
        <div className="rounded-xl border border-amber-100 bg-[#FFEDE5] px-4 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-2">
          <span className="font-medium">订单详情</span>
          <span className="truncate text-[11px] text-amber-900">ID: {order.id}</span>
          {isMock && (
            <span className="text-[11px] text-red-600">(演示数据，未找到本地订单)</span>
          )}
        </div>
      </div>

      {/* 主体布局：左大右小 */}
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
        {/* 左侧：产品 + 订单信息 */}
        <div className="flex flex-col gap-4">
          {/* 产品概要卡片 */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-6 py-5 flex flex-col gap-4">
            {/* 标题行 */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold text-slate-900">
                {order.title || "24h 爆仓保"}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{statusLabel}</span>
                <span className="text-[11px] text-emerald-600">{remainLabel}</span>
              </div>
              <div className="ml-auto text-right text-slate-900">
                <div className="text-base font-semibold">
                  ${order.payoutMax.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">最大赔付金额</div>
              </div>
            </div>

            {/* 指标行 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 flex flex-col gap-1">
                <div className="text-xs text-slate-500">本金</div>
                <div className="text-base font-semibold text-slate-900">
                  ${order.principal.toFixed(2)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 flex flex-col gap-1">
                <div className="text-xs text-slate-500">杠杆</div>
                <div className="text-base font-semibold text-slate-900">
                  {order.leverage}×
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 flex flex-col gap-1">
                <div className="text-xs text-slate-500">已付保费</div>
                <div className="text-base font-semibold text-slate-900">
                  ${order.premiumPaid.toFixed(2)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 flex flex-col gap-1">
                <div className="text-xs text-slate-500">产品类型</div>
                <div className="text-[13px] font-mono text-slate-900">
                  {order.skuId || "SKU_24H_FIX"}
                </div>
              </div>
            </div>

            {/* 操作按钮：左侧主卡片上的两个入口 */}
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={!txUrl}
                onClick={handleViewTx}
                className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-medium ${
                  txUrl
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-slate-100 text-slate-300 cursor-not-allowed"
                }`}
              >
                {txUrl ? "查看链上交易" : "暂无交易"}
              </button>
              <button
                type="button"
                onClick={handleClaim}
                className="inline-flex items-center justify-center rounded-full bg-rose-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
              >
                发起理赔
              </button>
            </div>
          </div>

          {/* 订单信息卡片（保单视角，不含交易所订单号） */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-6 py-5 flex flex-col gap-4">
            <div className="text-sm font-semibold text-slate-900">订单信息</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs text-slate-700">
              <div>
                <div className="text-slate-400 mb-0.5">保单号</div>
                <div>{order.id}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">交易所账户</div>
                <div>{order.exchangeAccountId || "-"}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">创建时间</div>
                <div>{createdAtLabel}</div>
              </div>
              <div>
                <div className="text-slate-400 mb-0.5">保障窗口</div>
                <div>
                  {coverageFromLabel}
                  <span className="text-slate-400 mx-1">→</span>
                  {coverageToLabel}
                </div>
              </div>
              {/* 链上交易哈希：给你（运营 / 开发）看 */}
              <div className="md:col-span-2">
                <div className="text-slate-400 mb-0.5">支付交易（链上哈希）</div>
                <div className="font-mono text-[11px] break-all leading-snug text-slate-800">
                  {order.txHash || "-"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：状态时间线 */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-5 py-4 flex flex-col gap-3">
            <div className="text-sm font-semibold text-slate-900 mb-1">状态时间线</div>
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-start gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500" />
                <div>
                  <div className="text-slate-800">订单创建</div>
                  <div className="text-[11px] text-slate-500">{createdAtLabel}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-sky-500" />
                <div>
                  <div className="text-slate-800">保障生效</div>
                  <div className="text-[11px] text-slate-500">{coverageFromLabel}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-amber-500" />
                <div>
                  <div className="text-slate-800">
                    {isExpired ? "保障结束" : "保障进行中"}
                  </div>
                  <div className="text-[11px] text-slate-500">{runningLabel}</div>
                </div>
              </div>
            </div>
          </div>
          {/* 右侧将来可以再加“理赔记录”、“操作日志”等卡片 */}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailPage;
