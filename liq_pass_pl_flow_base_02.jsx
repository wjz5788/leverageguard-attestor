import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Upload, ListChecks, Hash, Languages, Rocket, Shield, CheckCircle2 } from "lucide-react";

/**
 * LiqPass – Principal/Leverage Quote → Claim → Attest → Status (Single Page)
 * - No time-based SKU. Only P/L/Premium/Payout flow, matching grant review path.
 * - TailwindCSS + framer-motion + lucide-react. All client-side; demo-only.
 * - Uses WebCrypto for SHA-256 to synthesize a deterministic "root" & mock tx hash.
 *
 * IMPORTANT: This file is a single React component export. The `return` is
 * *inside* the `LiqPassPLFlow` function. If you paste this into Next.js,
 * do: `export default function Page() { return <LiqPassPLFlow/> }` in your
 * route file, or export this component as default and import it in your page.
 */

// ───────────────────────────────────────────────────────────────────────────────
// i18n dictionary
// ───────────────────────────────────────────────────────────────────────────────
const DICT = {
  zh: {
    brand: "LiqPass",
    chain: "Base Mainnet",
    tab_ux: "OKX 合约险 · UX",
    tab_quote: "报价（P/L→保费/赔付）",
    tab_claim: "爆仓证据上传",
    tab_attest: "上链存证",
    tab_status: "链上状态",
    lang: "中",
    hero_title: "输入 P / L 出报价 → 上传爆仓证据 → 上链存证 → 查看状态",
    hero_sub: "仅围绕 本金 / 杠杆 / 保费 / 赔付额；无按时段 SKU。演示可审计的上链存证路径。",
    pill_base: "Base 主网",
    pill_okx: "OKX · 首发",

    // Quote
    quote_title: "报价计算（仅演示）",
    principal: "本金 (USDT)",
    leverage: "杠杆 (×，≤100)",
    btn_get_quote: "生成报价",
    premium: "保费",
    payout: "赔付额",
    premium_ratio: "保费比例",
    payout_ratio: "赔付比例",
    quote_id: "报价编号",
    valid_until: "有效期（10 分钟）",
    pricing_ver: "价格版本",
    err_range: "本金需在 50–500 USDT，杠杆需在 1–100。",

    // Claim
    claim_title: "上传爆仓证据（OKX / JSON）",
    choose_sample: "选择示例",
    sample_none: "不使用示例",
    sample_okx_liq: "示例：OKX 爆仓（LINK-USDT 强平）",
    sample_binance_liq: "示例：币安爆仓（BTCUSDT 强平）",
    or_paste: "或粘贴 JSON 文本",
    btn_validate: "校验证据",
    validation_result: "校验结果",
    order_id_label: "订单号",
    order_id_placeholder: "请输入与交易所一致的订单号",
    pass: "通过",
    fail: "失败",
    claim_highlights: [
      {
        title: "申诉",
        desc: "触发仲裁或人工复核；与链上记录保持一致，确保申诉闭环。",
      },
      {
        title: "订单号",
        desc: "请填写交易所原始订单号，便于匹配 Merkle proof 与订单指纹。",
      },
      {
        title: "凭证材料",
        desc: "上传 CSV/JSON 或截图提取的最小字段，支持本地验证器重新补交。",
      },
    ],

    // Attest
    attest_title: "上链存证（生成 Root & 模拟 Tx）",
    btn_build_root: "生成 Root",
    btn_attest: "提交存证 (Mock)",
    root: "Merkle Root (演示)",
    txhash: "交易哈希 (模拟)",

    // Status
    status_title: "最近存证（演示数据）",

    // Steps
    steps_title: "用户路径（UX Flow）",
    s1: { title: "报价", body: "输入本金与杠杆，计算保费/赔付额，生成 quote_id。" },
    s2: { title: "申赔", body: "出现强平/ADL 时，上传样例或 JSON，自动校验关键信息。" },
    s3: { title: "存证", body: "对关键字段做哈希合成 Root，上链记录（本页为演示模拟）。" },
    s4: { title: "状态", body: "公开最近 N 笔 root/tx，评审可一键核对。" },

    // Footer
    disclaimer:
      "免责声明：本页面为演示 UX，不构成任何投资建议；样例数据与上链交易均为模拟，不涉及真实赔付。",
  },
  en: {
    brand: "LiqPass",
    chain: "Base Mainnet",
    tab_ux: "OKX Insurance · UX",
    tab_quote: "Quote (P/L → Premium/Payout)",
    tab_claim: "Liquidation Evidence",
    tab_attest: "Attest",
    tab_status: "Status",
    lang: "EN",
    hero_title:
      "Enter P/L → Upload Liq Evidence → On-chain Attestation → View Status",
    hero_sub:
      "Only Principal / Leverage / Premium / Payout. No time-based SKUs. Auditable attestation demo.",
    pill_base: "Base Mainnet",
    pill_okx: "OKX · First Launch",

    quote_title: "Quote (Demo)",
    principal: "Principal (USDT)",
    leverage: "Leverage (×, ≤100)",
    btn_get_quote: "Get Quote",
    premium: "Premium",
    payout: "Payout",
    premium_ratio: "Premium Ratio",
    payout_ratio: "Payout Ratio",
    quote_id: "Quote ID",
    valid_until: "Valid Until (10 min)",
    pricing_ver: "Pricing Version",
    err_range: "Principal must be 50–500 USDT and leverage must be 1–100.",

    claim_title: "Upload Liquidation Evidence (OKX / JSON)",
    choose_sample: "Choose Sample",
    sample_none: "No Sample",
    sample_okx_liq: "Sample: OKX Liquidation (LINK-USDT)",
    sample_binance_liq: "Sample: Binance Liquidation (BTCUSDT)",
    or_paste: "or paste JSON text",
    btn_validate: "Validate Evidence",
    validation_result: "Validation Result",
    order_id_label: "Order ID",
    order_id_placeholder: "Enter the exact exchange order ID",
    pass: "PASS",
    fail: "FAIL",
    claim_highlights: [
      {
        title: "Appeal",
        desc: "Trigger arbitration or manual review to close the loop with on-chain records.",
      },
      {
        title: "Order ID",
        desc: "Provide the original exchange order ID to match Merkle proof and trade fingerprint.",
      },
      {
        title: "Evidence",
        desc: "Upload CSV/JSON or extracted minimal fields; local validator can resubmit as needed.",
      },
    ],

    attest_title: "Attestation (Build Root & Mock Tx)",
    btn_build_root: "Build Root",
    btn_attest: "Submit Attestation (Mock)",
    root: "Merkle Root (Demo)",
    txhash: "Tx Hash (Mock)",

    status_title: "Recent Attestations (Demo)",

    steps_title: "User Flow",
    s1: {
      title: "Quote",
      body:
        "Enter principal & leverage → compute premium/payout & quote_id.",
    },
    s2: {
      title: "Claim",
      body:
        "When liquidation/ADL occurs, upload sample or JSON to auto-validate.",
    },
    s3: {
      title: "Attest",
      body: "Hash key fields to form a Root; record on-chain (mock here).",
    },
    s4: { title: "Status", body: "Expose latest root/tx for auditability." },

    disclaimer:
      "Disclaimer: Demo UX only. Not financial advice; samples & on-chain tx are mocked with no real payout.",
  },
};

