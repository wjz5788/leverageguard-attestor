import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWallet } from '../contexts/WalletContext';
import { OrderCardData } from "../types/order";
import { getExplorerTxUrl } from "../lib/explorer";

// 工具函数
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

const getTxUrl = (chain: string, tx: string) => {
  return getExplorerTxUrl({ chainId: null, txHash: (tx || "").trim() });
};

// 模拟订单详情数据
const getMockOrderDetail = (orderId: string): OrderCardData => {
  const baseNow = Date.now();
  return {
    id: orderId,
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
  };
};

interface OrderDetailPageProps {
  t?: (key: string) => string;
  apiBase?: string;
}

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({ t, apiBase = "" }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address } = useWallet();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [order, setOrder] = useState<OrderCardData | null>(null);

  // 获取订单详情
  const fetchOrderDetail = async () => {
    if (!id) return;
    
    setLoading(true);
    setError("");
    
    try {
      const base = apiBase ? apiBase.replace(/\/$/, "") : '';
      let orderData: any = null;
      if (address) {
        const MY_URL = base ? `${base}/orders/my?address=${address}` : `/api/v1/orders/my?address=${address}`;
        const myRes = await fetch(MY_URL, { method: 'GET' });
        if (myRes.ok) {
          const myData = await myRes.json();
          const list: any[] = Array.isArray(myData?.orders) ? myData.orders : [];
          orderData = list.find((o: any) => String(o.id) === String(id)) || null;
        }
      }

      if (!orderData) {
        const DETAIL_URL = base ? `${base}/orders/${id}` : `/api/v1/orders/${id}`;
        const res = await fetch(DETAIL_URL, { method: 'GET' });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        orderData = data.order || data;
      }
      
      const premium6d = Number(orderData.premiumUSDC6d || orderData.premium_usdc_6d || 0);
      const payout6d = Number(orderData.payoutUSDC6d || orderData.payout_usdc_6d || 0);
      const premiumPaidNum = premium6d > 0 ? premium6d / 1_000_000 : Number(orderData.premiumPaid || orderData.premiumUSDC || orderData.premium || 0);
      const payoutMaxNum = payout6d > 0 ? payout6d / 1_000_000 : Number(orderData.payoutMax || orderData.payoutUSDC || 0);

      const normalized: OrderCardData = {
        id: orderData.id || id,
        title: orderData.title || "24h 爆仓保",
        principal: Number(orderData.principal || 0),
        leverage: Number(orderData.leverage || 0),
        premiumPaid: premiumPaidNum,
        payoutMax: payoutMaxNum,
        status: String(orderData.status || "active"),
        coverageStartTs: orderData.coverageStartTs || orderData.coverage_start_ts || orderData.createdAt,
        coverageEndTs: orderData.coverageEndTs || orderData.coverage_end_ts || orderData.createdAt,
        createdAt: orderData.createdAt || orderData.created_at || new Date().toISOString(),
        orderRef: orderData.orderRef || orderData.order_ref || "",
        exchangeAccountId: orderData.exchangeAccountId || orderData.exchange_account_id || "",
        chain: orderData.chain || "Base",
        txHash: String(orderData.paymentTx || orderData.txHash || orderData.tx_hash || "").trim(),
        orderDigest: orderData.orderDigest || orderData.order_digest || "",
        skuId: orderData.skuId || orderData.sku_id || "SKU_24H_FIXED",
      };
      
      setOrder(normalized);
    } catch (e: any) {
      console.warn(`/orders/${id} failed, fallback to mock:`, e?.message || e);
      setError("订单详情服务不可用，展示演示数据");
      setOrder(getMockOrderDetail(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id, apiBase, address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">加载订单详情中...</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-lg mb-4">订单不存在</div>
          <button 
            onClick={() => navigate("/orders")}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            返回订单列表
          </button>
        </div>
      </div>
    );
  }

  const endMs = toMs(order.coverageEndTs);
  const now = Date.now();
  const remainMs = Math.max(0, endMs - now);
  const isExpiredUi = remainMs <= 0 || order.status === "expired";

  const getStatusBadge = (status: string) => {
    const map: Record<string, { t: string; bg: string; fg: string }> = {
      pending_onchain: { t: "上链确认中", bg: "#fef9c3", fg: "#854d0e" },
      active: { t: "生效中", bg: "#dcfce7", fg: "#065f46" },
      expired: { t: "已过期", bg: "#e5e7eb", fg: "#374151" },
      claimed_pending: { t: "理赔审核", bg: "#dbeafe", fg: "#1e3a8a" },
      claimed_paid: { t: "已赔付", bg: "#dcfce7", fg: "#065f46" },
      claimed_denied: { t: "理赔拒绝", bg: "#fee2e2", fg: "#7f1d1d" },
    };
    const v = map[status] || { t: status, bg: "#e5e7eb", fg: "#374151" };
    return (
      <span style={{ background: v.bg, color: v.fg, padding: "8px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600 }}>
        {v.t}
      </span>
    );
  };

  const fmtRemain = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `T-${hh}:${mm}:${ss}`;
  };

  const claimEnabled = order.status === "active" && !isExpiredUi;

  const handleClaimClick = () => {
    navigate(`/claims/new?orderId=${order.id}`);
  };

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#3F2E20]">
      {/* 顶部条 */}
      <div className="sticky top-16 z-10 bg-[#FFF7EDF2] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/orders")}
              className="w-7 h-7 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center"
            >
              ←
            </button>
            <div className="font-semibold">订单详情</div>
            <div className="text-sm text-gray-500">ID: {order.id}</div>
            {error && <div className="text-sm text-red-700">{error}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate("/orders")}
              className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              返回列表
            </button>
          </div>
        </div>
      </div>

      {/* 订单详情内容 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：主要信息 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 订单概览 */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">{order.title}</h1>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(isExpiredUi ? "expired" : order.status)}
                    <span className="font-mono text-lg text-gray-900">
                      {isExpiredUi ? "T-00:00:00" : fmtRemain(remainMs)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">${num(order.payoutMax, 2)}</div>
                  <div className="text-sm text-gray-500">最大赔付金额</div>
                </div>
              </div>

              {/* 关键指标 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">${num(order.principal, 2)}</div>
                  <div className="text-sm text-gray-500">本金</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{order.leverage}×</div>
                  <div className="text-sm text-gray-500">杠杆</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">${num(order.premiumPaid, 2)}</div>
                  <div className="text-sm text-gray-500">已付保费</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{order.skuId}</div>
                  <div className="text-sm text-gray-500">产品类型</div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                {(() => {
                  const url = getTxUrl(order.chain, order.txHash);
                  return (
                    <button
                      className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                      disabled={!url}
                      onClick={() => {
                        if (!url) return;
                        console.log("跳转链上交易：", { orderId: order.id, txHash: order.txHash, url });
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      {url ? "查看链上交易" : "暂无交易"}
                    </button>
                  );
                })()}
                <button 
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    claimEnabled 
                      ? 'bg-red-600 text-white hover:bg-red-700' 
                      : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={!claimEnabled} 
                  onClick={handleClaimClick}
                >
                  发起理赔
                </button>
              </div>
            </div>

            {/* 详细信息 */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">订单信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">保单号</div>
                  <div className="font-mono text-gray-900">{order.id}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">交易所账户</div>
                  <div className="font-mono text-gray-900">{order.exchangeAccountId}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">创建时间</div>
                  <div className="text-gray-900">{fmtDate(order.createdAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">保障窗口</div>
                  <div className="text-gray-900">
                    {fmtDate(order.coverageStartTs)} → {fmtDate(order.coverageEndTs)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">支付交易（链上哈希）</div>
                  <div className="font-mono text-sm text-gray-900 break-all">{order.txHash}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：状态信息 */}
          <div className="space-y-6">
            {/* 状态时间线 */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">状态时间线</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <div>
                    <div className="text-sm font-medium">订单创建</div>
                    <div className="text-xs text-gray-500">{fmtDate(order.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <div>
                    <div className="text-sm font-medium">保障生效</div>
                    <div className="text-xs text-gray-500">{fmtDate(order.coverageStartTs)}</div>
                  </div>
                </div>
                {isExpiredUi ? (
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                    <div>
                      <div className="text-sm font-medium">保障过期</div>
                      <div className="text-xs text-gray-500">{fmtDate(order.coverageEndTs)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></div>
                    <div>
                      <div className="text-sm font-medium">保障进行中</div>
                      <div className="text-xs text-gray-500">剩余 {fmtRemain(remainMs)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 快速操作 */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">快速操作</h3>
              <div className="space-y-3">
                {(() => {
                  const url = getTxUrl(order.chain, order.txHash);
                  return (
                    <button
                      className="w-full px-4 py-2 text-left rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      disabled={!url}
                      onClick={() => {
                        if (!url) return;
                        console.log("跳转链上交易：", { orderId: order.id, txHash: order.txHash, url });
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <div className="font-medium">{url ? "查看链上交易" : "暂无交易"}</div>
                      <div className="text-sm text-gray-500">在区块浏览器中查看</div>
                    </button>
                  );
                })()}
                <button 
                  className={`w-full px-4 py-2 text-left rounded-lg transition-colors ${
                    claimEnabled 
                      ? 'bg-red-50 hover:bg-red-100' 
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={!claimEnabled}
                  onClick={handleClaimClick}
                >
                  <div className="font-medium">发起理赔申请</div>
                  <div className="text-sm">
                    {claimEnabled ? "提交理赔申请" : "当前状态不可理赔"}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailPage;
