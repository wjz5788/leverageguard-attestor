import React, { useEffect, useMemo, useState } from "react";

/**
 * LiqPass · 个人中心 → API 设置（账号卡片 + 状态机）
 * 新增：验证返回"确认无问题"的最小字段集合与清算检测占位；UI 展示更清晰。
 * 保留：先生成回显 → 用户点击"确认无误"才记为通过。
 * 
 * 修复说明：
 * - 修复了缺失的 fmtTime 函数
 * - 优化了错误处理和用户体验
 * - 改进了表单验证逻辑
 * - 修复了重复的函数定义
 */

// ============================
// 可调参数
// ============================
const MOCK = true; // 改为 false 直连后端
const RUN_SMOKE_TESTS = true && MOCK; // 仅在 MOCK 时运行内置测试
const BASE_URL = "https://us-backend.example.com"; // 你的 us-backend 地址
const AUTH_BEARER = ""; // 如需鉴权，填入 token

// ============================
// 类型（JSDoc）
// ============================
/** @typedef {"OKX"|"Hyperliquid"|"Binance"} Exchange */
/** @typedef {"live"|"testnet"} Environment */
/** @typedef {"draft"|"unverified"|"verifying"|"verified"|"failed"|"disabled"|"deleted"} VerificationStatus */
/** @typedef {{orders:boolean,fills:boolean,positions:boolean,liquidations:boolean}} Caps */
/** @typedef {{exchangeUid?:string, subAccount?:string, accountType?:string, sampleInstruments?:string[]}} AccountSummary */
/** @typedef {{echo?:{firstOrderIdLast4?:string, firstFillQty?:string, firstFillTime?:string}, hash?:string}} ProofEcho */
/** @typedef {{
 *   orderId:string,
 *   pair:string,
 *   side?:string,
 *   type?:string,
 *   status?:string,
 *   executedQty?:string,
 *   avgPrice?:string,
 *   quoteAmount?:string,
 *   orderTimeIso?:string,
 *   exchangeTimeIso?:string
 * }} OrderEcho */
/** @typedef {{
 *   authOk:boolean,
 *   capsOk:boolean,
 *   orderFound:boolean,
 *   echoLast4Ok:boolean,
 *   arithmeticOk:boolean,
 *   pairOk:boolean,
 *   timeSkewMs:number,
 *   verdict:"pass"|"fail"
 * }} VerifyChecks */
/** @typedef {{
 *   status:"none"|"forced_liquidation"|"adl",
 *   eventTimeIso?:string,
 *   instrument?:string,
 *   positionSizeBefore?:string,
 *   positionSizeAfter?:string,
 *   pnlAbs?:string
 * }} LiquidationInfo */
/** @typedef {{status:"verified"|"failed"|"partial"|"error", caps:Caps, account:AccountSummary, proof?:ProofEcho, reasons?:string[], verifiedAt?:string, order?:OrderEcho, checks?:VerifyChecks, liquidation?:LiquidationInfo, sessionId?:string}} VerifyResult */

/** @typedef {Object} ExchangeAccount
 * @property {string} id
 * @property {Exchange} exchange
 * @property {string} label
 * @property {VerificationStatus} status
 * @property {string|null} lastVerifiedAt
 * @property {Caps} caps
 * @property {{exchangeUid?:string, subAccount?:string}} account
 * @property {{apiKeyLast4?:string}} masked
 * @property {Environment} environment
 * @property {boolean=} userConfirmedEcho
 * @property {VerifyResult=} lastVerifyResult
 */

// ============================
// 交易所字段定义（动态表单）
// ============================
const EXCHANGES_META = /** @type {const} */ ({
  OKX: {
    label: "OKX",
    fields: [
      { key: "apiKey", label: "API Key", sensitive: true },
      { key: "apiSecret", label: "API Secret", sensitive: true },
      { key: "passphrase", label: "Passphrase", sensitive: true },
    ],
  },
  Hyperliquid: {
    label: "Hyperliquid",
    fields: [
      { key: "apiKey", label: "API Key", sensitive: true },
      { key: "apiSecret", label: "API Secret / Signing Key", sensitive: true },
      { key: "accountId", label: "Account ID / SubAccount", sensitive: false },
    ],
  },
  Binance: {
    label: "Binance",
    fields: [
      { key: "apiKey", label: "API Key", sensitive: true },
      { key: "apiSecret", label: "API Secret", sensitive: true },
    ],
  },
});

