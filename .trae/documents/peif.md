// 点击发起理赔
const handleStartClaim = async (orderId: string) => {
  const res = await fetch("/api/v1/claims/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json(); // { claimId: "xxx" ... }
  navigate(`/claims/${data.claimId}`);
};
行，我直接把代码贴在这里，你复制到项目里用就行。

下面是一个完整的 **`ClaimDetailPage.tsx`**，就是你说的那种：

> 上面一张订单卡片，下面有按钮「验证订单」，验证成功后在卡片里显示订单号 + 验证结果，状态变成“等待人工放钱”。

前端调用：

* `GET /api/v1/claims/:claimId`  拉详情
* `POST /api/v1/claims/verify`   验证订单号，落证据、更新状态

你可以根据后端实际路由把这两个 URL 稍微改一下。

---

### 1. 页面组件代码（直接可用）

```tsx
// apps/us-frontend/src/pages/ClaimDetailPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type ClaimStatus = "PENDING_VERIFY" | "WAITING_PAYOUT" | "PAID";

type VerifyState = "idle" | "submitting";

interface ClaimDetail {
  id: string;              // claimId
  orderId: string;         // 订单 ID

  principal: number;       // 本金
  principalCurrency: string; // "USDT"
  leverage: number;        // 杠杆
  premiumPaid: number;     // 已付保费
  payoutCap: number;       // 赔付上限
  payoutCurrency: string;  // "USDC"
  coverStart: string;      // ISO
  coverEnd: string;        // ISO
  accountRef?: string | null; // ex_acc_xxx

  status: ClaimStatus;

  // 验证相关
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

interface VerifyResponse {
  status: ClaimStatus;
  orderRef: string;
  isLiquidated: boolean;
  payoutSuggest: number;
  evidenceId: string;
  exchange: string;
  symbol: string;
  side: string;
  size: number;
  liquidationTime: string;
  pnl: number;
  payoutEligibleAt: string;
}

function formatDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function formatAmount(v?: number | null, unit?: string) {
  if (v == null) return "-";
  return `${v} ${unit ?? ""}`.trim();
}

function statusLabel(s: ClaimStatus) {
  if (s === "PENDING_VERIFY") return "待验证";
  if (s === "WAITING_PAYOUT") return "待放款";
  if (s === "PAID") return "已放款";
  return s;
}

// 拉取 claim 详情
async function fetchClaimDetail(claimId: string): Promise<ClaimDetail> {
  const res = await fetch(`/api/v1/claims/${encodeURIComponent(claimId)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`加载失败 ${res.status}`);
  }
  return res.json();
}

// 发起验证
async function verifyClaim(claimId: string, orderRef: string): Promise<VerifyResponse> {
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

  return res.json();
}