// ───────────────────────────────────────────────────────────────────────────────
// Samples (for Claim demo)
// ───────────────────────────────────────────────────────────────────────────────
const SAMPLE_OKX_LIQ = {
  exchange: "OKX",
  pair: "LINK-USDT-SWAP",
  event: "LIQUIDATION",
  side: "LONG",
  quantity: 176,
  price: 13.516,
  timestamp: "2024-05-02T13:30:50Z",
};

const SAMPLE_BINANCE_LIQ = {
  exchange: "BINANCE",
  pair: "BTCUSDT-PERP",
  event: "LIQUIDATION",
  side: "LONG",
  quantity: 3,
  price: 61000.5,
  timestamp: "2024-05-02T13:31:12Z",
};

const SAMPLE_NORMAL = {
  exchange: "OKX",
  pair: "LINK-USDT-SWAP",
  event: "NORMAL_CLOSE",
  side: "LONG",
  quantity: 10,
  price: 13.9,
  timestamp: "2024-05-02T13:40:10Z",
};

function classNames(...a) {
  return a.filter(Boolean).join(" ");
}

// WebCrypto SHA-256 → hex (browser)
async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ───────────────────────────────────────────────────────────────────────────────
// Pricing (align with user's Python/JS spec)
// ───────────────────────────────────────────────────────────────────────────────
const QUOTE_TTL_MIN = 10; // quote validity window in minutes
const LEVERAGE_MAX = 100; // leverage upper bound

