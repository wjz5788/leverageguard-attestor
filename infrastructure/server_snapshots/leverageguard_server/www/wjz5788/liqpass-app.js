import React, { useEffect, useMemo, useState, useCallback } from "https://esm.sh/react@18.2.0";
      import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
      import { ethers } from "https://esm.sh/ethers@6.9.0";
      import {
        Calculator, Upload, ListChecks, Hash, Languages, Rocket, Shield, CheckCircle2
      } from "https://esm.sh/lucide-react@0.323.0";

      /* -------------------- Locale Core (from prototype, slightly simplified) -------------------- */
      const SUPPORTED_LOCALES = ["zh-CN", "en-US"];
      const LANGUAGE_LABELS = { "zh-CN": "中", "en-US": "EN" };

      function formatMessage(template, vars = {}) {
        if (typeof template !== "string") return "";
        return template.replace(/\\{(\\w+)\\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
      }

      const LocaleContext = React.createContext({
        locale: "zh-CN",
        setLocale: () => {},
        tr: (zh, en, vars) => formatMessage(zh, vars)
      });

      function useLocale() { return React.useContext(LocaleContext); }
      function detectInitialLocale() {
        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage?.getItem("liqpass.locale");
            if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
          } catch (_) {}
          if (typeof navigator !== "undefined") {
            const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
            if (navLang.startsWith("en")) return "en-US";
          }
        }
        return "zh-CN";
      }

      /* -------------------- Part A: P/L Quote + Claim + Attest (from liq_pass_pl_flow_base_02) -------------------- */
      const DICT = {
        zh: {
          brand: "LiqPass",
          chain: "Base 主网",
          tab_ux: "OKX 合约险 · UX",
          tab_quote: "报价（P/L→保费/赔付）",
          tab_claim: "爆仓证据上传",
          tab_attest: "上链存证",
          tab_status: "链上状态",
          hero_title: "输入 P / L 出报价 → 上传爆仓证据 → 上链存证 → 查看状态",
          hero_sub: "仅围绕 本金 / 杠杆 / 保费 / 赔付额；无按时段 SKU。演示可审计的上链存证路径。",
          pill_base: "Base 主网",
          pill_okx: "OKX · 首发",

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

          claim_title: "上传爆仓证据（OKX / JSON）",
          choose_sample: "选择示例",
          sample_none: "不使用示例",
          sample_okx_liq: "示例：OKX 爆仓（LINK-USDT 强平）",
          sample_binance_liq: "示例：币安爆仓（BTCUSDT 强平）",
          or_paste: "或粘贴 JSON 文本",
          json_input_label: "JSON 凭证（可选）",
          appeal_title: "申诉通道",
          appeal_intro: "自动校验未通过时，可提交申诉以人工复核。",
          appeal_reason_label: "申诉说明",
          appeal_reason_placeholder: "请描述强平细节、截图链接等补充信息。",
          appeal_contact_label: "联系邮箱或 Telegram（可选）",
          appeal_contact_placeholder: "例如：user@example.com / @handle",
          btn_submit_appeal: "提交申诉",
          appeal_submitted: "申诉已接收，我们将尽快处理。",
          appeal_require_reason: "请填写申诉说明后再提交。",
          appeal_reference: "申诉编号",
          btn_validate: "校验证据",
          validation_result: "校验结果",
          order_id_label: "订单号",
          order_id_placeholder: "请输入与交易所一致的订单号",
          pass: "通过",
          fail: "失败",
          claim_highlights: [
            { title: "申诉", desc: "触发仲裁或人工复核；与链上记录保持一致，确保申诉闭环。" },
            { title: "订单号", desc: "请填写交易所原始订单号，便于匹配 Merkle proof 与订单指纹。" },
            { title: "凭证材料", desc: "上传 CSV/JSON 或截图提取的最小字段，支持本地验证器重新补交。" },
          ],

          attest_title: "上链存证（生成 Root & 模拟 Tx）",
          btn_build_root: "生成 Root",
          btn_attest: "提交存证 (Mock)",
          root: "Merkle Root (演示)",
          txhash: "交易哈希 (模拟)",

          status_title: "最近存证（演示数据）",
          steps_title: "用户路径（UX Flow）",
          s1: { title: "报价", body: "输入本金与杠杆，计算保费/赔付额，生成 quote_id。" },
          s2: { title: "申赔", body: "出现强平/ADL 时，上传样例或 JSON，自动校验关键信息。" },
          s3: { title: "存证", body: "对关键字段做哈希合成 Root，上链记录（本页为演示模拟）。" },
          s4: { title: "状态", body: "公开最近 N 笔 root/tx，评审可一键核对。" },
          disclaimer: "免责声明：本组件为演示 UX，不构成投资建议；样例数据与上链交易均为模拟。"
        },
        en: {
          brand: "LiqPass",
          chain: "Base Mainnet",
          tab_ux: "OKX Insurance · UX",
          tab_quote: "Quote (P/L → Premium/Payout)",
          tab_claim: "Liquidation Evidence",
          tab_attest: "Attest",
          tab_status: "Status",
          hero_title: "Enter P/L → Upload Liq Evidence → On-chain Attestation → View Status",
          hero_sub: "Only Principal / Leverage / Premium / Payout. Auditable attestation demo.",
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
          err_range: "Principal must be 50–500 USDT and leverage 1–100.",

          claim_title: "Upload Liquidation Evidence (OKX / JSON)",
          choose_sample: "Choose Sample",
          sample_none: "No Sample",
          sample_okx_liq: "Sample: OKX Liquidation (LINK-USDT)",
          sample_binance_liq: "Sample: Binance Liquidation (BTCUSDT)",
          or_paste: "or paste JSON text",
          json_input_label: "JSON Evidence (optional)",
          appeal_title: "Appeal Channel",
          appeal_intro: "Auto validation failed. Provide details for manual review.",
          appeal_reason_label: "Appeal Notes",
          appeal_reason_placeholder: "Describe liquidation details, links to proofs, etc.",
          appeal_contact_label: "Contact Email or Telegram (optional)",
          appeal_contact_placeholder: "e.g. user@example.com / @handle",
          btn_submit_appeal: "Submit Appeal",
          appeal_submitted: "Appeal received. We'll review soon.",
          appeal_require_reason: "Please add appeal notes before submitting.",
          appeal_reference: "Appeal Reference",
          btn_validate: "Validate Evidence",
          validation_result: "Validation Result",
          order_id_label: "Order ID",
          order_id_placeholder: "Enter the exact exchange order ID",
          pass: "PASS",
          fail: "FAIL",
          claim_highlights: [
            { title: "Appeal", desc: "Trigger arbitration/manual review to close the loop with on-chain records." },
            { title: "Order ID", desc: "Provide original exchange order ID to match Merkle proof & trade fingerprint." },
            { title: "Evidence", desc: "Upload CSV/JSON or minimal fields; local validator may resubmit." },
          ],

          attest_title: "Attestation (Build Root & Mock Tx)",
          btn_build_root: "Build Root",
          btn_attest: "Submit Attestation (Mock)",
          root: "Merkle Root (Demo)",
          txhash: "Tx Hash (Mock)",

          status_title: "Recent Attestations (Demo)",
          steps_title: "User Flow",
          s1: { title: "Quote", body: "Enter principal & leverage → compute premium/payout & quote_id." },
          s2: { title: "Claim", body: "When liquidation/ADL occurs, upload sample or JSON for auto-validation." },
          s3: { title: "Attest", body: "Hash key fields to form a Root; record on-chain (mocked here)." },
          s4: { title: "Status", body: "Expose latest root/tx for auditability." },
          disclaimer: "Disclaimer: Demo UX only; samples & on-chain tx are mocked with no real payout."
        },
      };

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

      function classNames(...a) { return a.filter(Boolean).join(" "); }
      async function sha256Hex(text) {
        const enc = new TextEncoder();
        const data = enc.encode(text);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
      }
      const QUOTE_TTL_MIN = 10;
      const LEVERAGE_MAX = 100;
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

      function PLFlow() {
        const { locale } = useLocale();
        const langKey = locale === "en-US" ? "en" : "zh";
        const t = DICT[langKey];
        const [active, setActive] = useState("quote");

        const [principal, setPrincipal] = useState(500);
        const [leverage, setLeverage] = useState(10);
        const [quote, setQuote] = useState(null);
        const [quoteErr, setQuoteErr] = useState("");

        const [sample, setSample] = useState("none");
        const [jsonText, setJsonText] = useState("");
        const [claimRes, setClaimRes] = useState(null);
        const [orderId, setOrderId] = useState("");
        const [appealNote, setAppealNote] = useState("");
        const [appealContact, setAppealContact] = useState("");
        const [appealStatus, setAppealStatus] = useState("");
        const [appealTicket, setAppealTicket] = useState("");

        const [root, setRoot] = useState("");
        const [tx, setTx] = useState("");
        const [status, setStatus] = useState([
          {
            when: "2025-10-11 05:30:57 UTC",
            root: "0xb815fb0e7b1a244c84e366fe6203adb963122ef7379d7ad9b2411240639900ff",
            tx: "0x27fd052c9450674457ad5f7f560fc2ea8fbe78534653b70f409a9d633720853e",
            order: "wjz5788.com demo"
          }
        ]);

        const PRICING_VERSION = "pl-formula-v1";
        const computeQuote = useCallback((P, L) => {
          const { premium, premiumRatio } = calcPremium(P, L);
          const { payout, payoutRatio } = calcPayout(P, L);
          const quoteId = `Q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const validTs = Date.now() + QUOTE_TTL_MIN * 60 * 1000;
          const valid = new Date(validTs).toLocaleString();
          return { payout, premium, premiumRatio, payoutRatio, quoteId, valid, validTs, pricingVersion: PRICING_VERSION };
        }, []);

        const handleGetQuote = useCallback(() => {
          const P = Number(principal), L = Number(leverage);
          if (!Number.isFinite(P) || !Number.isFinite(L) || P < 50 || P > 500 || L < 1 || L > LEVERAGE_MAX) {
            setQuote(null);
            setQuoteErr(t.err_range);
            return;
          }
          setQuoteErr("");
          const q = computeQuote(P, L);
          setQuote(q);
        }, [principal, leverage, computeQuote, t.err_range]);

        const buildEvidenceSummary = useCallback(() => {
          const evidence =
            sample === "okx_liq" ? SAMPLE_OKX_LIQ : sample === "binance_liq" ? SAMPLE_BINANCE_LIQ
              : (() => { try { return JSON.parse(jsonText || "{}"); } catch { return {}; } })();
          return {
            order_id: orderId || quote?.quoteId || `DEMO-${Date.now()}`,
            principal: Number(principal || 0),
            leverage: Number(leverage || 0),
            payout: quote?.payout ?? calcPayout(Number(principal||0), Number(leverage||0)).payout,
            premium: quote?.premium ?? calcPremium(Number(principal||0), Number(leverage||0)).premium,
            pricing_version: PRICING_VERSION,
            evidence,
          };
        }, [sample, jsonText, orderId, quote, principal, leverage]);

        const handleValidate = useCallback(async () => {
          const summary = buildEvidenceSummary();
          const input = JSON.stringify(summary);
          const proof = await sha256Hex(input);
          const ok = summary.evidence?.event === "LIQUIDATION";
          setClaimRes({ res: { ok, proof }, summary });
          setAppealNote("");
          setAppealContact("");
          setAppealStatus("");
          setAppealTicket("");
        }, [buildEvidenceSummary]);

        const handleBuildRoot = useCallback(async () => {
          if (claimRes?.res && !claimRes.res.ok) return;
          if (!claimRes) {
            const summary = buildEvidenceSummary();
            const proof = await sha256Hex(JSON.stringify(summary));
            setClaimRes({ res: { ok: true, proof }, summary });
            setRoot(proof);
            return;
          }
          const leaf = JSON.stringify(claimRes.summary);
          const newRoot = await sha256Hex(leaf + Date.now());
          setRoot(newRoot);
        }, [claimRes, buildEvidenceSummary]);

        const handleAttest = useCallback(async () => {
          if (claimRes?.res && !claimRes.res.ok) return;
          if (!root) return;
          const mockTx = await sha256Hex(root + Math.random());
          setTx(mockTx);
          setStatus((prev) => [
            { when: new Date().toISOString(), root, tx: mockTx, order: claimRes?.summary?.order_id ?? "demo-order" },
            ...prev.slice(0, 4),
          ]);
        }, [root, claimRes]);

        const handleSubmitAppeal = useCallback(async () => {
          if (!claimRes || claimRes.res.ok) return;
          const reason = appealNote.trim();
          const contact = appealContact.trim();
          if (!reason) {
            setAppealStatus("missing");
            setAppealTicket("");
            return;
          }
          setAppealStatus("submitting");
          const payload = {
            ...claimRes.summary,
            appeal: {
              reason,
              contact: contact || undefined,
              submitted_at: new Date().toISOString()
            }
          };
          const ticket = await sha256Hex(JSON.stringify(payload));
          setAppealTicket(ticket);
          setAppealStatus("submitted");
        }, [appealNote, appealContact, claimRes]);

        const Tab = ({ id, label, icon: Icon }) => (
          React.createElement("button", {
              onClick: () => setActive(id),
              className: classNames(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm",
                active === id ? "bg-white/90 text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
              )
            },
            Icon ? React.createElement(Icon, { size: 16 }) : null,
            " ", label
          )
        );

        const Stat = ({ label, value }) => (
          React.createElement("div", { className: "flex flex-col p-4 rounded-2xl bg-white/5 border border-white/10" },
            React.createElement("div", { className: "text-xs text-white/60" }, label),
            React.createElement("div", { className: "text-lg font-semibold mt-1" }, value)
          )
        );

        const StepCard = ({ idx, title, body, icon: Icon }) => (
          React.createElement("div", { className: "p-5 rounded-2xl bg-white/5 border border-white/10 h-full" },
            React.createElement("div", { className: "flex items-center gap-2 text-white/80 text-xs tracking-wide" },
              React.createElement("span", { className: "px-2 py-0.5 rounded-full bg-white/10" }, `STEP ${idx}`)
            ),
            React.createElement("div", { className: "flex items-center gap-2 mt-3" },
              Icon ? React.createElement(Icon, { size: 18, className: "text-white/80" }) : null,
              React.createElement("div", { className: "font-semibold" }, title)
            ),
            React.createElement("div", { className: "text-sm text-white/70 mt-2 leading-relaxed" }, body)
          )
        );

        return React.createElement(React.Fragment, null,
          React.createElement("div", { className: "max-w-6xl mx-auto px-4 mt-6" },
            React.createElement("div", { className: "rounded-3xl p-6 bg-white/5 border border-white/10" },
              React.createElement("div", { className: "text-2xl md:text-3xl font-semibold tracking-wide" }, t.hero_title),
              React.createElement("div", { className: "text-white/70 mt-2" }, t.hero_sub)
            )
          ),
          React.createElement("div", { className: "max-w-6xl mx-auto px-4 mt-6 pb-16" },
            React.createElement("div", { className: "flex flex-wrap gap-2 mb-6" },
              React.createElement(Tab, { id: "quote", label: t.tab_quote, icon: Calculator }),
              React.createElement(Tab, { id: "claim", label: t.tab_claim, icon: Upload }),
              React.createElement(Tab, { id: "attest", label: t.tab_attest, icon: Hash }),
              React.createElement(Tab, { id: "status", label: t.tab_status, icon: ListChecks })
            ),
            active === "quote" && React.createElement("div", { className: "grid md:grid-cols-2 gap-6" },
              React.createElement("div", { className: "p-6 rounded-3xl bg-white/5 border border-white/10" },
                React.createElement("div", { className: "text-lg font-semibold mb-4" }, t.quote_title),
                React.createElement("label", { className: "block text-sm text-white/70 mb-2" }, t.principal),
                React.createElement("input", {
                  type: "number", value: principal, onChange: (e)=>setPrincipal(e.target.value),
                  className: "w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-3"
                }),
                React.createElement("label", { className: "block text-sm text-white/70 mb-2" }, t.leverage),
                React.createElement("input", {
                  type: "number", value: leverage, onChange: (e)=>setLeverage(e.target.value),
                  className: "w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-3"
                }),
                React.createElement("button", {
                  onClick: handleGetQuote,
                  className: "w-full px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-semibold"
                }, t.btn_get_quote),
                quoteErr && React.createElement("div", { className: "text-rose-300 text-sm mt-3" }, quoteErr)
              ),
              React.createElement("div", { className: "p-6 rounded-3xl bg-white/5 border border-white/10" },
                React.createElement("div", { className: "text-lg font-semibold mb-4" }, t.quote_title),
                React.createElement("div", { className: "grid grid-cols-2 gap-4" },
                  React.createElement(Stat, { label: t.premium, value: quote ? `${quote.premium} USDT` : "-" }),
                  React.createElement(Stat, { label: t.payout, value: quote ? `${quote.payout} USDT` : "-" }),
                  React.createElement(Stat, { label: t.premium_ratio, value: quote ? `${(quote.premiumRatio*100).toFixed(2)}%` : "-" }),
                  React.createElement(Stat, { label: t.payout_ratio, value: quote ? `${(quote.payoutRatio*100).toFixed(2)}%` : "-" }),
                  React.createElement(Stat, { label: t.quote_id, value: quote?.quoteId || "-" }),
                  React.createElement(Stat, { label: t.pricing_ver, value: quote?.pricingVersion || "-" }),
                  React.createElement(Stat, { label: t.valid_until, value: quote?.valid || "-" })
                )
              )
            ),
            active === "claim" && React.createElement("div", { className: "p-6 rounded-3xl bg-white/5 border border-white/10" },
              React.createElement("div", { className: "text-lg font-semibold mb-4" }, t.claim_title),
              React.createElement("div", { className: "grid md:grid-cols-2 gap-4 items-start" },
                React.createElement("div", null,
                  React.createElement("label", { className: "block text-sm text-white/70 mb-2" }, t.choose_sample),
                  React.createElement("select", {
                    className: "w-full bg-white/5 border border-white/10 rounded-xl p-3",
                    value: sample, onChange: (e)=>setSample(e.target.value)
                  },
                    React.createElement("option", { value: "none" }, t.sample_none),
                    React.createElement("option", { value: "okx_liq" }, t.sample_okx_liq),
                    React.createElement("option", { value: "binance_liq" }, t.sample_binance_liq)
                  ),
                  React.createElement("label", { className: "block text-sm text-white/70 mt-4 mb-1" }, t.json_input_label),
                  React.createElement("div", { className: "text-xs text-white/50" }, t.or_paste),
                  React.createElement("textarea", {
                    className: "mt-2 w-full h-28 bg-white/5 border border-white/10 rounded-xl p-3",
                    placeholder: "", value: jsonText, onChange: e=>setJsonText(e.target.value)
                  })
                ),
                React.createElement("div", { className: "md:col-span-1" },
                  React.createElement("label", { className: "block text-sm text-white/70 mb-2" }, t.order_id_label),
                  React.createElement("div", { className: "p-4 rounded-2xl bg-white/5 border border-white/10" },
                    React.createElement("input", {
                      type: "text",
                      className: "w-full bg-white/5 border border-white/10 rounded-xl p-3",
                      value: orderId, onChange: (e)=>setOrderId(e.target.value),
                      placeholder: t.order_id_placeholder
                    }),
                    React.createElement("button", {
                      onClick: handleValidate,
                      className: "mt-3 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-medium"
                    }, t.btn_validate),
                    React.createElement("div", { className: "text-xs text-white/60 mt-2" },
                      `${sample === "okx_liq" ? "OKX" : sample === "binance_liq" ? "BINANCE" : "—"} · ${t.order_id_label}`
                    )
                  )
                )
              ),
              claimRes && React.createElement("div", { className: "mt-6 grid md:grid-cols-2 gap-4" },
                React.createElement("div", { className: "p-4 rounded-2xl bg-white/5 border border-white/10" },
                  React.createElement("div", { className: "text-sm text-white/60 mb-2" }, t.validation_result),
                  React.createElement("div", {
                      className: classNames(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                        claimRes.res.ok ? "bg-emerald-400/20 text-emerald-300" : "bg-rose-400/20 text-rose-300"
                      )
                    },
                    React.createElement(CheckCircle2, { size: 16 }),
                    claimRes.res.ok ? t.pass : t.fail
                  ),
                  React.createElement("pre", { className: "mt-3 text-xs text-white/70 whitespace-pre-wrap" },
                    JSON.stringify(claimRes.summary, null, 2)
                  )
                ),
                (claimRes.res.ok
                  ? React.createElement("div", { className: "p-4 rounded-2xl bg-white/5 border border-white/10" },
                      React.createElement("div", { className: "text-sm text-white/60 mb-2" }, t.attest_title),
                      React.createElement("div", { className: "flex flex-wrap gap-2" },
                        React.createElement("button", { onClick: handleBuildRoot, className: "px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20" }, t.btn_build_root),
                        React.createElement("button", { onClick: handleAttest, className: "px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600" }, t.btn_attest)
                      ),
                      React.createElement("div", { className: "mt-3 text-xs break-all" },
                        React.createElement("span", { className: "text-white/60 mr-2" }, `${t.root}:`), root || "-"
                      ),
                      React.createElement("div", { className: "mt-2 text-xs break-all" },
                        React.createElement("span", { className: "text-white/60 mr-2" }, `${t.txhash}:`), tx || "-"
                      )
                    )
                  : React.createElement("div", { className: "p-4 rounded-2xl bg-white/5 border border-rose-500/70" },
                      React.createElement("div", { className: "text-base font-semibold text-rose-200 mb-1" }, t.appeal_title),
                      React.createElement("p", { className: "text-xs text-rose-100/80 leading-relaxed mb-3" }, t.appeal_intro),
                      React.createElement("label", { className: "block text-xs text-white/70 mb-2" }, t.appeal_reason_label),
                      React.createElement("textarea", {
                        className: "w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm",
                        value: appealNote, onChange: (e)=>setAppealNote(e.target.value),
                        placeholder: t.appeal_reason_placeholder
                      }),
                      React.createElement("label", { className: "block text-xs text-white/70 mt-3 mb-2" }, t.appeal_contact_label),
                      React.createElement("input", {
                        className: "w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm",
                        value: appealContact, onChange: (e)=>setAppealContact(e.target.value),
                        placeholder: t.appeal_contact_placeholder
                      }),
                      appealStatus === "missing" && React.createElement("div", { className: "text-xs text-rose-300 mt-2" }, t.appeal_require_reason),
                      appealStatus === "submitted" && React.createElement("div", { className: "text-xs text-emerald-300 mt-3" }, t.appeal_submitted),
                      appealStatus === "submitted" && appealTicket && React.createElement("div", { className: "mt-1 text-xs text-emerald-300 break-all" },
                        `${t.appeal_reference}: ${appealTicket}`
                      ),
                      React.createElement("button", {
                        onClick: handleSubmitAppeal,
                        disabled: appealStatus === "submitting",
                        className: classNames(
                          "mt-3 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 font-medium",
                          appealStatus === "submitting" && "opacity-60 cursor-not-allowed"
                        )
                      }, t.btn_submit_appeal)
                    )
                )
              ),
              React.createElement("div", { className: "mt-6 grid md:grid-cols-3 gap-4" },
                t.claim_highlights.map((item, idx) => (
                  React.createElement("div", { key: idx, className: "rounded-3xl border border-rose-500/70 bg-rose-500/10 px-6 py-5 shadow-inner shadow-rose-500/10" },
                    React.createElement("div", { className: "text-base font-semibold text-rose-200 mb-2" }, item.title),
                    React.createElement("div", { className: "text-xs leading-relaxed text-rose-100/80" }, item.desc)
                  )
                ))
              )
            ),
            active === "attest" && React.createElement("div", { className: "p-6 rounded-3xl bg-white/5 border border-white/10" },
              React.createElement("div", { className: "text-lg font-semibold mb-4" }, t.attest_title),
              React.createElement("div", { className: "text-sm text-white/70 mb-3" }, `${t.root}: `, React.createElement("span", { className: "text-white break-all" }, root || "-")),
              React.createElement("div", { className: "text-sm text-white/70 mb-6" }, `${t.txhash}: `, React.createElement("span", { className: "text-white break-all" }, tx || "-")),
              React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { className: "px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20", onClick: handleBuildRoot }, t.btn_build_root),
                React.createElement("button", { className: "px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600", onClick: handleAttest }, t.btn_attest)
              )
            ),
            active === "status" && React.createElement("div", null,
              React.createElement("div", { className: "text-lg font-semibold mb-4" }, t.status_title),
              React.createElement("div", { className: "grid gap-3" },
                status.length === 0 && React.createElement("div", { className: "text-white/60 text-sm" }, "—"),
                status.map((it, idx) =>
                  React.createElement("div", { key: idx, className: "p-4 rounded-2xl bg-white/5 border border-white/10" },
                    React.createElement("div", { className: "text-xs text-white/60" }, it.when),
                    React.createElement("div", { className: "text-sm mt-1" },
                      React.createElement("span", { className: "text-white/60 mr-2" }, "Root:"),
                      React.createElement("span", { className: "break-all" }, it.root)
                    ),
                    React.createElement("div", { className: "text-sm" },
                      React.createElement("span", { className: "text-white/60 mr-2" }, "Tx:"),
                      React.createElement("span", { className: "break-all" }, it.tx)
                    ),
                    React.createElement("div", { className: "text-sm text-white/70" },
                      React.createElement("span", { className: "text-white/60 mr-2" }, "Order:"), it.order
                    )
                  )
                )
              )
            )
          ),
          React.createElement("div", { className: "mt-8 text-xs text-white/50 text-center" }, t.disclaimer)
        );
      }

      /* -------------------- Part B: UX + Attestor (from liqpass-prototype.html, slightly compact) -------------------- */
      const BASE_CHAIN_ID = 8453;
      const BASE_RPC = "https://mainnet.base.org";
      const ATTESTOR_ADDR = "0x9552b58d323993f84d01e3744f175f47a9462f94";
      const ATTESTOR_ABI = [
        "function attest(bytes32 root, string uri)",
        "function has(bytes32) view returns (bool)"
      ];

      const WalletContext = React.createContext({
        address: "",
        chainId: null,
        provider: null,
        signer: null,
        isConnecting: false,
        message: "",
        isMetaMask: false,
        connect: async () => null,
        disconnect: () => {},
        switchToBase: async () => {},
        clearMessage: () => {},
        isBaseNetwork: false,
      });

      function useWallet() {
        return React.useContext(WalletContext);
      }

      function WalletProvider({ children }) {
        const [address, setAddress] = useState("");
        const [chainId, setChainId] = useState(null);
        const [provider, setProvider] = useState(null);
        const [signer, setSigner] = useState(null);
        const [message, setMessage] = useState("");
        const [isConnecting, setIsConnecting] = useState(false);
        const [isMetaMask, setIsMetaMask] = useState(false);

        const reset = useCallback(() => {
          setAddress("");
          setChainId(null);
          setProvider(null);
          setSigner(null);
        }, []);

        useEffect(() => {
          if (!window.ethereum) return;
          (async () => {
            try {
              const accounts = await window.ethereum.request({ method: "eth_accounts" });
              if (!accounts || accounts.length === 0) return;
              const browserProvider = new ethers.BrowserProvider(window.ethereum, "any");
              const signer = await browserProvider.getSigner();
              const addr = await signer.getAddress();
              const network = await browserProvider.getNetwork();
              setProvider(browserProvider);
              setSigner(signer);
              setAddress(addr);
              setChainId(Number(network.chainId));
              setIsMetaMask(Boolean(window.ethereum.isMetaMask));
            } catch (err) {
              console.error(err);
            }
          })();
        }, []);

        const connect = useCallback(async ({ autoSwitch = true } = {}) => {
          if (isConnecting) return null;
          if (!window.ethereum) {
            setMessage("未检测到以太坊钱包扩展");
            return null;
          }
          setIsConnecting(true);
          setIsMetaMask(Boolean(window.ethereum.isMetaMask));
          try {
            const browserProvider = new ethers.BrowserProvider(window.ethereum, "any");
            await window.ethereum.request({ method: "eth_requestAccounts" });
            let network = await browserProvider.getNetwork();
            if (autoSwitch && Number(network.chainId) !== BASE_CHAIN_ID) {
              try {
                await window.ethereum.request({
                  method: "wallet_switchEthereumChain",
                  params: [{ chainId: ethers.toQuantity(BASE_CHAIN_ID) }]
                });
              } catch (switchErr) {
                if (switchErr?.code === 4902 || /addEthereumChain/i.test(switchErr?.message ?? "")) {
                  await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                      chainId: ethers.toQuantity(BASE_CHAIN_ID),
                      chainName: "Base Mainnet",
                      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                      rpcUrls: [BASE_RPC],
                      blockExplorerUrls: ["https://basescan.org"]
                    }]
                  });
                } else {
                  throw switchErr;
                }
              }
              network = await browserProvider.getNetwork();
            }
            const signer = await browserProvider.getSigner();
            const nextAddress = await signer.getAddress();
            setProvider(browserProvider);
            setSigner(signer);
            setAddress(nextAddress);
            setChainId(Number(network.chainId));
            setMessage("");
            return { provider: browserProvider, signer, address: nextAddress, chainId: Number(network.chainId) };
          } catch (err) {
            console.error(err);
            setMessage(err?.message ?? String(err));
            reset();
            return null;
          } finally {
            setIsConnecting(false);
          }
        }, [isConnecting, reset]);

        const disconnect = useCallback(() => {
          reset();
          setMessage("");
        }, [reset]);

        const switchToBase = useCallback(async () => {
          if (!window.ethereum) {
            setMessage("未检测到以太坊钱包扩展");
            return;
          }
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: ethers.toQuantity(BASE_CHAIN_ID) }]
            });
            const browserProvider = new ethers.BrowserProvider(window.ethereum, "any");
            const network = await browserProvider.getNetwork();
            const signer = await browserProvider.getSigner();
            const addr = await signer.getAddress();
            setProvider(browserProvider);
            setSigner(signer);
            setAddress(addr);
            setChainId(Number(network.chainId));
            setMessage("");
          } catch (err) {
            if (err?.code === 4902 || /addEthereumChain/i.test(err?.message ?? "")) {
              try {
                await window.ethereum.request({
                  method: "wallet_addEthereumChain",
                  params: [{
                    chainId: ethers.toQuantity(BASE_CHAIN_ID),
                    chainName: "Base Mainnet",
                    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                    rpcUrls: [BASE_RPC],
                    blockExplorerUrls: ["https://basescan.org"]
                  }]
                });
                const browserProvider = new ethers.BrowserProvider(window.ethereum, "any");
                const network = await browserProvider.getNetwork();
                const signer = await browserProvider.getSigner();
                const addr = await signer.getAddress();
                setProvider(browserProvider);
                setSigner(signer);
                setAddress(addr);
                setChainId(Number(network.chainId));
                setMessage("");
              } catch (addErr) {
                setMessage(addErr?.message ?? String(addErr));
              }
            } else {
              setMessage(err?.message ?? String(err));
            }
          }
        }, []);

        useEffect(() => {
          if (!window.ethereum) return;
          const handleAccountsChanged = async (accounts) => {
            if (!accounts || accounts.length === 0) {
              disconnect();
              return;
            }
            setAddress(accounts[0]);
            if (provider) {
              try {
                const signer = await provider.getSigner();
                setSigner(signer);
              } catch (err) {
                console.error(err);
              }
            }
          };
          const handleChainChanged = (chainIdHex) => {
            const nextChainId = Number.parseInt(chainIdHex, 16);
            setChainId(nextChainId);
            if (nextChainId !== BASE_CHAIN_ID) {
              setMessage("钱包未切换到 Base 主网");
            } else {
              setMessage("");
            }
          };
          const handleDisconnect = () => {
            disconnect();
          };
          window.ethereum.on("accountsChanged", handleAccountsChanged);
          window.ethereum.on("chainChanged", handleChainChanged);
          window.ethereum.on("disconnect", handleDisconnect);
          return () => {
            window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
            window.ethereum.removeListener("chainChanged", handleChainChanged);
            window.ethereum.removeListener("disconnect", handleDisconnect);
          };
        }, [disconnect, provider]);

        const clearMessage = useCallback(() => setMessage(""), []);

        const value = useMemo(() => ({
          address,
          chainId,
          provider,
          signer,
          isConnecting,
          message,
          isMetaMask,
          connect,
          disconnect,
          switchToBase,
          clearMessage,
          isBaseNetwork: Number(chainId) === BASE_CHAIN_ID
        }), [address, chainId, provider, signer, isConnecting, message, isMetaMask, connect, disconnect, switchToBase, clearMessage]);

        return React.createElement(WalletContext.Provider, { value }, children);
      }

      function makeLocalizedMessage(zh, en, vars = {}) {
        return { zh: formatMessage(zh ?? "", vars), en: formatMessage(en ?? zh ?? "", vars) };
      }
      function getLocalized(message, locale) {
        if (message == null) return "";
        if (typeof message === "string") return message;
        if (typeof message === "object") {
          const lk = locale === "en-US" ? "en" : "zh";
          if (message[lk]) return message[lk];
          if (message.zh) return message.zh;
          if (message.en) return message.en;
          const first = Object.values(message)[0];
          if (typeof first === "string") return first;
        }
        return String(message);
      }
      function useTr() {
        const { locale } = useLocale();
        return useCallback((msg) => getLocalized(msg, locale), [locale]);
      }

      const UX_PRODUCTS = [
        {
          id: "OKX-DAY-100",
          name: makeLocalizedMessage("当日爆仓保 · 定额赔付 100 USDT", "Same-day liquidation cover · Flat payout 100 USDT"),
          premium: makeLocalizedMessage("10 USDC", "10 USDC"),
          leverageCap: makeLocalizedMessage("≤ 20x", "≤ 20x"),
          payoutCap: makeLocalizedMessage("100 USDT", "100 USDT"),
          waitPeriod: makeLocalizedMessage("30 分钟等待期", "30-minute waiting period"),
          coverageWindow: makeLocalizedMessage("订单当日（UTC）内的强平/ADL 触发", "Liquidation/ADL within order day (UTC)"),
          caution: makeLocalizedMessage("限每个钱包每日 1 单；仅支持 USDT 线性合约。", "Max 1 policy per wallet per day; USDT linear only."),
          faq: [{ q: makeLocalizedMessage("是否必须先绑定交易所？", "Do I need to link the exchange first?"),
                  a: makeLocalizedMessage("购买时可跳过；申赔前需绑定（托管密钥/本地验证器二选一）。", "May skip at purchase; bind before claims (custodial key or local validator).")}],
          pricingFormula: makeLocalizedMessage("premium = max(基础费率, notional × maintenanceMarginRate × 18%)",
                                               "premium = max(base rate, notional × maintenanceMarginRate × 18%)"),
          sampleRates: [
            { leverage: makeLocalizedMessage("≤10x","≤10x"), notional: makeLocalizedMessage("≤ 5,000 USDT","≤ 5,000 USDT"), premium: makeLocalizedMessage("6 USDC","6 USDC"), payout: makeLocalizedMessage("60 USDT","60 USDT") },
            { leverage: makeLocalizedMessage("10x–20x","10x–20x"), notional: makeLocalizedMessage("≤ 10,000 USDT","≤ 10,000 USDT"), premium: makeLocalizedMessage("10 USDC","10 USDC"), payout: makeLocalizedMessage("100 USDT","100 USDT") },
            { leverage: makeLocalizedMessage(">20x",">20x"), notional: makeLocalizedMessage("≤ 15,000 USDT","≤ 15,000 USDT"), premium: makeLocalizedMessage("14 USDC","14 USDC"), payout: makeLocalizedMessage("100 USDT (封顶)","100 USDT (cap)") }
          ],
          claimRules: [
            makeLocalizedMessage("窗口内发生强平或 ADL。", "Liquidation/ADL within the window."),
            makeLocalizedMessage("同一订单仅可赔付一次；重复自动拒绝。", "One payout per order; duplicates rejected."),
            makeLocalizedMessage("等待期后生效，同时校验 policy_ref 与 uid_hash。", "Activates after wait period; validates both policy_ref and uid_hash.")
          ],
          blacklist: [
            makeLocalizedMessage("自成交/刷量/操纵行为。","Self-trading/wash/manipulation."),
            makeLocalizedMessage("同一 KYC 关联地址累计超限。","Linked KYC addresses exceeding limits."),
            makeLocalizedMessage("被 OKX 标记为高风险或合约禁用。","Accounts flagged high-risk or futures-disabled.")
          ]
        }
      ];

      function LiqPassUX({ exchange = "OKX" }) {
        const { locale } = useLocale();
        const tr = useTr();
        const [selectedProductId, setSelectedProductId] = useState(UX_PRODUCTS[0]?.id ?? "");
        const selectedProduct = UX_PRODUCTS.find(p => p.id === selectedProductId) ?? UX_PRODUCTS[0];
        function L(msg){ return getLocalized(msg, locale); }

        const wallet = useWallet();
        const [walletNotice, setWalletNotice] = useState("");
        const [siweStatus, setSiweStatus] = useState(L({zh:"未登录", en:"Not signed in"}));
        const [sessionToken, setSessionToken] = useState("");

        async function handleConnectWallet() {
          try {
            const result = await wallet.connect({ autoSwitch: true });
            const chainId = result?.chainId ?? wallet.chainId;
            const addr = result?.address ?? wallet.address;
            if (addr) {
              if (chainId === BASE_CHAIN_ID) {
                setWalletNotice(L({zh:"已连接 Base 钱包", en:"Connected to Base wallet."}));
              } else {
                setWalletNotice(L({zh:`当前链 ID：${chainId}，请切换到 Base 主网。`, en:`Connected to chain ${chainId}. Please switch to Base.`}));
              }
            }
          } catch (err) {
            const reason = err?.message ?? String(err);
            setWalletNotice(L({zh:`连接失败：${reason}`, en:`Connection failed: ${reason}`}));
          }
        }

        async function handleSiweLogin() {
          let activeAddress = wallet.address;
          let activeSigner = wallet.signer;
          if (!activeSigner) {
            const result = await wallet.connect({ autoSwitch: true });
            activeAddress = result?.address ?? wallet.address;
            activeSigner = result?.signer ?? wallet.signer;
          }
          if (!activeSigner || !activeAddress) {
            setWalletNotice(L({zh:"请先连接钱包", en:"Connect wallet first."}));
            return;
          }
          const nonce = Math.random().toString(36).slice(2);
          setSiweStatus(L({zh:"签名中...", en:"Awaiting signature..."}));
          try {
            await activeSigner.signMessage(`LiqPass 登录，nonce=${nonce}`);
            const tokenSuffix = activeAddress.slice(2, 8);
            const mockToken = `demo.${tokenSuffix}.${nonce}`;
            setSessionToken(mockToken);
            setSiweStatus(L({zh:"SIWE 已通过", en:"SIWE completed"}));
            setWalletNotice(L({zh:"后端将验证签名并返回 JWT（此处模拟）。", en:"Backend will verify signature and return JWT (mock)."}));
          } catch (err) {
            const reason = err?.message ?? String(err);
            setSiweStatus(L({zh:"未登录", en:"Not signed in"}));
            setWalletNotice(L({zh:`签名失败：${reason}`, en:`Signature failed: ${reason}`}));
          }
        }

        useEffect(() => {
          if (!wallet.address) {
            setWalletNotice("");
            return;
          }
          if (wallet.isBaseNetwork) {
            setWalletNotice(L({zh:"已连接 Base 钱包", en:"Connected to Base wallet."}));
          } else if (wallet.chainId != null) {
            setWalletNotice(L({zh:`当前链 ID：${wallet.chainId}，请切换到 Base 主网。`, en:`Connected to chain ${wallet.chainId}. Please switch to Base.`}));
          }
        }, [wallet.address, wallet.chainId, wallet.isBaseNetwork, locale]);

        const secondaryWalletNotice = walletNotice && walletNotice !== wallet.message ? walletNotice : "";

        return (
          React.createElement("div", { className: "bg-slate-950 text-slate-100" },
            React.createElement("div", { className: "relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950" },
              React.createElement("div", { className: "max-w-6xl mx-auto px-6 py-12 md:py-16" },
                React.createElement("p", { className: "text-sm uppercase tracking-[0.3em] text-indigo-200/80" }, L({zh:"多交易所合约保险（OKX 首发） · UX 流", en:"Multi-exchange insurance (OKX first) · UX flow"})),
                React.createElement("h1", { className: "mt-4 text-3xl font-semibold md:text-4xl" }, L({zh:`连接钱包 → 浏览产品 → 绑定 ${exchange} → 购买 → 交易监控 → 申赔 / 申诉`, en:`Connect wallet → browse products → link ${exchange} → purchase → monitor trades → claim / appeal`})),
                React.createElement("p", { className: "mt-4 max-w-3xl text-base text-indigo-100/80" }, L({zh:`支持 SIWE / EIP-4361 登录，钱包地址即用户 ID。既可托管密钥（只读）也可启用本地验证器，确保 ${exchange} 凭证不出端。`, en:`Supports SIWE / EIP-4361 with wallet as user ID. Choose custodial read-only keys or local validator to keep ${exchange} credentials on-device.`})),
                React.createElement("div", { className: "mt-6 flex flex-wrap gap-3" },
                  React.createElement("button", {
                    type:"button",
                    onClick: handleConnectWallet,
                    disabled: wallet.isConnecting,
                    className:`rounded-full px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-700/30 transition ${wallet.isConnecting ? "bg-indigo-500/60 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-400"}`
                  }, wallet.address ? L({zh:"1. 重新连接钱包", en:"1. Reconnect wallet"}) : wallet.isConnecting ? L({zh:"连接中...", en:"Connecting..."}) : L({zh:"1. 连接钱包", en:"1. Connect wallet"})),
                  wallet.address && React.createElement("button", {
                    type:"button",
                    onClick: wallet.disconnect,
                    className:"rounded-full border border-indigo-300/60 px-5 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-200 hover:bg-indigo-500/10"
                  }, L({zh:"断开钱包", en:"Disconnect wallet"})),
                  wallet.address && !wallet.isBaseNetwork && React.createElement("button", {
                    type:"button",
                    onClick: wallet.switchToBase,
                    className:"rounded-full border border-amber-400/60 px-5 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-300 hover:bg-amber-500/10"
                  }, L({zh:"切换到 Base", en:"Switch to Base"})),
                  React.createElement("button", { type:"button", onClick: handleSiweLogin, className:"rounded-full border border-indigo-300/60 px-5 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-200 hover:bg-indigo-500/10" }, L({zh:"2. SIWE 登录（模拟）", en:"2. SIWE login (mock)"})),
                  wallet.address && React.createElement("span", { className:"rounded-full border border-white/10 px-4 py-2 text-xs text-indigo-100/80" }, `${wallet.address.slice(0, 10)}...${wallet.address.slice(-6)}`)
                ),
                React.createElement("div", { className: "mt-4 space-y-1 text-sm text-indigo-100/70" },
                  React.createElement("p", null, `${L({zh:"登录状态：",en:"Login status: "})}${siweStatus}${sessionToken ? L({zh:` · JWT(模拟) = ${sessionToken}`, en:` · JWT (mock) = ${sessionToken}`}) : ""}`),
                  wallet.message && React.createElement("p", null, wallet.message),
                  secondaryWalletNotice && React.createElement("p", null, secondaryWalletNotice)
                )
              )
            ),
            React.createElement("div", { className: "max-w-6xl mx-auto px-6 pb-16 space-y-12" },
              React.createElement("section", { className:"space-y-4 pt-12" },
                React.createElement("h2", { className:"text-2xl font-semibold" }, L({zh:"用户路径（UX Flow）", en:"User journey (UX flow)"})),
                React.createElement("div", { className:"grid gap-4 md:grid-cols-3" },
                  [
                    { t: {zh:"连接钱包",en:"Connect wallet"}, d: {zh:"前端请求钱包；用户签署 SIWE，后端返回 JWT。", en:"Front-end requests wallet; user signs SIWE and backend returns JWT."} },
                    { t: {zh:"浏览产品",en:"Browse products"}, d: {zh:"无需登录即可查看保费、杠杆/赔付上限、等待期、FAQ。", en:"View premium, leverage/payout caps, waiting period, FAQs without login."} },
                    { t: {zh:`绑定 ${exchange}`,en:`Link ${exchange}`}, d: {zh:"托管密钥（只读）或本地验证器（密钥不出端）。", en:"Custodial read-only keys or local validator (keys stay on device)."} },
                  ].map((step, idx) =>
                    React.createElement("div", { key: idx, className:"rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur" },
                      React.createElement("p", { className:"text-xs uppercase tracking-[0.3em] text-indigo-200/70" }, `Step ${idx+1}`),
                      React.createElement("h3", { className:"mt-3 text-lg font-semibold text-white" }, L(step.t)),
                      React.createElement("p", { className:"mt-2 text-sm text-slate-200/80" }, L(step.d))
                    )
                  )
                )
              ),
              React.createElement("section", { className:"space-y-4" },
                React.createElement("h2", { className:"text-2xl font-semibold" }, L({zh:"合约保险产品列表", en:"Insurance product catalog"})),
                React.createElement("div", { className:"grid gap-4 md:grid-cols-3" },
                  UX_PRODUCTS.map((product) => {
                    const isActive = product.id === selectedProductId;
                    return React.createElement("button", {
                      type: "button", key: product.id, onClick: () => setSelectedProductId(product.id),
                      className: `rounded-2xl border p-5 text-left transition ${isActive ? "border-indigo-400 bg-indigo-400/10 shadow-lg shadow-indigo-500/20" : "border-white/10 bg-white/5 hover:border-indigo-400/60"}`
                    },
                      React.createElement("div", { className:"flex items-center justify-between text-xs uppercase tracking-widest" },
                        React.createElement("span", { className:"text-indigo-200/80" }, product.id),
                        isActive && React.createElement("span", { className:"rounded-full bg-indigo-500/30 px-2 py-0.5 text-indigo-100" }, L({zh:"当前",en:"Selected"}))
                      ),
                      React.createElement("h3", { className:"mt-3 text-lg font-semibold text-white" }, L(product.name)),
                      React.createElement("ul", { className:"mt-4 space-y-1 text-sm text-slate-200/80" },
                        React.createElement("li", null, `${L({zh:"保费：",en:"Premium: "})}${L(product.premium)}`),
                        React.createElement("li", null, `${L({zh:"杠杆上限：",en:"Leverage cap: "})}${L(product.leverageCap)}`),
                        React.createElement("li", null, `${L({zh:"赔付额上限：",en:"Payout cap: "})}${L(product.payoutCap)}`),
                        React.createElement("li", null, `${L({zh:"等待期：",en:"Waiting period: "})}${L(product.waitPeriod)}`)
                      )
                    );
                  })
                )
              )
            )
          )
        );
      }

      /* ------ Utility from prototype for Attestor ------ */
      function parseCSV(text) {
        const lines = text.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n").split("\\n");
        if (!lines.length) return { headers: [], rows: [] };
        const headers = splitCSVLine(lines[0]);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = splitCSVLine(line);
          const row = {};
          headers.forEach((h, idx) => (row[h.trim()] = (cols[idx] ?? "").trim()));
          rows.push(row);
        }
        return { headers, rows };
      }
      function splitCSVLine(line) {
        const out = []; let cur = ""; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else { inQuotes = !inQuotes; }
          } else if (ch === "," && !inQuotes) { out.push(cur); cur = ""; }
          else { cur += ch; }
        }
        out.push(cur); return out;
      }
      function canonicalizeRow(row, exchange = "OKX") {
        const pick = (keys) => { for (const k of keys) if (k in row && String(row[k]).length) return String(row[k]).trim(); return ""; };
        const id = pick(["id","ID","orderId","订单ID","关联订单id"]);
        const inst = pick(["交易品种","instId","Instrument","Symbol"]);
        const side = pick(["交易类型","side","方向","Side"]);
        const qty = pick(["数量","size","Qty","FilledQty","accFillSz"]);
        const unit = pick(["交易单位","QtyUnit","Unit"]);
        const px = pick(["成交价","fillPx","price","Price"]);
        const pnl = pick(["收益","pnl","RealizedPnL","盈亏"]);
        const ts = pick(["时间","ts","Time","timestamp"]);
        return { exchange, id, inst, side, qty, unit, px, pnl, ts };
      }
      function stableJSONString(obj) {
        const keys = ["exchange","id","inst","side","qty","unit","px","pnl","ts"];
        const ordered = {}; for (const k of keys) ordered[k] = obj[k] ?? ""; return JSON.stringify(ordered);
      }
      function keccakJson(obj) { const s = stableJSONString(obj); const bytes = ethers.toUtf8Bytes(s); return ethers.keccak256(bytes); }
      function buildMerkle(leavesHex) {
        if (leavesHex.length === 0) return { root: ethers.ZeroHash, levels: [] };
        let level = leavesHex.map(h=>h.toLowerCase()); level.sort();
        const levels = [level];
        while (level.length > 1) {
          const next = [];
          for (let i = 0; i < level.length; i += 2) {
            if (i + 1 === level.length) { next.push(level[i]); }
            else {
              const a = level[i], b = level[i+1];
              const [left, right] = a <= b ? [a, b] : [b, a];
              const concat = ethers.concat([ethers.getBytes(left), ethers.getBytes(right)]);
              next.push(ethers.keccak256(concat));
            }
          }
          level = next.sort(); levels.push(level);
        }
        return { root: level[0], levels };
      }
      async function sha256HexOfFile(file) {
        const buf = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
        return hex;
      }
      function downloadAs(name, data) { const blob = new Blob([data], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

      function AttestorWorkbench({ exchange = "OKX" }) {
        const [csvText, setCsvText] = useState(""); const [csvFile, setCsvFile] = useState(null);
        const [rows, setRows] = useState([]); const [headers, setHeaders] = useState([]);
        const [orderId, setOrderId] = useState(""); const [merkleRoot, setMerkleRoot] = useState("");
        const [attestUrl, setAttestUrl] = useState(""); const [status, setStatus] = useState("");
        const [txHash, setTxHash] = useState(""); const [hasOnchain, setHasOnchain] = useState(null);
        const wallet = useWallet();
        const parsed = useMemo(() => { if (!csvText) return { headers: [], rows: [] }; try { return parseCSV(csvText); } catch (e) { console.error(e); return { headers: [], rows: [] } } }, [csvText]);
        useEffect(() => { setHeaders(parsed.headers); setRows(parsed.rows); }, [parsed.headers, parsed.rows]);

        async function handleFile(f){ setCsvFile(f); const text = await f.text(); setCsvText(text); }
        function buildRoot(){ if (!rows.length){ setStatus("请先上传 CSV"); return; } const leaves = rows.map(r => keccakJson(canonicalizeRow(r, exchange))); const { root } = buildMerkle(leaves); setMerkleRoot(root); setStatus("Merkle root 已生成"); }
        async function genAttestJson(){
          if (!merkleRoot){ setStatus("请先生成 Merkle root"); return; }
          const sha = csvFile ? await sha256HexOfFile(csvFile) : "";
          const payload = { merkleRoot, chainId: BASE_CHAIN_ID, contract: ATTESTOR_ADDR, dataset: { uri:"<请上传CSV到你的网站后粘贴URL>", sha256Hex: sha, rows: rows.length }, generator:{ name:"liqpass-web-attestor", version:"0.1.0" }, market:{ exchange, symbols: [], timeWindow:{ startISO:"", endISO:"", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }, counts:{ positions: rows.length }, method:{ treeAlgo:"keccak256", leafFormat:"keccak256(utf8(JSON.stringify({exchange,id,inst,side,qty,unit,px,pnl,ts})))", proofFormat:"array<bytes32>" }, createdAt: new Date().toISOString() };
          downloadAs(`attest_${Date.now()}.json`, JSON.stringify(payload, null, 2)); setStatus("attest.json 已生成并下载。请将其上传到你的网站 /files/ ，然后把URL粘贴到下方。");
        }
        async function connectAndAttest(){
          try {
            setStatus("准备连接钱包...");
            let activeSigner = wallet.signer;
            if (!activeSigner) {
              const result = await wallet.connect({ autoSwitch: true });
              activeSigner = result?.signer ?? null;
            }
            if (!activeSigner) { setStatus("未检测到钱包或连接被拒绝。"); return; }
            let network = await activeSigner.provider.getNetwork();
            if (Number(network.chainId) !== BASE_CHAIN_ID) {
              await wallet.switchToBase();
              const refreshed = await wallet.connect({ autoSwitch: false });
              activeSigner = refreshed?.signer ?? wallet.signer ?? activeSigner;
              network = await activeSigner.provider.getNetwork();
              if (Number(network.chainId) !== BASE_CHAIN_ID) {
                setStatus("请切换到 Base 主网后再试。");
                return;
              }
            }
            const c = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, activeSigner);
            if (!merkleRoot){ setStatus("缺少 merkleRoot，请先生成"); return; }
            if (!attestUrl || !attestUrl.startsWith("http")){ setStatus("请粘贴 attest.json 的公网 URL"); return; }
            setStatus("发送交易中...");
            const tx = await c.attest(merkleRoot, attestUrl);
            await tx.wait();
            setTxHash(tx.hash); setStatus("已上链。下面可点击 Basescan 查看。");
            const ok = await c.has(merkleRoot); setHasOnchain(ok);
          } catch (e) { console.error(e); setStatus(`失败：${e?.message ?? e}`); }
        }
        async function checkHas(){
          try { const provider = new ethers.JsonRpcProvider(BASE_RPC); const c = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, provider); const ok = await c.has(merkleRoot); setHasOnchain(ok); setStatus("已查询链上 has(root)"); }
          catch (e) { setStatus(`查询失败：${e?.message ?? e}`); }
        }

        return (
          React.createElement("div", { className: "min-h-screen bg-slate-50 text-slate-900" },
            React.createElement("div", { className: "max-w-4xl mx-auto p-6" },
              React.createElement("h1", { className: "text-3xl font-bold mb-2" }, "LiqPass — 本地验证 & 一键上链留痕"),
              React.createElement("p", { className: "text-sm opacity-70" }, `不连 ${exchange} API；不上传隐私；所有计算在浏览器完成。合约：${ATTESTOR_ADDR}`),
              React.createElement("p", { className: "text-xs uppercase tracking-[0.3em] opacity-60 mb-6" }, `当前选择交易所：${exchange}`),
              React.createElement("div", { className: "bg-white rounded-2xl shadow p-5 mb-6" },
                React.createElement("h2", { className: "text-xl font-semibold mb-2" }, `步骤 1 / 上传 ${exchange} 导出的 CSV`),
                React.createElement("div", { className: "flex items-center gap-3 mb-3" },
                  React.createElement("input", { type: "file", accept: ".csv,text/csv", onChange: (e)=> e.target.files?.[0] && handleFile(e.target.files[0]) }),
                  React.createElement("button", { className: "px-3 py-2 rounded-xl bg-slate-800 text-white", onClick: () => { if (!csvText) return; const { headers, rows } = parseCSV(csvText); setHeaders(headers); setRows(rows); } }, "解析")
                ),
                React.createElement("textarea", { className: "w-full h-28 p-3 rounded-xl border", placeholder: "或直接粘贴 CSV 文本...", value: csvText, onChange: e=>setCsvText(e.target.value) }),
                React.createElement("div", { className: "text-xs mt-2 opacity-70" }, "提示：OKX 可在「资产 → 订单中心」导出 CSV。")
              ),
              React.createElement("div", { className: "bg-white rounded-2xl shadow p-5 mb-6" },
                React.createElement("h2", { className: "text-xl font-semibold mb-2" }, "步骤 2 / 生成 Merkle Root"),
                React.createElement("div", { className: "flex items-center gap-3 mb-3" },
                  React.createElement("input", { className: "flex-1 border rounded-xl p-2", placeholder: "输入订单号（可选，用于样例展示/校验）", value: orderId, onChange: e=>setOrderId(e.target.value) }),
                  React.createElement("button", { className: "px-3 py-2 rounded-xl bg-slate-800 text-white", onClick: buildRoot }, "生成 Root")
                ),
                merkleRoot && React.createElement("div", { className: "text-sm break-all" }, "merkleRoot：", React.createElement("code", { className: "bg-slate-100 px-2 py-1 rounded" }, merkleRoot))
              ),
              React.createElement("div", { className: "bg-white rounded-2xl shadow p-5 mb-6" },
                React.createElement("h2", { className: "text-xl font-semibold mb-2" }, "步骤 3 / 生成 attest.json 并下载"),
                React.createElement("div", { className: "flex items-center gap-3 mb-3" },
                  React.createElement("button", { className: "px-3 py-2 rounded-xl bg-slate-800 text-white", onClick: genAttestJson }, "生成 & 下载")
                ),
                React.createElement("div", { className: "text-xs opacity-70" }, "将下载的 attest.json 与原始 CSV 一并上传到你的网站（例如 ", React.createElement("code", null, "/files/"), " 目录），复制它的公网 URL。")
              ),
              React.createElement("div", { className: "bg-white rounded-2xl shadow p-5 mb-6" },
                React.createElement("h2", { className: "text-xl font-semibold mb-2" }, "步骤 4 / 上链留痕（Base 主网）"),
                React.createElement("input", { className: "w-full border rounded-xl p-2 mb-3", placeholder: "粘贴 attest.json 的公网 URL (https://...)", value: attestUrl, onChange: e=>setAttestUrl(e.target.value) }),
                React.createElement("div", { className: "flex items-center gap-3" },
                  React.createElement("button", { className: "px-3 py-2 rounded-xl bg-emerald-600 text-white", onClick: connectAndAttest }, "连接钱包并上链"),
                  React.createElement("button", { className: "px-3 py-2 rounded-xl bg-slate-200", onClick: checkHas }, "检查 has(root)")
                ),
                txHash && React.createElement("div", { className: "text-sm mt-3" }, "Tx: ", React.createElement("a", { className: "text-blue-600 underline", target: "_blank", href: `https://basescan.org/tx/${txHash}` }, txHash)),
                hasOnchain !== null && React.createElement("div", { className: "text-sm mt-1" }, "合约 has(root)：", String(hasOnchain))
              ),
              React.createElement("div", { className: "mt-4 text-sm opacity-80" }, status),
              rows.length > 0 && React.createElement("div", { className: "bg-white rounded-2xl shadow p-5 mt-6" },
                React.createElement("h3", { className: "font-semibold mb-2" }, "CSV 预览（前 10 行）"),
                React.createElement("div", { className: "overflow-auto" },
                  React.createElement("table", { className: "min-w-full text-sm" },
                    React.createElement("thead", null,
                      React.createElement("tr", null, headers.map((h,i)=> React.createElement("th", { key: i, className:"px-2 py-1 border-b text-left whitespace-nowrap" }, h)))
                    ),
                    React.createElement("tbody", null,
                      rows.slice(0,10).map((r,idx)=> (
                        React.createElement("tr", { key: idx, className: "odd:bg-slate-50" },
                          headers.map((h,i)=> React.createElement("td", { key: i, className:"px-2 py-1 border-b whitespace-nowrap" }, r[h]))
                        )
                      ))
                    )
                  )
                )
              )
            )
          )
        );
      }

      /* -------------------- App Shell: merge the three views -------------------- */
      function AppShell() {
        const [locale, setLocale] = useState(() => detectInitialLocale());
        useEffect(() => { try { window.localStorage?.setItem("liqpass.locale", locale); } catch(_){} }, [locale]);
        const [view, setView] = useState("ux"); // ux | plflow | attestor
        const [exchange, setExchange] = useState("OKX");
        const value = useMemo(() => ({ locale, setLocale, tr: (zh, en, vars)=> formatMessage(locale === "en-US" ? (en ?? zh ?? "") : (zh ?? en ?? ""), vars) }), [locale]);

        return (
          React.createElement(LocaleContext.Provider, { value },
            React.createElement("div", { className: "min-h-screen flex flex-col" },
              React.createElement("header", { className: "border-b border-slate-800 bg-slate-950/90 backdrop-blur" },
                React.createElement("div", { className: "mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between" },
                  React.createElement("div", null,
                    React.createElement("div", { className: "flex items-center gap-2" },
                      React.createElement("span", { className: "text-lg font-semibold text-white" }, "LiqPass"),
                      React.createElement("span", { className: "rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400" }, "Base Mainnet")
                    ),
                    React.createElement("p", { className: "mt-1 text-xs text-slate-400" }, locale === "en-US" ? "Merged demo: UX + P/L flow + local attestation." : "合并演示：保险 UX + P/L 测算 + 本地取证上链。")
                  ),
                  React.createElement("div", { className: "flex items-center gap-2" },
                    React.createElement("button", { type:"button", onClick: ()=>setView("ux"), className:`rounded-full px-4 py-2 text-sm transition ${view==="ux"?"bg-indigo-500 text-white shadow-lg shadow-indigo-700/30":"border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"}` }, locale==="en-US"?"Insurance UX":"保险 UX"),
                    React.createElement("button", { type:"button", onClick: ()=>setView("plflow"), className:`rounded-full px-4 py-2 text-sm transition ${view==="plflow"?"bg-indigo-500 text-white shadow-lg shadow-indigo-700/30":"border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"}` }, locale==="en-US"?"P/L Quote + Claim":"P/L 报价 + 申赔"),
                    React.createElement("button", { type:"button", onClick: ()=>setView("attestor"), className:`rounded-full px-4 py-2 text-sm transition ${view==="attestor"?"bg-indigo-500 text-white shadow-lg shadow-indigo-700/30":"border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"}` }, locale==="en-US"?"Local Attestation":"本地取证 / 上链"),
                    React.createElement("div", { className: "ml-3 flex items-center gap-1 text-xs" },
                      React.createElement("span", { className: "opacity-70" }, locale==="en-US"?"Language:":"语言："),
                      SUPPORTED_LOCALES.map((code) =>
                        React.createElement("button", { key: code, type:"button", onClick: ()=>setLocale(code), className:`rounded-full px-2 py-1 border ${locale===code?"bg-indigo-500 text-white border-indigo-400":"border-white/10 text-slate-200"}` }, LANGUAGE_LABELS[code])
                      )
                    )
                  )
                )
              ),
              React.createElement("main", { className: "flex-1" },
                view === "ux" ? React.createElement(LiqPassUX, { key: "ux", exchange }) :
                view === "plflow" ? React.createElement(PLFlow, { key: "plflow" }) :
                React.createElement(AttestorWorkbench, { key: "attestor", exchange })
              ),
              React.createElement("footer", { className: "py-8 text-center text-xs text-slate-500" },
                locale==="en-US"
                  ? "Note: All flows are front-end prototypes; on-chain calls are mocked unless you connect a wallet on Base."
                  : "说明：以上交互为前端原型；除非连接 Base 钱包，否则链上调用均为演示/模拟。"
              )
            )
          )
        );
      }

      const root = createRoot(document.getElementById("root"));
      root.render(
        React.createElement(WalletProvider, null,
          React.createElement(AppShell)
        )
      );
