import React, { useEffect, useState } from "react";
import { useWallet } from "../contexts/WalletContext";

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
  orderId: string;
}

function formatCountdown(seconds: number) {
  const h = Math.max(0, Math.floor(seconds / 3600));
  const m = Math.max(0, Math.floor((seconds % 3600) / 60));
  const s = Math.max(0, seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

async function prepareClaim(orderId: string) {
  const res = await fetch("/api/v1/claims/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) throw new Error(`准备失败: ${res.status}`);
  return res.json();
}

async function verifyClaim(orderId: string, orderRef: string, claimToken: string) {
  const res = await fetch("/api/v1/claims/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ orderId, orderRef, claimToken }),
  });
  if (!res.ok) throw new Error(`验证失败: ${res.status}`);
  return res.json();
}

export default function ClaimsManage() {
  const { address, connectWallet } = useWallet();
  const [orders, setOrders] = useState<ClaimOrder[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!address) return;
      try {
        const url = `/api/v1/orders/my?address=${address}`;
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const list: any[] = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
        const now = Date.now();
        const mapped: ClaimOrder[] = list.map((r: any, i: number) => {
          const created = r.createdAt ?? r.created_at ?? new Date().toISOString();
          const startTs = r.coverageStartTs ?? r.coverage_start_ts ?? created;
          const endTs = r.coverageEndTs ?? r.coverage_end_ts ?? created;
          const endMs = typeof endTs === "number" ? (endTs < 1e12 ? endTs * 1000 : endTs) : new Date(endTs).getTime();
          const remain = Math.max(0, Math.floor((endMs - now) / 1000));
          const premium6d = Number(r.premiumUSDC6d ?? r.premium_usdc_6d ?? 0);
          const payout6d = Number(r.payoutUSDC6d ?? r.payout_usdc_6d ?? 0);
          const status: ClaimStatus = r.status === "VERIFIED" || r.status === "PAID" ? r.status : "PENDING";
          return {
            id: r.id ?? r.orderId ?? `${Date.now()}-${i}`,
            productName: r.title ?? "24h 爆仓保",
            principalUsd: Number(r.principal ?? 0),
            leverage: String(r.leverage ?? 0) + "x",
            premiumUsd: premium6d > 0 ? premium6d / 1_000_000 : Number(r.premiumPaid ?? r.premiumUSDC ?? r.premium ?? 0),
            payoutMaxUsd: payout6d > 0 ? payout6d / 1_000_000 : Number(r.payoutMax ?? r.payoutUSDC ?? 0),
            purchaseTime: new Date(created).toISOString().replace("T", " ").slice(0, 19),
            orderRef: r.orderRef ?? r.order_ref ?? "",
            latestAccount: r.exchangeAccountId ?? r.exchange_account_id ?? "-",
            remainingSeconds: remain,
            status: status,
            orderId: r.id ?? r.orderId ?? `${Date.now()}-${i}`,
          };
        });
        setOrders(mapped);
      } catch (e) {
        setOrders([]);
      }
    };
    load();
  }, [address, tick]);

  const handleVerify = async (order: ClaimOrder) => {
    try {
      const prep = await prepareClaim(order.orderId);
      const data = await verifyClaim(order.orderId, order.orderRef, prep.claimToken);
      alert(`订单号 ${order.orderRef}\n爆仓结果：${data.isLiquidated ? "已爆仓" : "未爆仓"}\n证据ID：${data.evidenceId || "-"}`);
      if (data.isLiquidated) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, status: "VERIFIED", latestAccount: (data as any).accountRef || o.latestAccount }
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

  if (!address) {
    return (
      <div className="claims-page">
        <div className="claims-header">
          <div className="claims-title-wrap">
            <div className="claims-status-dot" />
            <h1 className="claims-title">理赔管理</h1>
            <span className="claims-sub">请先连接钱包</span>
          </div>
          <button className="claims-refresh" onClick={connectWallet}>连接钱包</button>
        </div>
      </div>
    );
  }

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
              <span className="claim-info">订单号 {order.orderRef}</span>
              <span className="claim-info">最近验单账号 {order.latestAccount || "-"}</span>
            </div>

            <div className="claim-row claim-row-actions">
              <button className="btn btn-outline" onClick={() => handleVerify(order)} disabled={order.status === "PAID"}>验证</button>
              <button className="btn btn-primary" onClick={() => handleMarkPaid(order)} disabled={order.status !== "VERIFIED"}>标记已赔付</button>
              <a className="btn btn-ghost" href={`/claims/${order.orderId}`}>详情</a>
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
        .claims-refresh { border-radius: 999px; padding: 6px 14px; font-size: 14px; cursor: pointer; background: #13315c; color: #fff; border: none; }
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
