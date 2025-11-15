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

  return (
    <div className="claims-page">
      <div className="claims-header">
        <div className="claims-title-wrap">
          <div className="claims-status-dot" />
          <h1 className="claims-title">理赔管理</h1>
          <span className="claims-sub">共 {orders.length} 笔</span>
        </div>
      </div>

      <div className="claims-list">
        {orders.map((order) => (
          <div key={order.id} className="claim-card">
            <div className="claim-row claim-row-main">
              <div className="claim-product">{order.productName}</div>
              <div className="claim-tags">
                <span className="pill pill-primary">Principal ${order.principalUsd.toFixed(2)}</span>
                <span className="pill pill-sub">Leverage {order.leverage}</span>
                <span className="pill pill-sub">Premium ${order.premiumUsd.toFixed(2)}</span>
                <span className="pill pill-sub">Payout Max ${order.payoutMaxUsd.toFixed(2)}</span>
              </div>
              <div className="claim-status-wrap">
                {order.status === "PENDING" && (
                  <span className="status-pill status-active">待验证 · T-{formatCountdown(order.remainingSeconds)}</span>
                )}
                {order.status === "VERIFIED" && (
                  <span className="status-pill status-wait-pay">待放款 · T-{formatCountdown(order.remainingSeconds)}</span>
                )}
                {order.status === "PAID" && (
                  <span className="status-pill status-done">已赔付</span>
                )}
              </div>
            </div>

            <div className="claim-row claim-row-info">
              <span className="claim-info">购买时间 {order.purchaseTime}</span>
              <span className="claim-info">订单号 {order.orderRef || "-"}</span>
              <span className="claim-info">最近验单账号 {order.latestAccount || "-"}</span>
            </div>

            <div className="claim-row claim-row-actions">
              <button className="btn btn-outline" onClick={() => handleVerify(order)} disabled={order.status === "PAID"}>验证</button>
              <button className="btn btn-primary" onClick={() => handleMarkPaid(order)} disabled={order.status !== "VERIFIED"}>标记已赔付</button>
              <button className="btn btn-ghost">详情</button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .claims-page { padding: 24px 32px; background: #fffaf1; min-height: 100vh; }
        .claims-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .claims-title-wrap { display: flex; align-items: center; gap: 8px; }
        .claims-status-dot { width: 16px; height: 16px; border-radius: 999px; background: #ffd54f; }
        .claims-title { margin: 0; font-size: 20px; font-weight: 600; }
        .claims-sub { font-size: 14px; color: #999; }
        .claims-list { display: flex; flex-direction: column; gap: 16px; }
        .claim-card { background: #ffffff; border-radius: 16px; padding: 16px 20px 12px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); }
        .claim-row { display: flex; align-items: center; }
        .claim-row-main { justify-content: space-between; gap: 16px; }
        .claim-product { font-size: 18px; font-weight: 600; white-space: nowrap; }
        .claim-tags { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; padding-left: 16px; }
        .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 13px; white-space: nowrap; }
        .pill-primary { background: #13315c; color: #fff; }
        .pill-sub { background: #f2f4f7; color: #4b5563; }
        .claim-status-wrap { white-space: nowrap; }
        .status-pill { border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 500; }
        .status-active { background: #e5f9e7; color: #15803d; }
        .status-wait-pay { background: #e0f2fe; color: #0369a1; }
        .status-done { background: #e5e7eb; color: #4b5563; }
        .claim-row-info { margin-top: 8px; font-size: 13px; color: #6b7280; justify-content: flex-start; gap: 24px; }
        .claim-row-actions { margin-top: 12px; justify-content: flex-start; gap: 12px; }
        .btn { border-radius: 999px; padding: 6px 14px; font-size: 14px; cursor: pointer; border: none; }
        .btn-primary { background: #13315c; color: #fff; }
        .btn-outline { background: #ffffff; border: 1px solid #d1d5db; color: #374151; }
        .btn-ghost { background: transparent; color: #6b7280; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