const ClaimDetailPage: React.FC = () => {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [orderRefInput, setOrderRefInput] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    setLoadError(null);

    fetchClaimDetail(claimId)
      .then((data) => {
        setClaim(data);
        if (data.orderRef) setOrderRefInput(data.orderRef);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [claimId]);

  if (!claimId) {
    return (
      <div style={{ padding: 24 }}>
        <p>缺少 claimId。</p>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>
    );
  }

  const handleVerify = async () => {
    if (!claim) return;
    const trimmed = orderRefInput.trim();
    if (!trimmed) {
      setVerifyError("请输入交易所订单号");
      return;
    }
    setVerifyError(null);
    setVerifyState("submitting");

    try {
      const res = await verifyClaim(claim.id, trimmed);

      // 合并结果，立刻刷新卡片
      setClaim((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              orderRef: res.orderRef,
              isLiquidated: res.isLiquidated,
              payoutSuggest: res.payoutSuggest,
              evidenceId: res.evidenceId,
              exchange: res.exchange,
              symbol: res.symbol,
              side: res.side,
              size: res.size,
              liquidationTime: res.liquidationTime,
              pnl: res.pnl,
              payoutEligibleAt: res.payoutEligibleAt,
            }
          : prev
      );
    } catch (err) {
      console.error(err);
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyState("idle");
    }
  };

  const showResult =
    claim && (claim.evidenceId || claim.orderRef || claim.isLiquidated != null);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>赔付管理 / 发起赔付</h1>

      {loading && <p>加载中...</p>}
      {loadError && <p style={{ color: "red" }}>{loadError}</p>}

      {claim && (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #eee",
            background: "#fff",
            padding: 24,
          }}
        >
          {/* 订单卡片头部 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 16,
              gap: 32,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>订单 ID：</span>
                <span>{claim.orderId}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>ClaimID：</span>
                <span>{claim.id}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>本金：</span>
                <span>
                  {formatAmount(claim.principal, claim.principalCurrency)}
                </span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>已付保费：</span>
                <span>
                  {formatAmount(claim.premiumPaid, claim.payoutCurrency)}
                </span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>保障开始：</span>
                <span>{formatDateTime(claim.coverStart)}</span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>账户：</span>
                <span>{claim.accountRef || "-"}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>杠杆：</span>
                <span>{claim.leverage}x</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>赔付上限：</span>
                <span>
                  {formatAmount(claim.payoutCap, claim.payoutCurrency)}
                </span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>保障结束：</span>
                <span>{formatDateTime(claim.coverEnd)}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>状态：</span>
                <span>{statusLabel(claim.status)}</span>
              </div>
            </div>
          </div>

          <hr style={{ margin: "16px 0" }} />

          {/* 中部：验证区域 */}
          {claim.status === "PENDING_VERIFY" ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ marginBottom: 8 }}>
                步骤 1：输入交易所订单号并点击“验证订单”。
              </p>
              <label style={{ display: "block", marginBottom: 4 }}>
                交易所订单号 orderRef
              </label>
              <input
                type="text"
                value={orderRefInput}
                onChange={(e) => setOrderRefInput(e.target.value)}
                placeholder="请输入交易所订单号"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  marginBottom: 8,
                }}
              />
              {verifyError && (
                <p style={{ color: "red", marginBottom: 8 }}>{verifyError}</p>
              )}
              <button
                onClick={handleVerify}
                disabled={verifyState === "submitting"}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "#ff4d4f",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {verifyState === "submitting" ? "验证中..." : "验证订单"}
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <p style={{ marginBottom: 8 }}>
                验证已完成：等待人工放款（T+24h）。
              </p>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>交易所订单号：</span>
                <span>{claim.orderRef || "-"}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>建议赔付：</span>
                <span>
                  {formatAmount(
                    claim.payoutSuggest ?? undefined,
                    claim.payoutCurrency
                  )}
                </span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: "#999" }}>可放款时间：</span>
                <span>{formatDateTime(claim.payoutEligibleAt)}</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  onClick={handleVerify}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: "#fafafa",
                    cursor: "pointer",
                  }}
                >
                  重新验证
                </button>
                <button
                  onClick={() => {
                    if (claim.orderRef) {
                      navigator.clipboard
                        .writeText(claim.orderRef)
                        .catch(() => undefined);
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: "#fafafa",
                    cursor: "pointer",
                  }}
                >
                  复制订单号
                </button>
              </div>
            </div>
          )}

          {/* 验证结果卡片 */}
          {showResult && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 500 }}>验证结果</span>
                <span style={{ color: "#999" }}>
                  {claim.status === "WAITING_PAYOUT"
                    ? "已验证 · 待放款 (T+24h)"
                    : claim.status === "PAID"
                    ? "已放款"
                    : "验证信息"}
                </span>
              </div>

              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <div>
                  <span style={{ color: "#999" }}>交易所：</span>
                  <span>{claim.exchange || "-"}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>币对：</span>
                  <span>{claim.symbol || "-"}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>方向：</span>
                  <span>{claim.side || "-"}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>数量：</span>
                  <span>{claim.size ?? "-"}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>是否清算：</span>
                  <span>
                    {claim.isLiquidated == null
                      ? "-"
                      : claim.isLiquidated
                      ? "是"
                      : "否"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>PnL：</span>
                  <span>{claim.pnl ?? "-"}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>爆仓时间：</span>
                  <span>{formatDateTime(claim.liquidationTime)}</span>
                </div>
                <div>
                  <span style={{ color: "#999" }}>证据 ID：</span>
                  <span>{claim.evidenceId || "-"}</span>
                </div>
              </div>

              <p style={{ marginTop: 8, color: "#999", fontSize: 12 }}>
                系统已保存证据与订单号，24 小时内由人工审核并放款。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClaimDetailPage;
```

---

### 2. 路由接一下

在你的前端路由里加一条，例如：

```tsx
// apps/us-frontend/src/router.tsx 里
import ClaimDetailPage from "./pages/ClaimDetailPage";

// ...
<Route path="/claims/:claimId" element={<ClaimDetailPage />} />
```

### 3. 订单管理里跳转

订单管理页面的「发起理赔」按钮逻辑：

```ts
// 点击发起理赔
const handleStartClaim = async (orderId: string) => {
  const res = await fetch("/api/v1/claims/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json(); // { claimId: "xxx" ... }
  navigate(`/claims/${data.claimId}`);
};
```

---

照这个接完，你会看到：

* 赔付页面是**卡片式**，上面是订单信息；
* 下方一个「验证订单」按钮；
* 验证成功后，在卡片下面直接展示“订单号 + 清算信息 + 证据 ID + 等待人工放款”，数据已经进库，后面你可以人工再查、再打钱。
用户在「订单管理」点击某订单的「发起理赔」。
系统创建 / 复用一条 claim，并跳转到 /claims/:claimId 的「发起赔付」视图。
用户在「发起赔付」页面输入交易所订单号 orderRef，点击「验证」。
后端调用交易所，只读验证是否在保障窗口内爆仓，生成证据并落库，更新 claim 状态为待放款（T+24h）。
前端在同一页面展示验证结果卡片，给出简单摘要 + 证据 ID，提示“系统已记录，稍后人工放款”。
24 小时后，运营在后台查看 WAITING_PAYOUT 列表，逐条人工审核并线下打款，调用 mark-paid 仅做记录。
这样既满足你“验证 + 存证 + 人工放款”的需求，又不引入自动化转账的链上复杂度，适合作为当前阶段的上线版本。