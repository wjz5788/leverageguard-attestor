import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type ClaimStatus = "PENDING_VERIFY" | "WAITING_PAYOUT" | "PAID";

interface ClaimDetail {
  id: string;
  orderId: string;
  title?: string;
  principal: number;
  principalCurrency: string;
  leverage: number;
  premiumPaid: number;
  payoutCap: number;
  payoutCurrency: string;
  coverageStart: string;
  coverageEnd: string;
  createdAt: string;
  accountRef?: string | null;
  status: ClaimStatus;
  orderRef?: string | null;
  exchange?: string | null;
  symbol?: string | null;
  side?: string | null;
  size?: number | null;
  liquidationTime?: string | null;
  isLiquidated?: boolean | null;
  pnl?: number | null;
  evidenceId?: string | null;
  payoutSuggest?: number | null;
  payoutEligibleAt?: string | null;
}

const fmtDate = (v?: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
};

const fmtAmount = (n?: number | null, unit?: string, p = 2) => {
  if (typeof n !== "number" || Number.isNaN(n)) return "-";
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: p,
    maximumFractionDigits: p,
  })} ${unit ?? ""}`.trim();
};

const statusBadge = (status: ClaimStatus) => {
  const map: Record<ClaimStatus, { t: string; bg: string; fg: string }> = {
    PENDING_VERIFY: { t: "待验证", bg: "#fef9c3", fg: "#854d0e" },
    WAITING_PAYOUT: { t: "待放款", bg: "#dcfce7", fg: "#166534" },
    PAID: { t: "已放款", bg: "#e5e7eb", fg: "#374151" },
  };
  const v = map[status];
  return (
    <span
      className="px-3 py-1 rounded-full text-xs"
      style={{ background: v.bg, color: v.fg }}
    >
      {v.t}
    </span>
  );
};

async function fetchClaimDetail(claimId: string): Promise<ClaimDetail> {
  const res = await fetch(`/api/v1/claims/${encodeURIComponent(claimId)}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`加载失败：${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function verifyClaim(claimId: string, orderRef: string) {
  const res = await fetch("/api/v1/claims/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ claimId, orderRef }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "验证失败");
  }
  return res.json() as Promise<ClaimDetail>;
}

export default function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [orderRefInput, setOrderRefInput] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    setLoadError(null);
    fetchClaimDetail(claimId)
      .then((data) => {
        setClaim(data);
        if (data.orderRef) {
          setOrderRefInput(data.orderRef);
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [claimId]);

  const handleVerify = async () => {
    if (!claim || !claimId) return;
    const trimmed = orderRefInput.trim();
    if (!trimmed) {
      setVerifyError("请输入交易所订单号");
      return;
    }
    setVerifyError(null);
    setVerifyLoading(true);

    try {
      const updated = await verifyClaim(claimId, trimmed);
      setClaim(updated);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyLoading(false);
    }
  };

  if (!claimId) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4">
          <p className="text-gray-700 mb-3">缺少 claimId。</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const showResult =
    claim &&
    (claim.evidenceId || claim.orderRef || typeof claim.isLiquidated === "boolean");

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#3F2E20]">
      <div className="sticky top-16 z-10 bg-[#FFF7EDF2] border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-yellow-300 border border-gray-100" />
            <div className="font-semibold">赔付管理</div>
            <div className="text-sm text-gray-500">发起赔付</div>
            {loading && (
              <div className="text-sm text-amber-800 ml-2">加载中...</div>
            )}
            {loadError && (
              <div className="text-sm text-red-700 ml-2">{loadError}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => claimId && fetchClaimDetail(claimId).then(setClaim)}
              className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              刷新
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 border-t border-gray-100">
          <div className="flex gap-2 pt-2 pb-1">
            <button
              className="px-3 py-1.5 rounded-lg text-sm bg-transparent text-gray-500 hover:bg-white"
              onClick={() => navigate("/claims")}
            >
              赔付列表
            </button>
            <button className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-900">
              发起赔付
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {!claim && !loading && !loadError && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-500 text-center">
            未找到赔付记录
          </div>
        )}

        {claim && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="font-semibold">
                  {claim.title || "24h 爆仓保"}
                </div>
                <div className="flex gap-2 flex-wrap text-xs">
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">订单 ID</span>
                    <span className="font-mono text-slate-900">{claim.orderId}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-slate-500">ClaimID</span>
                    <span className="font-mono text-slate-900">{claim.id}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">{statusBadge(claim.status)}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm text-gray-700 mb-3">
              <div className="flex gap-2">
                <span className="text-gray-500">本金</span>
                <span>{fmtAmount(claim.principal, claim.principalCurrency.toUpperCase())}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">杠杆</span>
                <span>{claim.leverage}×</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">已付保费</span>
                <span>{fmtAmount(claim.premiumPaid, claim.payoutCurrency)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">赔付上限</span>
                <span>{fmtAmount(claim.payoutCap, claim.payoutCurrency)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm text-gray-700 mb-4">
              <div className="flex gap-2">
                <span className="text-gray-500">保障开始</span>
                <span>{fmtDate(claim.coverageStart)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">保障结束</span>
                <span>{fmtDate(claim.coverageEnd)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">账户</span>
                <span className="font-mono">{claim.accountRef || "-"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500">申请时间</span>
                <span>{fmtDate(claim.createdAt)}</span>
              </div>
            </div>

            <div className="border-t border-gray-100 my-3" />

            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                步骤 1：输入交易所订单号，点击验证。验证通过后，系统会把
                <span className="font-semibold"> 订单号 + 证据 </span>
                写入后台数据库，状态变为「等待人工放款」。
              </p>

              <label className="block text-sm text-gray-600 mt-2 mb-1">交易所订单号 orderRef</label>
              <input
                type="text"
                value={orderRefInput}
                onChange={(e) => setOrderRefInput(e.target.value)}
                placeholder="请输入交易所订单号"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-white"
              />
              {verifyError && <p className="text-sm text-red-600 mt-1">{verifyError}</p>}

              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleVerify}
                  disabled={verifyLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 transition-colors ${verifyLoading ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {verifyLoading ? "验证中..." : "验证订单"}
                </button>
                {claim.orderRef && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(claim.orderRef || "").catch(() => undefined)}
                    className="px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 hover:bg-gray-50"
                  >
                    复制当前订单号
                  </button>
                )}
              </div>
            </div>

            {showResult && (
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">验证结果</span>
                  <span className="text-xs text-gray-500">
                    {claim.status === "WAITING_PAYOUT" ? "已验证 · 待放款（T+24h）" : claim.status === "PAID" ? "已放款" : "验证信息"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex gap-2">
                    <span className="text-gray-500">交易所订单号</span>
                    <span className="font-mono">{claim.orderRef || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">交易所</span>
                    <span>{claim.exchange || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">币对</span>
                    <span>{claim.symbol || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">方向</span>
                    <span>{claim.side || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">数量</span>
                    <span>{claim.size ?? "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">是否清算</span>
                    <span>{typeof claim.isLiquidated === "boolean" ? (claim.isLiquidated ? "是" : "否") : "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">PnL</span>
                    <span>{claim.pnl ?? "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">爆仓时间</span>
                    <span>{fmtDate(claim.liquidationTime || undefined)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">证据 ID</span>
                    <span className="font-mono">{claim.evidenceId || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500">可放款时间</span>
                    <span>{fmtDate(claim.payoutEligibleAt || undefined)}</span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500">系统已保存证据与订单号，24 小时后由人工根据本卡片信息进行复核与放款。</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