function calcPremium(principal, leverage) {
  const baseRatio = 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02;
  const premiumRatio = Math.min(0.15, baseRatio);
  return { premium: +(premiumRatio * principal).toFixed(2), premiumRatio: +premiumRatio.toFixed(4) };
}

function calcPayoutRatio(principal, leverage) {
  const baseRatio = 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1;
  return Math.min(0.5, Math.max(0.1, baseRatio));
}

function calcPayout(principal, leverage) {
  const ratio = calcPayoutRatio(principal, leverage);
  return { payout: +(ratio * principal).toFixed(2), payoutRatio: +ratio.toFixed(4) };
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────
export default function LiqPassPLFlow() {
  // i18n & tabs
  const [lang, setLang] = useState("zh");
  const t = DICT[lang];
  const [active, setActive] = useState("ux"); // ux | quote | claim | attest | status

  // Quote state
  const [principal, setPrincipal] = useState(500);
  const [leverage, setLeverage] = useState(10);
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState("");

  // Claim state
  const [sample, setSample] = useState("none");
  const [jsonText, setJsonText] = useState("");
  const [claimRes, setClaimRes] = useState(null);
  const [orderId, setOrderId] = useState("");

  // Attest state
  const [root, setRoot] = useState("");
  const [tx, setTx] = useState("");
  const [status, setStatus] = useState([
    {
      when: "2025-10-11 05:30:57 UTC",
      root: "0xb815fb0e7b1a244c84e366fe6203adb963122ef7379d7ad9b2411240639900ff",
      tx: "0x27fd052c9450674457ad5f7f560fc2ea8fbe78534653b70f409a9d633720853e",
      order: "wjz5788.com demo"
    }
  ]); // recent attestations

  const PRICING_VERSION = "pl-formula-v1"; // matches user's spec

  function computeQuote(P, L) {
    const { premium, premiumRatio } = calcPremium(P, L);
    const { payout, payoutRatio } = calcPayout(P, L);
    const quoteId = `Q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const validTs = Date.now() + QUOTE_TTL_MIN * 60 * 1000;
    const valid = new Date(validTs).toLocaleString();
    return { payout, premium, premiumRatio, payoutRatio, quoteId, valid, validTs, pricingVersion: PRICING_VERSION };
  }

  function handleGetQuote() {
    const P = Number(principal), L = Number(leverage);
    if (!Number.isFinite(P) || !Number.isFinite(L) || P < 50 || P > 500 || L < 1 || L > LEVERAGE_MAX) {
      setQuote(null);
      setQuoteErr(t.err_range);
      return;
    }
    setQuoteErr("");
    const q = computeQuote(P, L);
    setQuote(q);
  }

  function buildEvidenceSummary() {
    const evidence =
      sample === "okx_liq" ? SAMPLE_OKX_LIQ : sample === "binance_liq" ? SAMPLE_BINANCE_LIQ
        : (() => {
            try {
              return JSON.parse(jsonText || "{}");
            } catch {
              return {};
            }
          })();
    return {
      order_id: orderId || quote?.quoteId || `DEMO-${Date.now()}`,
      principal: Number(principal || 0),
      leverage: Number(leverage || 0),
      payout: quote?.payout ?? calcPayout(Number(principal||0), Number(leverage||0)).payout,
      premium: quote?.premium ?? calcPremium(Number(principal||0), Number(leverage||0)).premium,
      pricing_version: PRICING_VERSION,
      evidence,
    };
  }

  function validateEvidence(evd) {
    if (!evd || !evd.event) return { ok: false, reason: "MISSING_EVENT" };
    const ok_pair = !!evd.pair;
    const ok_time = !!evd.timestamp;
    const isLiq =
      evd.event.toUpperCase().includes("LIQUIDATION") ||
      evd.event.toUpperCase().includes("ADL");
    return { ok: ok_pair && ok_time && isLiq, reason: isLiq ? "" : "NOT_LIQUIDATION" };
  }

  async function handleValidate() {
    const summary = buildEvidenceSummary();
    const res = validateEvidence(summary.evidence);
    setClaimRes({ summary, res });
  }

  async function handleBuildRoot() {
    const payload = claimRes?.summary || buildEvidenceSummary();
    const canon = JSON.stringify(payload);
    const h = await sha256Hex(canon);
    setRoot("0x" + h);
  }

  async function handleAttest() {
    if (!root) await handleBuildRoot();
    const txHash = "0x" + (await sha256Hex(root + Date.now())).slice(0, 64);
    setTx(txHash);
    const item = {
      when: new Date().toLocaleString(),
      root,
      tx: txHash,
      order: claimRes?.summary?.order_id,
    };
    setStatus((s) => [item, ...s].slice(0, 8));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Dev self-tests (browser console) – lightweight test cases
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      // Test 1: premium for (P=500, L=20)
      // baseRatio = 0.05 + 0 + 0.02 = 0.07 → premium=35.00
      const t1 = calcPremium(500, 20); 
      console.assert(t1.premium === 35.00, "premium should be 35.00 for (500,20)");

      // Test 2: premium cap at 0.15 (P=500, L=200)
      // base=0.05 + 0.18 + 0.02 = 0.25 → cap 0.15 → premium=75.00
      const t2 = calcPremium(500, 200);
      console.assert(t2.premium === 75.00 && t2.premiumRatio === 0.15, "premium cap to 0.15 and 75.00 USDT");

      // Test 3: payout lower clamp 0.1 (P=500, L=20 ⇒ base=0)
      const p1 = calcPayout(500, 20); // 0.1 * 500 = 50
      console.assert(p1.payout === 50.00, "payout should clamp to 10% → 50");

      // Test 4: payout upper clamp 0.5 (P=500, L=150)
      const p2 = calcPayout(500, 150); // 0.5 * 500 = 250
      console.assert(p2.payout === 250.00, "payout should cap at 50% → 250");

      // Test 5: small principal (P=50, L=1)
      const t3 = calcPremium(50, 1); // base=0.033 → premium=1.65
      const p3 = calcPayout(50, 1);  // clamp 0.1 → payout=5.00
      console.assert(t3.premium === 1.65 && p3.payout === 5.00, "edge case (50,1)");

      // Test 6: quote validity TTL (~10 min)
      const qv = computeQuote(100, 10);
      console.assert(qv.validTs - Date.now() <= QUOTE_TTL_MIN * 60000 && qv.validTs - Date.now() >= 0, "validTs within TTL window");
    } catch (e) {
      console.warn("Self-tests failed:", e);
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // UI building blocks
  // ───────────────────────────────────────────────────────────────────────────
  const Tab = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActive(id)}
      className={classNames(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm",
        active === id
          ? "bg-white/90 text-slate-900"
          : "bg-white/10 text-white hover:bg-white/20"
      )}
    >
      {Icon && <Icon size={16} />} {label}
    </button>
  );

  const Stat = ({ label, value }) => (
    <div className="flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );

  const StepCard = ({ idx, title, body, icon: Icon }) => (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 h-full">
      <div className="flex items-center gap-2 text-white/80 text-xs tracking-wide">
        <span className="px-2 py-0.5 rounded-full bg-white/10">STEP {idx}</span>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {Icon && <Icon size={18} className="text-white/80" />}
        <div className="font-semibold">{title}</div>
      </div>
      <div className="text-sm text-white/70 mt-2 leading-relaxed">{body}</div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render (INSIDE the component – do not move this `return` outside)
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950" />

      {/* Nav */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-indigo-300" />
            <div className="font-semibold">
              {t.brand} <span className="text-white/50">({t.chain})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs bg-emerald-400/15 text-emerald-300 border border-emerald-400/20">
              {t.pill_base}
            </span>
            <span className="px-3 py-1 rounded-full text-xs bg-violet-400/15 text-violet-300 border border-violet-400/20">
              {t.pill_okx}
            </span>
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="ml-2 px-3 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20"
            >
              <Languages size={14} className="inline mr-1" />
              {t.lang}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mt-5">
          <Tab id="ux" label={t.tab_ux} icon={Rocket} />
          <Tab id="quote" label={t.tab_quote} icon={Calculator} />
          <Tab id="claim" label={t.tab_claim} icon={Upload} />
          <Tab id="attest" label={t.tab_attest} icon={Hash} />
          <Tab id="status" label={t.tab_status} icon={ListChecks} />
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 mt-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-8 bg-white/5 border border-white/10"
        >
          <div className="text-2xl md:text-3xl font-semibold tracking-wide">
            {t.hero_title}
          </div>
          <div className="text-white/70 mt-2">{t.hero_sub}</div>
        </motion.div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 mt-8 pb-20">
        {active === "ux" && (
          <div>
            <div className="text-white/80 tracking-wide font-semibold mb-3">
              {t.steps_title}
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <StepCard idx={1} title={t.s1.title} body={t.s1.body} icon={Calculator} />
              <StepCard idx={2} title={t.s2.title} body={t.s2.body} icon={Upload} />
              <StepCard idx={3} title={t.s3.title} body={t.s3.body} icon={Hash} />
              <StepCard idx={4} title={t.s4.title} body={t.s4.body} icon={ListChecks} />
            </div>
          </div>
        )}

        {active === "quote" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-6"
          >
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
              <div className="text-lg font-semibold mb-4">{t.quote_title}</div>
              <label className="block text-sm text-white/70 mb-2">{t.principal}</label>
              <input
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-4"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                min={0}
              />
              <label className="block text-sm text-white/70 mb-2">{t.leverage}</label>
              <input
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-2"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                min={1}
                max={LEVERAGE_MAX}
              />
              {quoteErr && (
                <div className="text-rose-300 text-xs mb-3">{quoteErr}</div>
              )}
              <button
                onClick={handleGetQuote}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-medium"
              >
                {t.btn_get_quote}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Stat label={t.premium} value={quote ? `${quote.premium} USDT` : "-"} />
              <Stat label={t.payout} value={quote ? `${quote.payout} USDT` : "-"} />
              <Stat label={t.premium_ratio} value={quote ? `${(quote.premiumRatio*100).toFixed(2)}%` : "-"} />
              <Stat label={t.payout_ratio} value={quote ? `${(quote.payoutRatio*100).toFixed(2)}%` : "-"} />
              <Stat label={t.quote_id} value={quote?.quoteId || "-"} />
              <Stat label={t.pricing_ver} value={quote?.pricingVersion || "-"} />
              <Stat label={t.valid_until} value={quote?.valid || "-"} />
            </div>
          </motion.div>
        )}

        {active === "claim" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-white/5 border border-white/10"
          >
            <div className="text-lg font-semibold mb-4">{t.claim_title}</div>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {t.claim_highlights.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-3xl border border-rose-500/70 bg-rose-500/10 px-6 py-5 shadow-inner shadow-rose-500/10"
                >
                  <div className="text-base font-semibold text-rose-200 mb-2">
                    {item.title}
                  </div>
                  <div className="text-xs leading-relaxed text-rose-100/80">
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-4 items-start">
              <div>
                <label className="block text-sm text-white/70 mb-2">
                  {t.choose_sample}
                </label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3"
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                >
                  <option value="none">{t.sample_none}</option>
                  <option value="okx_liq">{t.sample_okx_liq}</option>
                  <option value="binance_liq">{t.sample_binance_liq}</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm text-white/70 mb-2">{t.order_id_label}</label>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <input
                    type="text"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3"
                    value={orderId}
                    onChange={(e)=>setOrderId(e.target.value)}
                    placeholder={t.order_id_placeholder}
                  />
                  <button
                    onClick={handleValidate}
                    className="mt-3 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-medium"
                  >
                    {t.btn_validate}
                  </button>
                  <div className="text-xs text-white/60 mt-2">
                    {(sample === "okx_liq" ? "OKX" : sample === "binance_liq" ? "BINANCE" : "—")} · {t.order_id_label}
                  </div>
                </div>
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm text-white/70 mb-2">
                  {t.or_paste}
                </label>
                <textarea
                  rows={6}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 font-mono text-sm"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder={`{\n  "exchange": "OKX",\n  "pair": "BTC-USDT",\n  "event": "LIQUIDATION",\n  "timestamp": "2024-05-02T13:30:50Z"\n}`}
                />
              </div>
            </div>

            {claimRes && (
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-sm text-white/60 mb-2">
                    {t.validation_result}
                  </div>
                  <div
                    className={classNames(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                      claimRes.res.ok
                        ? "bg-emerald-400/20 text-emerald-300"
                        : "bg-rose-400/20 text-rose-300"
                    )}
                  >
                    <CheckCircle2 size={16} />
                    {claimRes.res.ok ? t.pass : t.fail}
                  </div>
                  <pre className="mt-3 text-xs text-white/70 whitespace-pre-wrap">
                    {JSON.stringify(claimRes.summary, null, 2)}
                  </pre>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-sm text-white/60 mb-2">{t.attest_title}</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleBuildRoot}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
                    >
                      {t.btn_build_root}
                    </button>
                    <button
                      onClick={handleAttest}
                      className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600"
                    >
                      {t.btn_attest}
                    </button>
                  </div>
                  <div className="mt-3 text-xs break-all">
                    <span className="text-white/60 mr-2">{t.root}:</span>
                    {root || "-"}
                  </div>
                  <div className="mt-2 text-xs break-all">
                    <span className="text-white/60 mr-2">{t.txhash}:</span>
                    {tx || "-"}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {active === "attest" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-white/5 border border-white/10"
          >
            <div className="text-lg font-semibold mb-4">{t.attest_title}</div>
            <div className="text-sm text-white/70 mb-3">
              {t.root}: <span className="text-white break-all">{root || "-"}</span>
            </div>
            <div className="text-sm text-white/70 mb-6">
              {t.txhash}: <span className="text-white break-all">{tx || "-"}</span>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20" onClick={handleBuildRoot}>
                {t.btn_build_root}
              </button>
              <button className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600" onClick={handleAttest}>
                {t.btn_attest}
              </button>
            </div>
          </motion.div>
        )}

        {active === "status" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-lg font-semibold mb-4">{t.status_title}</div>
            <div className="text-xs text-white/60 mb-3">Demo: <a href="https://wjz5788.com/attest/" target="_blank" rel="noreferrer" className="underline">wjz5788.com/attest</a></div>
            <div className="grid gap-3">
              {status.length === 0 && (
                <div className="text-white/60 text-sm">—</div>
              )}
              {status.map((it, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10"
                >
                  <div className="text-xs text-white/60">{it.when}</div>
                  <div className="text-sm mt-1">
                    <span className="text-white/60 mr-2">Root:</span>
                    <span className="break-all">{it.root}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-white/60 mr-2">Tx:</span>
                    <span className="break-all">{it.tx}</span>
                  </div>
                  <div className="text-sm text-white/70">
                    <span className="text-white/60 mr-2">Order:</span>
                    {it.order}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="mt-12 text-xs text-white/50">{t.disclaimer}</div>
      </div>
    </div>
  );
}