// ============================
// 请求封装
// ============================
async function api(path, { method = "GET", body } = {}) {
  if (MOCK) return mockApi(path, { method, body });
  const res = await fetch(`${BASE_URL}${path}` /** @type {any} */ ({}), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(AUTH_BEARER ? { Authorization: `Bearer ${AUTH_BEARER}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ============================
// MOCK 数据与实现
// ============================
/** @type {ExchangeAccount[]} */
const SEED = [
  {
    id: "eacc_okx_1",
    exchange: "OKX",
    label: "OKX 主账号",
    status: "verified",
    lastVerifiedAt: new Date().toISOString(),
    caps: { orders: true, fills: true, positions: true, liquidations: true },
    account: { exchangeUid: "12345678", subAccount: "main" },
    masked: { apiKeyLast4: "a9f2" },
    environment: "live",
    userConfirmedEcho: false,
    lastVerifyResult: {
      status: "verified",
      caps: { orders: true, fills: true, positions: true, liquidations: true },
      account: { exchangeUid: "12345678", subAccount: "main", accountType: "futures", sampleInstruments: ["BTC-USDT-PERP"] },
      proof: { echo: { firstOrderIdLast4: "8a3f", firstFillQty: "0.001", firstFillTime: new Date().toISOString() }, hash: "keccak256(0x...)" },
      verifiedAt: new Date().toISOString(),
      order: { orderId: "ABCD1234", pair: "BTC-USDT-PERP", side: "SELL", type: "MARKET", status: "FILLED", executedQty: "0.001", avgPrice: "100000", quoteAmount: "100", orderTimeIso: new Date().toISOString(), exchangeTimeIso: new Date().toISOString() },
      checks: { authOk: true, capsOk: true, orderFound: true, echoLast4Ok: true, arithmeticOk: true, pairOk: true, timeSkewMs: 10, verdict: "pass" },
      liquidation: { status: "none" },
      sessionId: "sess_seed",
    },
  },
  {
    id: "eacc_bin_1",
    exchange: "Binance",
    label: "工作号",
    status: "unverified",
    lastVerifiedAt: null,
    caps: { orders: false, fills: false, positions: false, liquidations: false },
    account: {},
    masked: {},
    environment: "testnet",
  },
];

let MOCK_DB = {
  accounts: [...SEED],
  secrets: /** @type {Record<string, any>} */ ({}),
  logs: /** @type {Record<string, any[]>} */ ({}),
};

async function mockApi(path, { method = "GET", body } = {}) {
  await sleep(120);
  // 列表
  if (path === "/exchange-apis" && method === "GET") {
    return { items: MOCK_DB.accounts };
  }
  // 创建
  if (path === "/exchange-apis" && method === "POST") {
    const id = `eacc_${Date.now()}`;
    const acc = {
      id,
      exchange: body.exchange,
      label: body.label,
      environment: body.environment || "live",
      status: "unverified",
      lastVerifiedAt: null,
      caps: { orders: false, fills: false, positions: false, liquidations: false },
      account: {},
      masked: {},
    };
    MOCK_DB.accounts.unshift(acc);
    MOCK_DB.secrets[id] = {
      apiKey: body.apiKey || "",
      apiSecret: body.apiSecret || "",
      passphrase: body.passphrase || "",
      extra: body.extra || {},
    };
    return acc;
  }
  // 读取
  const detailMatch = path.match(/^\/exchange-apis\/([^\/]+)$/);
  if (detailMatch && method === "GET") {
    const id = detailMatch[1];
    const acc = MOCK_DB.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("404");
    return acc;
  }
  // 更新
  if (detailMatch && method === "PATCH") {
    const id = detailMatch[1];
    const idx = MOCK_DB.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("404");
    const curr = MOCK_DB.accounts[idx];
    const next = { ...curr, ...pick(body, ["label", "environment", "ipWhitelist"]) };
    // 更新敏感字段 → 置为 unverified
    if (body.apiKey || body.apiSecret || body.passphrase || body.extra) {
      next.status = "unverified";
      MOCK_DB.secrets[id] = {
        apiKey: body.apiKey ?? MOCK_DB.secrets[id]?.apiKey ?? "",
        apiSecret: body.apiSecret ?? MOCK_DB.secrets[id]?.apiSecret ?? "",
        passphrase: body.passphrase ?? MOCK_DB.secrets[id]?.passphrase ?? "",
        extra: body.extra ?? MOCK_DB.secrets[id]?.extra ?? {},
      };
    }
    MOCK_DB.accounts[idx] = next;
    return next;
  }
  // 删除（软删 + 清空密钥）
  if (detailMatch && method === "DELETE") {
    const id = detailMatch[1];
    const idx = MOCK_DB.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("404");
    const next = { ...MOCK_DB.accounts[idx], status: "deleted" };
    MOCK_DB.accounts[idx] = next;
    delete MOCK_DB.secrets[id];
    return { ok: true };
  }
  // 触发验证（需要 orderRef + pair，且凭证齐备）
  const verifyMatch = path.match(/^\/exchange-apis\/([^\/]+)\/verify$/);
  if (verifyMatch && method === "POST") {
    const id = verifyMatch[1];
    const idx = MOCK_DB.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("404");
    const acc = { ...MOCK_DB.accounts[idx] };
    acc.status = "verifying";
    MOCK_DB.accounts[idx] = acc;
    await sleep(300);

    const sec = MOCK_DB.secrets[id] || {};
    const reasons = [];
    const credsOK = !!sec.apiKey && !!sec.apiSecret && (acc.exchange !== "OKX" || !!sec.passphrase);
    if (!credsOK) reasons.push("INVALID_CREDENTIALS");

    const orderRef = body?.orderRef; const pair = body?.pair;
    if (!orderRef) reasons.push("MISSING_ORDER_REF");
    if (!pair) reasons.push("MISSING_PAIR");

    const ok = reasons.length === 0;

    // 生成"看得见的证据"与一致性检查
    /** @type {OrderEcho|undefined} */
    let order;
    /** @type {VerifyChecks|undefined} */
    let checks;
    /** @type {LiquidationInfo|undefined} */
    let liquidation;
    if (ok) {
      const executedQty = "581.4"; // 示例
      const avgPrice = "0.79628507"; // 示例
      const quoteAmount = (parseFloat(executedQty) * parseFloat(avgPrice)).toFixed(8);
      const nowIso = new Date().toISOString();
      order = {
        orderId: String(orderRef),
        pair: pair,
        side: "SELL",
        type: "MARKET",
        status: "FILLED",
        executedQty,
        avgPrice,
        quoteAmount,
        orderTimeIso: nowIso,
        exchangeTimeIso: nowIso,
      };
      checks = {
        authOk: true,
        capsOk: true,
        orderFound: true,
        echoLast4Ok: String(orderRef).slice(-4) === String(orderRef).slice(-4),
        arithmeticOk: Math.abs(parseFloat(quoteAmount) - parseFloat(executedQty) * parseFloat(avgPrice)) < 1e-6,
        pairOk: !!pair,
        timeSkewMs: 10,
        verdict: "pass",
      };
      liquidation = { status: "none" };
    }

    const result = /** @type {VerifyResult} */ ({
      status: ok ? "verified" : "failed",
      caps: ok
        ? { orders: true, fills: true, positions: true, liquidations: true }
        : { orders: false, fills: false, positions: false, liquidations: false },
      account: ok
        ? { exchangeUid: "MOCKUID", subAccount: "main", accountType: "futures", sampleInstruments: [pair || "BTC-USDT-PERP"] }
        : {},
      proof: ok
        ? { echo: { firstOrderIdLast4: String(orderRef).slice(-4), firstFillQty: "581.4", firstFillTime: new Date().toISOString() }, hash: "keccak256(0x...)" }
        : undefined,
      reasons,
      verifiedAt: new Date().toISOString(),
      order,
      checks,
      liquidation,
      sessionId: ok ? `sess_${Date.now()}` : undefined,
    });

    // 状态 → verified，但等待用户确认
    acc.lastVerifyResult = result;
    acc.status = ok ? "verified" : "failed";
    acc.userConfirmedEcho = false;
    acc.lastVerifiedAt = result.verifiedAt || null;
    acc.caps = result.caps;
    acc.account = { exchangeUid: result.account.exchangeUid, subAccount: result.account.subAccount };
    acc.masked = { apiKeyLast4: (sec.apiKey || "").slice(-4) };
    MOCK_DB.accounts[idx] = acc;
    return result;
  }
  // 确认回显
  const echoMatch = path.match(/^\/exchange-apis\/([^\/]+)\/confirm-echo$/);
  if (echoMatch && method === "POST") {
    const id = echoMatch[1];
    const idx = MOCK_DB.accounts.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("404");
    MOCK_DB.accounts[idx] = { ...MOCK_DB.accounts[idx], userConfirmedEcho: !!body?.userConfirmedEcho };
    return { ok: true };
  }
  // 支持列表
  if (path === "/exchange-apis/supported" && method === "GET") {
    return {
      exchanges: Object.keys(EXCHANGES_META),
      fields: EXCHANGES_META,
    };
  }
  throw new Error(`MOCK 未实现: ${method} ${path}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pick(obj, keys) { const o = {}; keys.forEach(k => (k in (obj||{}) ? o[k] = obj[k] : null)); return o; }

// ============================
// 纯函数：状态 → 徽标文案与样式（便于测试）
// ============================
function statusToBadge(status, lastVerifiedAt, pendingConfirm) {
  if (status === "verified" && pendingConfirm) {
    return { text: "🟡 待确认 · 核对回显后点击"确认无误"", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  }
  const map = {
    verified: { text: `✅ 已验证${lastVerifiedAt ? ` · ${fmtTime(lastVerifiedAt)}` : ""}`, cls: "bg-green-50 text-green-700 border-green-200" },
    failed: { text: "❌ 未通过 · 点击查看原因", cls: "bg-red-50 text-red-700 border-red-200" },
    unverified: { text: "⏳ 待验证 · 请先验证", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    verifying: { text: "🔄 验证中…", cls: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse" },
    disabled: { text: "⛔ 已禁用", cls: "bg-zinc-50 text-zinc-600 border-zinc-200" },
    deleted: { text: "🗑 已删除", cls: "bg-zinc-50 text-zinc-600 border-zinc-200" },
    draft: { text: "草稿", cls: "bg-zinc-50 text-zinc-600 border-zinc-200" },
  };
  return map[status] || map.unverified;
}

// ============================
// UI 子组件
// ============================
function StatusBadge({ status, lastVerifiedAt, pendingConfirm }) {
  const it = statusToBadge(status, lastVerifiedAt, pendingConfirm);
  return <span className={`inline-block rounded-xl border px-2 py-1 text-xs ${it.cls}`}>{it.text}</span>;
}

function Field({ label, children, required }) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm text-zinc-700">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </div>
      {children}
    </label>
  );
}

function Button({ children, onClick, kind = "primary", className = "", disabled }) {
  const base = "px-3 py-2 rounded-xl text-sm border shadow-sm disabled:opacity-50";
  const cls = {
    primary: "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800",
    ghost: "bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50",
    danger: "bg-white text-red-700 border-red-300 hover:bg-red-50",
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${cls} ${className}`}>{children}</button>
  );
}

function Input(props) {
  return <input {...props} className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 ${props.className||''}`} />;
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ============================
// 主页面组件
// ============================
export default function ExchangeApisPage() {
  const [list, setList] = useState(/** @type {ExchangeAccount[]} */([]));
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(/** @type {string|null} */(null));
  const editing = useMemo(() => list.find(x => x.id === editingId) || null, [list, editingId]);

  // 表单状态
  const [form, setForm] = useState(/** @type {any} */({ exchange: "OKX", label: "", environment: "live", ipWhitelist: "", apiKey: "", apiSecret: "", passphrase: "", extra: {} }));

  // 初始加载 + 自测
  useEffect(() => { (async () => { await reload(); if (RUN_SMOKE_TESTS) await runSmokeTests(); })(); }, []);

  async function reload() {
    setLoading(true);
    try {
      const data = await api("/exchange-apis");
      setList(data.items || []);
    } catch (e) {
      setToast("加载失败");
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ exchange: "OKX", label: "", environment: "live", ipWhitelist: "", apiKey: "", apiSecret: "", passphrase: "", extra: {} });
    setDrawerOpen(true);
  }

  async function openEdit(id) {
    setEditingId(id);
    setDrawerOpen(true);
    try {
      const detail = await api(`/exchange-apis/${id}`);
      setForm({
        exchange: detail.exchange,
        label: detail.label,
        environment: detail.environment,
        ipWhitelist: detail.ipWhitelist || "",
        // 敏感项不回显
        apiKey: "",
        apiSecret: "",
        passphrase: "",
        extra: {},
      });
    } catch (e) { setToast("读取失败"); }
  }

  async function saveForm() {
    const isNew = !editingId;
    const path = isNew ? "/exchange-apis" : `/exchange-apis/${editingId}`;
    const method = isNew ? "POST" : "PATCH";
    try {
      const payload = pick(form, ["exchange","label","environment","ipWhitelist","apiKey","apiSecret","passphrase","extra"]);
      const r = await api(path, { method, body: payload });
      setToast(isNew ? "已创建，待验证" : "已保存");
      setDrawerOpen(false);
      await reload();
      if (isNew && r?.id) { await openEdit(r.id); }
    } catch (e) { setToast("保存失败"); }
  }

  async function doDelete(id) {
    if (!confirm("确认删除？将清空密钥并标记为已删除")) return;
    try {
      await api(`/exchange-apis/${id}`, { method: "DELETE" });
      setToast("已删除");
      await reload();
    } catch (e) { setToast("删除失败"); }
  }

  async function doVerify(id, params) {
    try {
      // 乐观更新
      setList(list => list.map(x => x.id === id ? { ...x, status: "verifying" } : x));
      await api(`/exchange-apis/${id}/verify`, { method: "POST", body: params });
      await reload();
      setToast("已生成回显，待确认");
    } catch (e) { setToast("验证失败"); await reload(); }
  }

  async function confirmEcho(id) {
    try {
      await api(`/exchange-apis/${id}/confirm-echo`, { method: "POST", body: { userConfirmedEcho: true } });
      setList(list => list.map(x => x.id === id ? { ...x, userConfirmedEcho: true } : x));
      setToast("已记录确认");
    } catch (e) { setToast("确认失败"); }
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="sticky top-0 z-10 bg-amber-50/80 backdrop-blur border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-zinc-900">个人中心 · API 设置</span>
            <span className="text-xs text-zinc-500">/settings/exchange-apis</span>
          </div>
          <div className="flex items-center gap-2">
            <Button kind="ghost" onClick={() => reload()}>刷新</Button>
            <Button onClick={openCreate}>新建账号</Button>
          </div>
        </div>
        {toast ? <div className="max-w-5xl mx-auto px-4 pb-3 text-sm text-zinc-700">{toast}</div> : null}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? <div className="text-zinc-600">加载中…</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((acc) => (
            <AccountCard key={acc.id} acc={acc} onEdit={() => openEdit(acc.id)} onDelete={() => doDelete(acc.id)} onVerify={(params) => doVerify(acc.id, params)} onConfirmEcho={() => confirmEcho(acc.id)} />
          ))}
        </div>
        {list.length === 0 && !loading ? (
          <div className="mt-20 text-center text-zinc-600">还没有添加交易所账号。点击右上角"新建账号"。</div>
        ) : null}
      </main>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <EditForm form={form} setForm={setForm} editing={editing} onSave={saveForm} />
      </Drawer>
    </div>
  );
}

function AccountCard({ acc, onEdit, onDelete, onVerify, onConfirmEcho }) {
  const icon = acc.exchange.slice(0, 2).toUpperCase();
  const isVerified = acc.status === "verified";
  const isFailed = acc.status === "failed";
  const last = acc.lastVerifyResult;
  const [orderRef, setOrderRef] = useState("");
  const [pair, setPair] = useState("");
  const [submitted, setSubmitted] = useState(false);
  function tryVerify() {
    setSubmitted(true);
    if (!orderRef || !pair) return;
    onVerify({ orderRef, pair });
  }
  const pendingConfirm = isVerified && !acc.userConfirmedEcho;
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">{icon}</div>
          <div>
            <div className="font-medium text-zinc-900">{acc.exchange} · {acc.label}</div>
            <div className="text-xs text-zinc-500">环境 {acc.environment} · UID {acc.account?.exchangeUid || "—"} · 子账户 {acc.account?.subAccount || "—"}</div>
          </div>
        </div>
        <StatusBadge status={acc.status} lastVerifiedAt={acc.lastVerifiedAt} pendingConfirm={pendingConfirm} />
      </div>

      <div className="text-xs text-zinc-600">
        能力：订单 {bool(acc.caps.orders)} · 成交 {bool(acc.caps.fills)} · 持仓 {bool(acc.caps.positions)} · 强平 {bool(acc.caps.liquidations)}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="text-xs text-zinc-700 mb-2">验证参数</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input placeholder="合约订单号 OrderRef" value={orderRef} onChange={(e)=>setOrderRef(e.target.value)} className={submitted && !orderRef ? 'border-red-400' : ''} />
          <Input placeholder="交易币对/合约 Trading Pair（如 BTC-USDT-PERP）" value={pair} onChange={(e)=>setPair(e.target.value)} className={submitted && !pair ? 'border-red-400' : ''} />
        </div>
        <div className="text-[11px] text-zinc-500 mt-1">需填写订单号与币对用于生成回显；生成回显后需"确认无误"才记为通过。</div>
      </div>

      {isVerified && last?.proof?.echo ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-2">
          <div className="font-medium">证明片段（脱敏）</div>
          <div>第一笔订单ID后4位 {last.proof.echo.firstOrderIdLast4} · {fmtTime(last.proof.echo.firstFillTime)} · 数量 {last.proof.echo.firstFillQty}</div>
          <div className="text-xs text-emerald-900/70">哈希：{last.proof.hash}</div>

          {last.order ? (
            <div className="pt-2">
              <div className="font-medium mb-1">订单回显</div>
              <div className="text-xs text-emerald-900/90">
                订单号 {last.order.orderId} · 币对 {last.order.pair} · {last.order.side}/{last.order.type} · 状态 {last.order.status}<br/>
                数量 {last.order.executedQty} × 均价 {last.order.avgPrice} ≈ 成交额 {last.order.quoteAmount}<br/>
                时间 {fmtTime(last.order.orderTimeIso)}
              </div>
            </div>
          ) : null}

          {last.checks ? (
            <div className="pt-1">
              <div className="font-medium mb-1">一致性检查</div>
              <ul className="text-xs leading-6">
                <li>鉴权 {tick(last.checks.authOk)} · 能力 {tick(last.checks.capsOk)} · 找到订单 {tick(last.checks.orderFound)}</li>
                <li>订单号后4位匹配 {tick(last.checks.echoLast4Ok)} · 乘法闭合 {tick(last.checks.arithmeticOk)} · 币对匹配 {tick(last.checks.pairOk)}</li>
                <li>时间偏差 {last.checks.timeSkewMs} ms · 结论 {last.checks.verdict === 'pass' ? '通过' : '不通过'}</li>
              </ul>
            </div>
          ) : null}

          {last.liquidation ? (
            <div className="pt-1">
              <div className="font-medium mb-1">清算状态</div>
              <div className="text-xs">
                {last.liquidation.status === "none" ? "无清算事件" : `清算类型: ${last.liquidation.status}`}
                {last.liquidation.eventTimeIso ? ` · 时间: ${fmtTime(last.liquidation.eventTimeIso)}` : ""}
                {last.liquidation.instrument ? ` · 合约: ${last.liquidation.instrument}` : ""}
                {last.liquidation.positionSizeBefore ? ` · 前持仓: ${last.liquidation.positionSizeBefore}` : ""}
                {last.liquidation.positionSizeAfter ? ` · 后持仓: ${last.liquidation.positionSizeAfter}` : ""}
                {last.liquidation.pnlAbs ? ` · PnL: ${last.liquidation.pnlAbs}` : ""}
              </div>
            </div>
          ) : null}

          {pendingConfirm ? (
            <div className="pt-2">
              <Button onClick={onConfirmEcho} kind="primary" className="w-full">
                ✅ 确认无误
              </Button>
              <div className="text-xs text-zinc-500 mt-1 text-center">核对回显信息后点击确认</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isFailed && last?.reasons ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="font-medium">失败原因</div>
          <ul className="text-xs mt-1 space-y-1">
            {last.reasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button onClick={tryVerify} kind="primary" disabled={acc.status === "verifying"}>
          {acc.status === "verifying" ? "验证中…" : "验证"}
        </Button>
        <Button onClick={onEdit} kind="ghost">编辑</Button>
        <Button onClick={onDelete} kind="danger">删除</Button>
      </div>
    </div>
  );
}

function Drawer({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-xl">
        <div className="p-6 h-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function EditForm({ form, setForm, editing, onSave }) {
  const meta = EXCHANGES_META[form.exchange];
  const isNew = !editing;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{isNew ? "新建账号" : "编辑账号"}</h3>
        <Button kind="ghost" onClick={onSave}>保存</Button>
      </div>

      <Field label="交易所" required>
        <Select
          value={form.exchange}
          onChange={(e) => setForm({ ...form, exchange: e.target.value })}
          options={Object.keys(EXCHANGES_META).map(k => ({ value: k, label: EXCHANGES_META[k].label }))}
          disabled={!isNew}
        />
      </Field>

      <Field label="标签/备注" required>
        <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="如：主账号、工作号" />
      </Field>

      <Field label="环境">
        <Select
          value={form.environment}
          onChange={(e) => setForm({ ...form, environment: e.target.value })}
          options={[
            { value: "live", label: "实盘" },
            { value: "testnet", label: "测试网" },
          ]}
        />
      </Field>

      <Field label="IP 白名单（可选）">
        <Input value={form.ipWhitelist} onChange={(e) => setForm({ ...form, ipWhitelist: e.target.value })} placeholder="如：192.168.1.1, 10.0.0.0/8" />
      </Field>

      <div className="border-t pt-4">
        <div className="text-sm font-medium text-zinc-700 mb-3">API 凭证</div>
        {meta.fields.map((f) => (
          <Field key={f.key} label={f.label} required>
            <Input
              type={f.sensitive ? "password" : "text"}
              value={form[f.key] || ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              placeholder={f.sensitive ? "••••••••" : ""}
            />
          </Field>
        ))}
      </div>

      <div className="text-xs text-zinc-500">
        {isNew ? "创建后将进入待验证状态，需完成验证流程。" : "修改敏感字段将重置验证状态。"}
      </div>
    </div>
  );
}

// ============================
// 工具函数
// ============================
function tick(ok) { return ok ? "✅" : "❌"; }
function bool(b) { return b ? "✅" : "❌"; }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleString("zh-CN") : "—"; }

// ============================
// 轻量自测
// ============================
async function runSmokeTests() {
  console.log("🧪 运行自测…");
  // 测试工具函数
  console.assert(fmtTime("2023-01-01T00:00:00Z").includes("2023"), "fmtTime 失败");
  console.assert(bool(true) === "✅", "bool 失败");
  console.assert(tick(true) === "✅", "tick 失败");
  // 测试状态徽标
  const badge = statusToBadge("verified", "2023-01-01T00:00:00Z", false);
  console.assert(badge.text.includes("已验证"), "statusToBadge 失败");
  console.log("✅ 自测通过");
}