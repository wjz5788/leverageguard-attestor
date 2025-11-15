import React, { useEffect, useState } from "react";

type ClaimStatus = "PENDING" | "VERIFIED" | "PAID";

interface ClaimOrder {
  id: string;
  productName: string;
  principalUsd: number;
  leverage: string;
  premiumUsd: number;
  payoutMaxUsd: number;
  purchaseTime: string;
  orderRef: string;
  latestAccount: string;
  remainingSeconds: number;
  status: ClaimStatus;
}

function formatCountdown(seconds: number) {
  const h = Math.max(0, Math.floor(seconds / 3600));
  const m = Math.max(0, Math.floor((seconds % 3600) / 60));
  const s = Math.max(0, seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function readLocalOrders(): ClaimOrder[] {
  let arr: any[] = [];
  try {
    const raw = localStorage.getItem("lp_local_orders") || "[]";
    const json = JSON.parse(raw);
    arr = Array.isArray(json) ? json : [];
  } catch {}
  const now = Date.now();
  return arr.map((o: any) => {
    const endMs = Number(new Date(o.coverageEndTs).getTime());
    const remainSec = Number.isFinite(endMs) ? Math.max(0, Math.floor((endMs - now) / 1000)) : 0;
    return {
      id: String(o.id || ""),
      productName: String(o.title || "24h 爆仓保"),
      principalUsd: Number(o.principal || 0),
      leverage: `${Number(o.leverage || 0)}x`,
      premiumUsd: Number(o.premiumPaid || 0),
      payoutMaxUsd: Number(o.payoutMax || 0),
      purchaseTime: new Date(o.createdAt || Date.now()).toLocaleString(),
      orderRef: String(o.orderRef || ""),
      latestAccount: String(o.exchangeAccountId || ""),
      remainingSeconds: remainSec,
      status: "PENDING",
    };
  });
}

export default function ClaimsManagePage() {
  const [orders, setOrders] = useState<ClaimOrder[]>([]);

  useEffect(() => {
    setOrders(readLocalOrders());
    const timer = setInterval(() => {
      setOrders((prev) =>
        prev.map((o) => ({ ...o, remainingSeconds: Math.max(0, o.remainingSeconds - 1) }))
      );
    }, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lp_local_orders") {
        setOrders(readLocalOrders());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleVerify = async (order: ClaimOrder) => {
    try {
      const res = await fetch("/api/v1/claims/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRef: order.orderRef }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      alert(
        `订单号 ${order.orderRef}\n爆仓结果：${data.liquidated ? "已爆仓" : "未爆仓"}\n证据ID：${data.evidenceId || "-"}`
      );
      if (data.liquidated) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, status: "VERIFIED", latestAccount: data.account || o.latestAccount }
              : o
          )
        );
      }
    } catch (err) {
      alert("验证失败，请稍后重试");
    }
  };

  const handleMarkPaid = async (order: ClaimOrder) => {
    try {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "PAID" } : o)));
    } catch {
      alert("标记赔付失败，请稍后重试");
    }
  };

  const refresh = () => setOrders(readLocalOrders());

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#3F2E20]">
      <div className="sticky top-16 z-10 bg-[#FFF7EDF2] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-yellow-400 border border-gray-100" />
            <div className="font-semibold">赔付管理</div>
            <div className="text-sm text-gray-500">倒序 · 共 {orders.length} 笔</div>
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

      <div className="max-w-7xl mx-auto px-4 py-6 grid gap-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="font-semibold">{order.productName}</div>
                <div className="flex gap-2 flex-wrap text-sm">
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">Principal</span>
                    <span className="text-slate-900">${order.principalUsd.toFixed(2)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">Leverage</span>
                    <span className="text-slate-900">{order.leverage}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">Premium</span>
                    <span className="text-slate-900">${order.premiumUsd.toFixed(2)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">Payout Max</span>
                    <span className="text-slate-900">${order.payoutMaxUsd.toFixed(2)}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {order.status === "PENDING" && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    待验证 · T-{formatCountdown(order.remainingSeconds)}
                  </span>
                )}
                {order.status === "VERIFIED" && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    待放款 · T-{formatCountdown(order.remainingSeconds)}
                  </span>
                )}
                {order.status === "PAID" && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">已赔付</span>
                )}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm text-gray-600">
              <div className="flex gap-2">
                <span className="text-gray-500">购买时间</span>
                <span>{order.purchaseTime}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">订单号</span>
                <span className="font-mono">{order.orderRef || "-"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">最近验单账号</span>
                <span className="font-mono">{order.latestAccount || "-"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">倒计时</span>
                <span> T-{formatCountdown(order.remainingSeconds)}</span>
              </div>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={() => handleVerify(order)}
                disabled={order.status === "PAID"}
              >
                验证
              </button>
              <button
                className={`px-3 py-2 rounded-lg border transition-colors ${
                  order.status === "VERIFIED"
                    ? "bg-white border-gray-200 hover:bg-gray-50 text-gray-900"
                    : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                }`}
                onClick={() => handleMarkPaid(order)}
                disabled={order.status !== "VERIFIED"}
              >
                标记已赔付
              </button>
              <button className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                详情
              </button>
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="p-6 bg-white border border-gray-200 rounded-xl text-gray-500 text-center">暂无记录</div>
        )}
      </div>
    </div>
  );
}
