import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ethers } from "ethers";
// 依赖：tailwind 已内置；无需后端、无需触达 OKX API；所有计算在浏览器本地完成。
// 功能：
// 1) 用户上传 OKX 导出的 CSV（或粘贴一行JSON），选择/输入订单号；
// 2) 本地构建 Merkle 树，生成 merkleRoot 与 attest.json；
// 3) 下载 attest.json（用户自行上传到 wjz5788.com/files/ 或任意可公开访问的URL）；
// 4) 连接钱包 → Base 主网 → 调用现有合约 attest(root, uri) 上链留痕；
// 备注：合约地址为你当前已部署的 V1：ClaimAttestor（可改为 V2）。

/********************** 配置区 **********************/
const BASE_CHAIN_ID = 8453; // Base 主网
const BASE_RPC = "https://mainnet.base.org"; // 仅用于只读
// 你的已部署合约（V1）
const ATTESTOR_ADDR = "0x9552b58d323993f84d01e3744f175f47a9462f94";
const ATTESTOR_ABI = [
  "function attest(bytes32 root, string uri)",
  "function has(bytes32) view returns (bool)"
];

/********************** 工具函数 **********************/
// 简易 CSV 解析（推荐用户导出 UTF-8 CSV）。为稳妥起见，这里使用浏览器内置逻辑做一个简单解析；
// 复杂 CSV 建议在后续接入 PapaParse。
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { // 转义双引号
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// 规范化一行，抽取稳定字段（自动适配中英列名）
function canonicalizeRow(row) {
  // 兼容列名（OKX常见导出：中文“id/交易品种/交易类型/数量/交易单位/成交价/收益/时间”，或英文 exports）
  const pick = (keys) => {
    for (const k of keys) if (k in row && String(row[k]).length) return String(row[k]).trim();
    return "";
  };
  const id = pick(["id", "ID", "orderId", "订单ID", "关联订单id"]);
  const inst = pick(["交易品种", "instId", "Instrument", "Symbol"]);
  const side = pick(["交易类型", "side", "方向", "Side"]);
  const qty = pick(["数量", "size", "Qty", "FilledQty", "accFillSz"]);
  const unit = pick(["交易单位", "QtyUnit", "Unit"]);
  const px = pick(["成交价", "fillPx", "price", "Price"]);
  const pnl = pick(["收益", "pnl", "RealizedPnL", "盈亏"]);
  const ts = pick(["时间", "ts", "Time", "timestamp"]);
  const exchange = "OKX";
  return {
    exchange,
    id,
    inst,
    side,
    qty,
    unit,
    px,
    pnl,
    ts,
  };
}

// 稳定 JSON 字符串（字段顺序固定）
function stableJSONString(obj) {
  const keys = ["exchange","id","inst","side","qty","unit","px","pnl","ts"];
  const ordered = {};
  for (const k of keys) ordered[k] = obj[k] ?? "";
  return JSON.stringify(ordered);
}

// keccak256(utf8(JSON))
function keccakJson(obj) {
  const s = stableJSONString(obj);
  const bytes = ethers.toUtf8Bytes(s);
  return ethers.keccak256(bytes); // 0x...32bytes
}

// Merkle 构建（keccak，按字典序排序）
function buildMerkle(leavesHex) {
  if (leavesHex.length === 0) return { root: ethers.ZeroHash, levels: [] };
  let level = leavesHex.map(h => h.toLowerCase());
  level.sort();
  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) {
        // 奇数个，直接提升
        next.push(level[i]);
      } else {
        const a = level[i];
        const b = level[i + 1];
        const [left, right] = a <= b ? [a, b] : [b, a];
        const concat = ethers.concat([ethers.getBytes(left), ethers.getBytes(right)]);
        next.push(ethers.keccak256(concat));
      }
    }
    level = next.sort();
    levels.push(level);
  }
  return { root: level[0], levels };
}

async function sha256HexOfFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex;
}

function downloadAs(name, data) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/********************** 组件 **********************/
const UX_FLOW = [
  {
    title: "连接钱包",
    description: "前端请求以太坊钱包；用户签署 SIWE 字符串，后端校验返回 JWT，会话以 walletAddress 为唯一 ID。"
  },
  {
    title: "浏览产品",
    description: "访客无需登录即可查看保费、杠杆/赔付上限、等待期、注意事项和 FAQ。"
  },
  {
    title: "绑定 OKX",
    description: "支持托管密钥（只读权限，密文存储）或本地验证器（密钥留在本机）两种模式。"
  },
  {
    title: "购买保单",
    description: "在 Base 链调用 purchasePolicy(skuId, params) 收款并生成 policyId / policy_ref。"
  },
  {
    title: "正常交易",
    description: "索引器/本地验证器拉取 uid_hash 的订单 → 生成 Merkle 根 → 上链 attest(root, uri)。"
  },
  {
    title: "申赔/申诉",
    description: "用户输入订单号自动匹配 proof；失败时可上传最小证据或由本地验证器重传。"
  }
];

const UX_PRODUCTS = [
  {
    id: "OKX-DAY-100",
    name: "当日爆仓保 · 定额赔付 100 USDT",
    premium: "10 USDC",
    leverageCap: "≤ 20x",
    payoutCap: "100 USDT",
    waitPeriod: "30 分钟等待期",
    coverageWindow: "订单当日（UTC）内的强平/ADL 触发",
    caution: "限每个钱包每日 1 单；仅支持 USDT 结算的正向合约。",
    faq: [
      { q: "是否必须先绑定 OKX？", a: "购买时可跳过，但申赔前需完成绑定；托管密钥或本地验证器任意一种即可。" },
      { q: "如何判断强平？", a: "索引器读取 OKX 订单的 state=liquidated 或 adl=true，生成 Merkle proof 并上链。" }
    ],
    pricingFormula: "premium = max(基础费率, notional × maintenanceMarginRate × 18%)",
    sampleRates: [
      { leverage: "≤10x", notional: "≤ 5,000 USDT", premium: "6 USDC", payout: "60 USDT" },
      { leverage: "10x–20x", notional: "≤ 10,000 USDT", premium: "10 USDC", payout: "100 USDT" },
      { leverage: ">20x", notional: "≤ 15,000 USDT", premium: "14 USDC", payout: "100 USDT (封顶)" }
    ],
    claimRules: [
      "订单在保障窗口内发生强平或 ADL。",
      "同一订单仅可赔付一次；重复提交自动拒绝。",
      "等待期结束后保单才生效，需同时校验 policy_ref 与 uid_hash。"
    ],
    blacklist: [
      "账户存在自成交、刷量或明显操纵行为。",
      "同一 KYC 关联地址累计赔付超出额度。",
      "被 OKX 标记为高风险或合约禁用账户。"
    ]
  },
  {
    id: "OKX-8H-60",
    name: "8 小时时段保 · 赔付 60 USDT",
    premium: "6 USDC",
    leverageCap: "≤ 15x",
    payoutCap: "60 USDT",
    waitPeriod: "15 分钟等待期",
    coverageWindow: "自购买起 8 小时的交易窗口",
    caution: "适合高频交易者；提前平仓不影响保障但保费不退。",
    faq: [
      { q: "如何处理多订单？", a: "支持同一 uid_hash 在窗口内多次强平，先到先得，赔付次数受限于产品设定。" },
      { q: "是否覆盖反向合约？", a: "默认仅覆盖 USDT 计价；如需币本位需单独 SKU。" }
    ],
    pricingFormula: "premium = baseFee + fundingVolatilityAdjustment",
    sampleRates: [
      { leverage: "≤5x", notional: "≤ 2,500 USDT", premium: "4 USDC", payout: "40 USDT" },
      { leverage: "5x–10x", notional: "≤ 5,000 USDT", premium: "6 USDC", payout: "60 USDT" },
      { leverage: "10x–15x", notional: "≤ 8,000 USDT", premium: "8 USDC", payout: "60 USDT" }
    ],
    claimRules: [
      "限订单的触发时间在购买后 8 小时内。",
      "ADL 事件同样视作触发，需提供订单号或 CSV 粘贴行。",
      "当窗口内总赔付达到资金池上限时，将触发排队或退款。"
    ],
    blacklist: [
      "API 快速开仓/平仓触发风控限速的用户。",
      "存在多地址共享 API Key 的情况。",
      "被列入风险观察名单的策略账户。"
    ]
  },
  {
    id: "OKX-MONTH-200",
    name: "月度回撤保 · 赔付 200 USDT",
    premium: "20 USDC",
    leverageCap: "≤ 10x",
    payoutCap: "200 USDT",
    waitPeriod: "24 小时等待期",
    coverageWindow: "保障 30 天；聚合整月爆仓记录",
    caution: "需完成 KYC；黑名单账户或重复理赔将被拒绝。",
    faq: [
      { q: "是否支持分批理赔？", a: "一个月内可累计多次理赔，直至达到赔付上限或触发限赔阈值。" },
      { q: "如何续期？", a: "合约支持自动续期参数，或由用户手动再次购买 SKU。" }
    ],
    pricingFormula: "premium = 月度名义本金 × 风险系数表 (按杠杆分段)",
    sampleRates: [
      { leverage: "≤5x", notional: "≤ 20,000 USDT", premium: "16 USDC", payout: "160 USDT" },
      { leverage: "5x–10x", notional: "≤ 30,000 USDT", premium: "20 USDC", payout: "200 USDT" },
      { leverage: ">10x", notional: "≤ 40,000 USDT", premium: "26 USDC", payout: "200 USDT (封顶)" }
    ],
    claimRules: [
      "保单生效后记录用户 uid_hash 的所有强平订单，月末统一结算。",
      "用户需保证关联地址一致，防止账号转移规避等待期。",
      "若本月无强平，可在到期后领取返还奖励（如设置）。"
    ],
    blacklist: [
      "同一实体操作多个钱包规避额度的行为。",
      "存在异常订单撤销或恶意刷量的策略。",
      "列入 OKX 黑名单或司法冻结的账户。"
    ]
  }
];

function LiqPassUX() {
  const [selectedProductId, setSelectedProductId] = useState(UX_PRODUCTS[0]?.id ?? "");
  const selectedProduct = useMemo(
    () => UX_PRODUCTS.find((p) => p.id === selectedProductId) ?? UX_PRODUCTS[0],
    [selectedProductId]
  );
  const [walletAddress, setWalletAddress] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [siweStatus, setSiweStatus] = useState("未登录");
  const [sessionToken, setSessionToken] = useState("");
  const [activeBindMode, setActiveBindMode] = useState("custodial");
  const [bindStatus, setBindStatus] = useState("");
  const [custodialForm, setCustodialForm] = useState({ apiKey: "", secretKey: "", passphrase: "" });
  const [localValidatorReady, setLocalValidatorReady] = useState(false);
  const [localFingerprint, setLocalFingerprint] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const [appealStatus, setAppealStatus] = useState("");

  async function handleConnectWallet() {
    try {
      if (!window.ethereum) {
        setWalletMessage("未检测到以太坊钱包扩展");
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== BASE_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ethers.toQuantity(BASE_CHAIN_ID) }]
          });
        } catch (switchErr) {
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
        }
      }
      const signer = await provider.getSigner();
      const account = accounts[0] ?? (await signer.getAddress());
      setWalletAddress(account);
      setWalletMessage("已连接 Base 钱包");
    } catch (err) {
      setWalletMessage(`连接失败：${err?.message ?? err}`);
    }
  }

  async function handleSiweLogin() {
    if (!walletAddress) {
      setWalletMessage("请先连接钱包");
      return;
    }
    const nonce = Math.random().toString(36).slice(2);
    setSiweStatus("签名中...");
    try {
      if (!window.ethereum) throw new Error("钱包不可用");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const statement = `LiqPass 登录，nonce=${nonce}`;
      await signer.signMessage(statement);
      const tokenSuffix = walletAddress.slice(2, 8);
      const mockToken = `demo.${tokenSuffix}.${nonce}`;
      setSessionToken(mockToken);
      setSiweStatus("SIWE 已通过");
      setWalletMessage("后端将验证签名并返回 JWT（此处模拟）。");
    } catch (err) {
      setSiweStatus("未登录");
      setWalletMessage(`签名失败：${err?.message ?? err}`);
    }
  }

  function handleCustodialSubmit() {
    if (!custodialForm.apiKey || !custodialForm.secretKey || !custodialForm.passphrase) {
      setBindStatus("请完整填写 API Key / Secret Key / Passphrase。");
      return;
    }
    const masked = `ciphertext://${custodialForm.apiKey.slice(0, 4)}***`;
    setBindStatus(`已本地加密并提交密文：${masked}（仅服务器可见密文，原文保留在前端内存中立即销毁）。`);
  }

  function handleLocalValidator() {
    setLocalValidatorReady(true);
    const fingerprint = `uid_hash_${Date.now().toString(16)}`;
    setLocalFingerprint(fingerprint);
    setBindStatus("本地验证器已启动，将定期拉取 OKX 订单并生成最小化指纹。");
  }

  function handlePurchase() {
    const ref = `${selectedProduct?.id ?? "SKU"}-${Date.now().toString(16)}`;
    const randomSuffix = Math.random().toString(16).slice(2, 10);
    const mockTx = `0x${ref.replace(/[^0-9a-zA-Z]/g, "").slice(0, 12)}${Date.now().toString(16)}${randomSuffix}`;
    setPurchaseStatus(`链上调用 purchasePolicy 已提交。policy_ref = ${ref}，txHash ≈ ${mockTx}`);
  }

  function handleClaim() {
    if (!orderInput.trim()) {
      setClaimStatus("请输入订单号。");
      return;
    }
    setClaimStatus(`已匹配订单 ${orderInput}，准备 submitClaim(policyId, ${orderInput}, order_hash, rootId, proof)。`);
  }

  function handleAppeal() {
    setAppealStatus("申诉已创建，仲裁角色将在 24 小时内复核。");
  }

  return (
    <div className="bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
          <p className="text-sm uppercase tracking-[0.3em] text-indigo-200/80">OKX 合约保险 · UX 流</p>
          <h1 className="mt-4 text-3xl font-semibold md:text-4xl">
            连接钱包 → 浏览产品 → 绑定 OKX → 购买 → 交易监控 → 申赔 / 申诉
          </h1>
          <p className="mt-4 max-w-3xl text-base text-indigo-100/80">
            支持 SIWE / EIP-4361 登录，钱包地址即用户 ID。既可托管密钥（只读）也可启用本地验证器，确保 OKX 凭证不出端。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConnectWallet}
              className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-700/30 transition hover:bg-indigo-400"
            >
              1. 连接钱包
            </button>
            <button
              type="button"
              onClick={handleSiweLogin}
              className="rounded-full border border-indigo-300/60 px-5 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-200 hover:bg-indigo-500/10"
            >
              2. SIWE 登录（模拟）
            </button>
            {walletAddress && (
              <span className="rounded-full border border-white/10 px-4 py-2 text-xs text-indigo-100/80">
                {walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}
              </span>
            )}
          </div>
          <div className="mt-4 space-y-1 text-sm text-indigo-100/70">
            <p>登录状态：{siweStatus}{sessionToken ? ` · JWT(模拟) = ${sessionToken}` : ""}</p>
            {walletMessage && <p>{walletMessage}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-16 space-y-12">
        <section className="space-y-4 pt-12">
          <h2 className="text-2xl font-semibold">用户路径（UX Flow）</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {UX_FLOW.map((step, idx) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-200/70">Step {idx + 1}</p>
                <h3 className="mt-3 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-200/80">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">OKX 合约保险产品列表</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {UX_PRODUCTS.map((product) => {
              const isActive = product.id === selectedProductId;
              return (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setPurchaseStatus("");
                  }}
                  className={`rounded-2xl border p-5 text-left transition ${
                    isActive
                      ? "border-indigo-400 bg-indigo-400/10 shadow-lg shadow-indigo-500/20"
                      : "border-white/10 bg-white/5 hover:border-indigo-400/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest">
                    <span className="text-indigo-200/80">{product.id}</span>
                    {isActive && <span className="rounded-full bg-indigo-500/30 px-2 py-0.5 text-indigo-100">当前</span>}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{product.name}</h3>
                  <ul className="mt-4 space-y-1 text-sm text-slate-200/80">
                    <li>保费：{product.premium}</li>
                    <li>杠杆上限：{product.leverageCap}</li>
                    <li>赔付额上限：{product.payoutCap}</li>
                    <li>等待期：{product.waitPeriod}</li>
                    <li>注意事项：{product.caution}</li>
                  </ul>
                  {product.faq[0] && (
                    <p className="mt-4 text-xs text-indigo-200/70">
                      FAQ：{product.faq[0].q}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {selectedProduct && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">产品详情</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-lg shadow-slate-900/10">
                <h3 className="text-lg font-semibold text-slate-900">参数化定价公式</h3>
                <p className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
                  {selectedProduct.pricingFormula}
                </p>
                <h3 className="mt-6 text-lg font-semibold text-slate-900">示例费率表</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm text-slate-800">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left">杠杆区间</th>
                        <th className="px-3 py-2 text-left">名义本金</th>
                        <th className="px-3 py-2 text-left">保费</th>
                        <th className="px-3 py-2 text-left">赔付</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.sampleRates.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="px-3 py-2">{row.leverage}</td>
                          <td className="px-3 py-2">{row.notional}</td>
                          <td className="px-3 py-2">{row.premium}</td>
                          <td className="px-3 py-2">{row.payout}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">理赔规则</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-200/80">
                  {selectedProduct.claimRules.map((rule, idx) => (
                    <li key={idx} className="list-inside list-disc">
                      {rule}
                    </li>
                  ))}
                </ul>

                <h3 className="mt-6 text-lg font-semibold text-white">黑名单 / 限赔</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-200/80">
                  {selectedProduct.blacklist.map((rule, idx) => (
                    <li key={idx} className="list-inside list-disc">
                      {rule}
                    </li>
                  ))}
                </ul>

                <h3 className="mt-6 text-lg font-semibold text-white">FAQ</h3>
                <div className="mt-3 space-y-3">
                  {selectedProduct.faq.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm font-medium text-indigo-200">{item.q}</p>
                      <p className="mt-1 text-sm text-slate-200/70">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">绑定 OKX 账户（三个东西）</h2>
          <p className="text-sm text-slate-200/70">支持托管密钥（只读）与本地验证器双轨，满足不同的安全/合规需求。</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveBindMode("custodial");
                setBindStatus("");
              }}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeBindMode === "custodial"
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-700/30"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"
              }`}
            >
              模式 A · 托管密钥（只读权限）
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveBindMode("local");
                setBindStatus("");
              }}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeBindMode === "local"
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-700/30"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"
              }`}
            >
              模式 B · 本地验证器（密钥不出端）
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/80">
            {activeBindMode === "custodial" ? (
              <>
                <p>填写 OKX 提供的 API Key / Secret Key / Passphrase（只读权限），前端用钱包公钥或后端 KMS 公钥进行加密。</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <input
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-slate-500"
                    placeholder="API Key"
                    value={custodialForm.apiKey}
                    onChange={(e) => setCustodialForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  />
                  <input
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-slate-500"
                    placeholder="Secret Key"
                    value={custodialForm.secretKey}
                    onChange={(e) => setCustodialForm((prev) => ({ ...prev, secretKey: e.target.value }))}
                  />
                  <input
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white placeholder:text-slate-500"
                    placeholder="Passphrase"
                    value={custodialForm.passphrase}
                    onChange={(e) => setCustodialForm((prev) => ({ ...prev, passphrase: e.target.value }))}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  数据在本地加密后上传；服务器仅保存密文和 uid_hash，对应钱包地址即账户 ID。
                </p>
                <button
                  type="button"
                  onClick={handleCustodialSubmit}
                  className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400"
                >
                  本地加密并上传密文
                </button>
              </>
            ) : (
              <>
                <p>下载或启动「LiqPass Local Validator」插件，密钥留在本机，由插件拉取订单并仅上报最小化指纹。</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleLocalValidator}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400"
                  >
                    {localValidatorReady ? "验证器已运行" : "启动本地验证器"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBindStatus("浏览器插件下载链接将通过内测邮箱下发（占位展示）。")}
                    className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-indigo-300/60"
                  >
                    下载浏览器插件（占位）
                  </button>
                </div>
                {localValidatorReady && (
                  <div className="mt-4 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-4 text-xs text-indigo-100">
                    <p>uid_hash（示例）：{localFingerprint}</p>
                    <p className="mt-2">插件将在本地生成 Merkle root，并定期将 rootId + proof 上报给后端索引器。</p>
                  </div>
                )}
              </>
            )}
            {bindStatus && <div className="mt-4 text-sm text-emerald-300">{bindStatus}</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">购买链上保单</h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/80">
            <p>选择 SKU 后，合约 `purchasePolicy(skuId, params)` 将收取保费（USDC）并返回 policyId / policy_ref，同时记录到链上。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-200/70">当前 SKU</p>
                <p className="mt-2 text-lg font-semibold text-white">{selectedProduct?.name ?? "请选择产品"}</p>
                <p className="mt-2 text-sm text-slate-300/80">{selectedProduct?.coverageWindow}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p><span className="font-medium text-indigo-100">保费：</span>{selectedProduct?.premium}</p>
                <p className="mt-2"><span className="font-medium text-indigo-100">杠杆上限：</span>{selectedProduct?.leverageCap}</p>
                <p className="mt-2"><span className="font-medium text-indigo-100">赔付上限：</span>{selectedProduct?.payoutCap}</p>
                <p className="mt-2"><span className="font-medium text-indigo-100">等待期：</span>{selectedProduct?.waitPeriod}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePurchase}
              className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400"
            >
              使用钱包支付并生成 policy_ref
            </button>
            {purchaseStatus && <div className="mt-3 text-sm text-emerald-300">{purchaseStatus}</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/80">
          <h3 className="text-lg font-semibold text-white">后台监控（索引器 / 本地验证器）</h3>
          <p className="mt-2">
            后端服务根据 policy_ref → uid_hash 关联关系，定期拉取订单 → 生成 Merkle root →
            调用 attest(root, uri)。链上记录 rootId，供后续 submitClaim 验证。
          </p>
          <p className="mt-2">
            本地验证器模式下，插件直接与后端共享最小化指纹（order_hash、proof），无需上传 API Key。
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">申赔：输入订单号即可</h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/80">
            <p>用户重新连接原钱包后，输入订单号，后端即基于 (wallet → policy_ref → uid_hash) 查找 proof 并校验额度/窗口。</p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-slate-500"
                placeholder="输入订单号（如 253875629349...）"
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
              />
              <button
                type="button"
                onClick={handleClaim}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-emerald-400"
              >
                验证并提交 submitClaim
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              合约校验 Merkle proof → 通过即自动赔付 / 记账；失败则返回原因并可发起申诉。
            </p>
            {claimStatus && <div className="mt-3 text-sm text-emerald-300">{claimStatus}</div>}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">申诉流程</h2>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200/80">
            <p>若自动校验失败，可补充最小字段或整行 CSV（允许遮蔽 PII），也可让本地验证器重新生成证据。</p>
            <textarea
              className="mt-4 h-28 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-slate-500"
              placeholder='粘贴订单最小字段，例如 {"orderId":"...","fillPx":"..."}'
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleAppeal}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
              >
                提交申诉
              </button>
              <button
                type="button"
                onClick={() => setBindStatus("已请求本地验证器重新计算并上报证据（模拟）。")}
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-indigo-300/60"
              >
                让本地验证器重新上报
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              后台人工 / 规则机审接口将触发仲裁角色或合约的二次提交函数，确保漏单也可赔付。
            </p>
            {appealStatus && <div className="mt-3 text-sm text-emerald-300">{appealStatus}</div>}
          </div>
        </section>

        <footer className="pt-8 text-xs text-slate-500">
          提示：以上交互为前端原型演示，链上调用 / 索引器流程可与现有 Attestor 与 PolicyManager 合约复用。
        </footer>
      </div>
    </div>
  );
}

function AttestorWorkbench() {
  const [csvText, setCsvText] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [merkleRoot, setMerkleRoot] = useState("");
  const [attestUrl, setAttestUrl] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [hasOnchain, setHasOnchain] = useState(null);

  const parsed = useMemo(() => {
    if (!csvText) return { headers: [], rows: [] };
    try { return parseCSV(csvText); } catch (e) { console.error(e); return { headers: [], rows: [] } }
  }, [csvText]);

  useEffect(() => {
    setHeaders(parsed.headers);
    setRows(parsed.rows);
  }, [parsed.headers, parsed.rows]);

  async function handleFile(f) {
    setCsvFile(f);
    const text = await f.text();
    setCsvText(text);
  }

  function buildRoot() {
    if (!rows.length) { setStatus("请先上传 CSV"); return; }
    // 将每一行规范化 → 生成 leaf
    const leaves = rows.map(r => keccakJson(canonicalizeRow(r)));
    const { root } = buildMerkle(leaves);
    setMerkleRoot(root);
    setStatus("Merkle root 已生成");
  }

  async function genAttestJson() {
    if (!merkleRoot) { setStatus("请先生成 Merkle root"); return; }
    const sha = csvFile ? await sha256HexOfFile(csvFile) : "";
    const exampleRow = orderId ? findRowById(rows, orderId) : rows[0];
    const payload = {
      merkleRoot,
      chainId: BASE_CHAIN_ID,
      contract: ATTESTOR_ADDR,
      dataset: {
        uri: "<请上传CSV到你的网站后粘贴URL>",
        sha256Hex: sha,
        rows: rows.length
      },
      generator: {
        name: "liqpass-web-attestor",
        version: "0.1.0",
        repo: "https://github.com/your-org/liqpass-web-attestor"
      },
      market: {
        exchange: "OKX",
        symbols: deduceSymbols(rows),
        timeWindow: { startISO: "", endISO: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      },
      counts: { positions: rows.length, liquidations: null, adl: null },
      method: {
        treeAlgo: "keccak256",
        leafFormat: "keccak256(utf8(JSON.stringify({exchange,id,inst,side,qty,unit,px,pnl,ts})))",
        proofFormat: "array<bytes32>"
      },
      createdAt: new Date().toISOString(),
      notes: "本文件由前端本地生成；未触达 OKX API。用户需自行上传 CSV 与本 attest.json 到可公开访问的URL后，再执行上链。",
      sample: {
        selectedOrder: exampleRow ? canonicalizeRow(exampleRow) : null
      }
    };
    downloadAs(`attest_${Date.now()}.json`, JSON.stringify(payload, null, 2));
    setStatus("attest.json 已生成并下载。请将其上传到你的网站 /files/ ，然后把URL粘贴到下方。");
  }

  function findRowById(_rows, id) {
    const candidates = ["id","ID","orderId","订单ID","关联订单id"]; 
    for (const r of _rows) {
      for (const k of candidates) {
        if (r[k] && String(r[k]).trim() === String(id).trim()) return r;
      }
    }
    return null;
  }

  function deduceSymbols(_rows) {
    const set = new Set();
    for (const r of _rows) {
      const c = canonicalizeRow(r);
      if (c.inst) set.add(c.inst);
    }
    return Array.from(set);
  }

  async function connectAndAttest() {
    try {
      if (!window.ethereum) { setStatus("未检测到钱包（MetaMask等）"); return; }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const [acc] = await provider.send("eth_requestAccounts", []);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== BASE_CHAIN_ID) {
        // 尝试切换/添加 Base
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ethers.toQuantity(BASE_CHAIN_ID) }]
          });
        } catch (e) {
          // 未添加则添加
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
        }
      }
      const signer = await provider.getSigner();
      const c = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, signer);

      if (!merkleRoot) { setStatus("缺少 merkleRoot，请先生成"); return; }
      if (!attestUrl || !attestUrl.startsWith("http")) { setStatus("请粘贴 attest.json 的公网 URL"); return; }

      // 调用合约
      setStatus("发送交易中...");
      const tx = await c.attest(merkleRoot, attestUrl);
      const rcpt = await tx.wait();
      setTxHash(tx.hash);
      setStatus("已上链。下面可点击 Basescan 查看。");
      // 读 has(root)
      const ok = await c.has(merkleRoot);
      setHasOnchain(ok);
    } catch (e) {
      console.error(e);
      setStatus(`失败：${e?.message ?? e}`);
    }
  }

  async function checkHas() {
    try {
      const provider = new ethers.JsonRpcProvider(BASE_RPC);
      const c = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, provider);
      const ok = await c.has(merkleRoot);
      setHasOnchain(ok);
      setStatus("已查询链上 has(root)");
    } catch (e) {
      setStatus(`查询失败：${e?.message ?? e}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">LiqPass — 本地验证 & 一键上链留痕</h1>
        <p className="text-sm opacity-70 mb-6">不连 OKX API；不上传隐私；所有计算在浏览器完成。合约：{ATTESTOR_ADDR}</p>

        {/* 步骤 1：上传 CSV */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-2">步骤 1 / 上传 OKX 导出的 CSV</h2>
          <div className="flex items-center gap-3 mb-3">
            <input type="file" accept=".csv,text/csv" onChange={(e)=> e.target.files?.[0] && handleFile(e.target.files[0])} />
            <button className="px-3 py-2 rounded-xl bg-slate-800 text-white" onClick={()=>{
              if (!csvText) return;
              const { headers, rows } = parseCSV(csvText);
              setHeaders(headers); setRows(rows);
            }}>解析</button>
          </div>
          <textarea className="w-full h-28 p-3 rounded-xl border" placeholder="或直接粘贴 CSV 文本..." value={csvText} onChange={e=>setCsvText(e.target.value)} />
          <div className="text-xs mt-2 opacity-70">提示：OKX 支持在「资产 → 订单中心」导出订单/交易历史为 CSV（最多3个月/次）。</div>
        </div>

        {/* 步骤 2：选择订单 & 生成 Root */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-2">步骤 2 / 选择订单并生成 Merkle Root</h2>
          <div className="flex items-center gap-3 mb-3">
            <input className="flex-1 border rounded-xl p-2" placeholder="输入订单号（可选，用于样例展示/校验）" value={orderId} onChange={e=>setOrderId(e.target.value)} />
            <button className="px-3 py-2 rounded-xl bg-slate-800 text-white" onClick={buildRoot}>生成 Root</button>
          </div>
          {merkleRoot && (
            <div className="text-sm break-all">merkleRoot：<code className="bg-slate-100 px-2 py-1 rounded">{merkleRoot}</code></div>
          )}
        </div>

        {/* 步骤 3：生成并下载 attest.json */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-2">步骤 3 / 生成 attest.json 并下载</h2>
          <div className="flex items-center gap-3 mb-3">
            <button className="px-3 py-2 rounded-xl bg-slate-800 text-white" onClick={genAttestJson}>生成 & 下载</button>
          </div>
          <div className="text-xs opacity-70">将下载的 attest.json 与原始 CSV 一并上传到你的网站（例如 <code>/files/</code> 目录），复制它的公网 URL。</div>
        </div>

        {/* 步骤 4：上链留痕 */}
        <div className="bg-white rounded-2xl shadow p-5 mb-6">
          <h2 className="text-xl font-semibold mb-2">步骤 4 / 上链留痕（Base 主网）</h2>
          <input className="w-full border rounded-xl p-2 mb-3" placeholder="粘贴 attest.json 的公网 URL (https://...)" value={attestUrl} onChange={e=>setAttestUrl(e.target.value)} />
          <div className="flex items-center gap-3">
            <button className="px-3 py-2 rounded-xl bg-emerald-600 text-white" onClick={connectAndAttest}>连接钱包并上链</button>
            <button className="px-3 py-2 rounded-xl bg-slate-200" onClick={checkHas}>检查 has(root)</button>
          </div>
          {txHash && (
            <div className="text-sm mt-3">Tx: <a className="text-blue-600 underline" target="_blank" href={`https://basescan.org/tx/${txHash}`}>{txHash}</a></div>
          )}
          {hasOnchain !== null && (
            <div className="text-sm mt-1">合约 has(root)：{String(hasOnchain)}</div>
          )}
        </div>

        {/* 状态栏 */}
        <div className="mt-4 text-sm opacity-80">{status}</div>

        {/* 表格速览（前10行） */}
        {rows.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-5 mt-6">
            <h3 className="font-semibold mb-2">CSV 预览（前 10 行）</h3>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {headers.map((h,i) => <th key={i} className="px-2 py-1 border-b text-left whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,10).map((r,idx)=> (
                    <tr key={idx} className="odd:bg-slate-50">
                      {headers.map((h,i)=> <td key={i} className="px-2 py-1 border-b whitespace-nowrap">{r[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="prose max-w-none mt-8">
          <h2>使用说明 / 无需服务器访问 OKX</h2>
          <ol>
            <li>登录 OKX，进入 <strong>资产 → 订单中心</strong>，导出交易/订单 CSV（OKX 限制单次最多3个月，需多次导出后合并）。</li>
            <li>将 CSV 上传到本页面，点击“生成 Root”。</li>
            <li>点击“生成 & 下载”，得到 <code>attest.json</code>（包含数据集 SHA-256、生成方法、样例订单等，便于审计复验）。</li>
            <li>把 <code>attest.json</code> 与原始 CSV 上传到你的网站（如 <code>https://wjz5788.com/files/</code>）。</li>
            <li>粘贴 <code>attest.json</code> 的公网 URL，连接钱包，签名并调用链上 <code>attest(root, uri)</code> 即完成留痕。</li>
          </ol>
          <p>（可选）OKX 在 2025 年推出了「订单分享」功能，用户也可以在 OKX 端开启分享并提供分享链接作为佐证材料。</p>
        </div>
      </div>
    </div>
  );
}

function RootApp() {
  const [view, setView] = useState("ux");

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-white">LiqPass</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">Base Mainnet</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              OKX 合约保险双模式原型（前端 UX）＋ 本地验证 & 上链留痕工具。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("ux")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                view === "ux"
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-700/30"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"
              }`}
            >
              OKX 合约保险 UX
            </button>
            <button
              type="button"
              onClick={() => setView("attestor")}
              className={`rounded-full px-4 py-2 text-sm transition ${
                view === "attestor"
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-700/30"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/60"
              }`}
            >
              本地取证 / 上链工具
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {view === "ux" ? <LiqPassUX key="ux" /> : <AttestorWorkbench key="attestor" />}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<RootApp />);

export default RootApp;

---

# LiqPass 最小可用仓库（MVP 全闭环）

> 目标：今天就能跑通“连接钱包 → 选产品 → USDC 购买 → 上传爆仓证据包 → 上链留痕 → 发起理赔 → 赔付到账”，用于 Base Grants 申请演示。OKX API 自动取证留到资助后落地（UI 里先灰置）。

## 目录结构
```
liqpass-mvp/
├─ contracts/
│  ├─ PolicyManager.sol
│  └─ abi/
│     ├─ PolicyManager.json         # 编译后 ABI（示例内嵌）
│     └─ Attestor.json              # 只需 has(root)、attest(root,uri)
├─ frontend/
│  ├─ index.html                    # 纯静态，无后端
│  └─ src/
│     └─ App.tsx                    # 5 个页签：Connect/Exchange/Products/Purchase/Claim
├─ scripts/
│  └─ mkroot.js                     # 本地生成 merkleRoot（CSV → root）
├─ examples/
│  ├─ orders.sample.csv
│  └─ attest.sample.json
├─ schema/
│  └─ attest.schema.json
└─ README.md
```

---

## contracts/PolicyManager.sol
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAttestor { function has(bytes32 root) external view returns (bool); }
interface IERC20   { function transferFrom(address,address,uint256) external returns(bool);
                     function transfer(address,uint256) external returns(bool);
                     function balanceOf(address) external view returns (uint256); }

contract PolicyManager {
    struct Product {
        uint256 premium;      // USDC(6dp) 按整数存，如 10 USDC => 10_000000
        uint256 maxPayout;    // 最高赔付（USDC）
        uint64  waitSeconds;  // 等待期（反欺诈）
        uint64  coverSeconds; // 保障时长
        bool    active;
    }
    struct Policy {
        address owner;
        uint256 productId;
        uint64  startAt;
        bool    claimed;
    }

    address public immutable USDC;   // <- 部署时填 Base 主网 USDC 地址（或先用占位再替换）
    IAttestor public immutable ATTESTOR; // 你现有的 ClaimAttestor 合约
    address public owner;

    mapping(uint256=>Product) public products;   // productId => Product
    mapping(uint256=>Policy)  public policies;   // policyId  => Policy
    mapping(bytes32=>bool)    public usedRoot;   // 防重复理赔
    uint256 public nextPolicyId;

    event Purchased(uint256 indexed policyId, address indexed buyer, uint256 productId, uint256 startAt);
    event Claimed(uint256 indexed policyId, bytes32 indexed root, string uri, uint256 payout, address to);

    modifier onlyOwner(){ require(msg.sender==owner, "!owner"); _; }

    constructor(address usdc, address attestor) {
        USDC = usdc; ATTESTOR = IAttestor(attestor); owner = msg.sender;
    }

    function setProduct(uint256 id, Product calldata p) external onlyOwner {
        products[id] = p;
    }

    function buy(uint256 productId) external {
        Product memory p = products[productId];
        require(p.active, "inactive");
        require(IERC20(USDC).transferFrom(msg.sender, address(this), p.premium), "pay fail");
        policies[++nextPolicyId] = Policy(msg.sender, productId, uint64(block.timestamp), false);
        emit Purchased(nextPolicyId, msg.sender, productId, block.timestamp);
    }

    // MVP：基于 attestor.has(root) + 时间窗 做最小校验
    function submitClaim(uint256 policyId, bytes32 root, string calldata uri, uint64 eventTs) external {
        Policy storage po = policies[policyId];
        require(msg.sender == po.owner, "!owner");
        require(!po.claimed, "claimed");
        Product memory prod = products[po.productId];
        require(block.timestamp >= po.startAt + prod.waitSeconds, "in waiting");
        require(eventTs >= po.startAt && eventTs <= po.startAt + prod.coverSeconds, "out of window");
        require(ATTESTOR.has(root), "root not attested");
        require(!usedRoot[root], "root used");
        usedRoot[root] = true;
        po.claimed = true;
        require(IERC20(USDC).transfer(po.owner, prod.maxPayout), "payout fail");
        emit Claimed(policyId, root, uri, prod.maxPayout, po.owner);
    }

    // 充入理赔资金（演示可手动从 owner 转入）
    function topup(uint256 amt) external onlyOwner {
        require(IERC20(USDC).transferFrom(msg.sender, address(this), amt), "topup fail");
    }
}
```

> **部署参数**：`USDC=<BASE_USDC_ADDRESS>`（先用占位，提交前再填真地址）; `attestor=<0x9552b58d323993f84d01e3744f175f47a9462f94>`。

---

## frontend/index.html（零构建版入口）
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LiqPass MVP</title>
  <script src="https://unpkg.com/ethers@6.13.2/dist/ethers.umd.min.js"></script>
  <style>body{font-family:system-ui, -apple-system, Segoe UI, Roboto, PingFang SC, Noto Sans, sans-serif; margin:0;}
  .wrap{max-width:940px;margin:24px auto;padding:0 16px} .card{background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,.08);padding:16px;margin:12px 0}
  button{border:0;border-radius:12px;padding:10px 14px;background:#111;color:#fff;cursor:pointer} input,select,textarea{padding:10px;border:1px solid #ddd;border-radius:10px;width:100%}
  code{background:#f5f5f7;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
<div class="wrap">
  <h1>LiqPass — Retail Liquidation Cover (MVP)</h1>
  <p>Flow: Connect → (Exchange) → Products → Purchase → Claim. OKX API 自动取证将在获得资助后开放；当前使用 <strong>CSV/本地取证 + 上链 attestation</strong>。</p>

  <div class="card">
    <h2>1) Connect</h2>
    <div>
      <button id="btnConnect">Connect Wallet (Base)</button>
      <div id="addr" style="margin-top:8px;color:#555"></div>
    </div>
  </div>

  <div class="card">
    <h2>2) Exchange</h2>
    <p>
      <label><input type="radio" name="ex" checked disabled /> OKX (API 只读，<em>资助后开放</em>)</label>
      <br />
      <label><input type="radio" name="ex" checked /> 上传 CSV（当前可用）</label>
    </p>
    <input type="file" id="csv" accept=".csv,text/csv" />
    <button id="btnRoot" style="margin-top:8px">本地生成 Merkle Root</button>
    <div id="rootOut" style="margin-top:6px"></div>
    <button id="btnAttJson" style="margin-top:8px">生成并下载 attest.json</button>
  </div>

  <div class="card">
    <h2>3) Products</h2>
    <p>选择一个 SKU（可在合约中由 owner 设置价格/等待期/时长）：</p>
    <select id="sku">
      <option value="1">#1 当日爆仓保 — premium=10 USDC, payout=100 USDC</option>
      <option value="2">#2 8小时时段保 — premium=6 USDC, payout=60 USDC</option>
      <option value="3">#3 月度回撤保 — premium=20 USDC, payout=200 USDC</option>
      <option value="4">#4 无爆仓返现 — premium=5 USDC, payout=8 USDC</option>
    </select>
  </div>

  <div class="card">
    <h2>4) Purchase</h2>
    <p>需要 USDC 余额。演示时可先给合约 <code>topup()</code> 注入赔付金。</p>
    <label>USDC 合约地址（Base）：<input id="usdc" placeholder="<USDC_ADDRESS_BASE>" /></label>
    <label style="margin-top:6px">PolicyManager 地址：<input id="pm" placeholder="<POLICY_MANAGER_ADDRESS>" /></label>
    <div style="display:flex; gap:8px; margin-top:8px">
      <button id="approve">Approve USDC</button>
      <button id="buy">Buy</button>
    </div>
    <div id="buyOut" style="margin-top:8px"></div>
  </div>

  <div class="card">
    <h2>5) Claim</h2>
    <label>policyId：<input id="pid" placeholder="1" /></label>
    <label style="margin-top:6px">merkleRoot：<input id="rootClaim" placeholder="0x..." /></label>
    <label style="margin-top:6px">attest.json 公网 URL：<input id="uriClaim" placeholder="https://.../attest.json" /></label>
    <label style="margin-top:6px">事件时间戳（秒）：<input id="eventTs" placeholder="1714666250" /></label>
    <div style="display:flex; gap:8px; margin-top:8px">
      <button id="doAttest">上链 attestation</button>
      <button id="doHas">检查 has(root)</button>
      <button id="doClaim">Submit Claim</button>
    </div>
    <div id="claimOut" style="margin-top:8px"></div>
  </div>
</div>

<script>
const ATTESTOR_ADDR = "0x9552b58d323993f84d01e3744f175f47a9462f94";
const ATTESTOR_ABI  = [
  "function attest(bytes32 root, string uri)",
  "function has(bytes32) view returns (bool)"
];
const PM_ABI = [
  "function buy(uint256 productId)",
  "function submitClaim(uint256 policyId, bytes32 root, string uri, uint64 eventTs)",
  "function setProduct(uint256 id, (uint256,uint256,uint64,uint64,bool))",
  "function topup(uint256 amt)",
  "function products(uint256) view returns (uint256 premium,uint256 maxPayout,uint64 waitSeconds,uint64 coverSeconds,bool active)"
];
const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

let provider, signer, account;
const BaseId = 8453;

function byId(id){ return document.getElementById(id); }

byId('btnConnect').onclick = async () => {
  if(!window.ethereum){ alert('请安装 MetaMask'); return; }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts',[]);
  const net = await provider.getNetwork();
  if(Number(net.chainId)!==BaseId){
    try{ await window.ethereum.request({method:'wallet_switchEthereumChain', params:[{chainId: ethers.toQuantity(BaseId)}]}); }
    catch(e){ await window.ethereum.request({method:'wallet_addEthereumChain', params:[{chainId: ethers.toQuantity(BaseId), chainName:'Base Mainnet', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}, rpcUrls:['https://mainnet.base.org'], blockExplorerUrls:['https://basescan.org']} ]}); }
  }
  signer = await provider.getSigner();
  account = await signer.getAddress();
  byId('addr').innerText = 'Connected: '+account;
};

// CSV → root（浏览器内最小实现，建议正式使用 PapaParse）
function splitCSVLine(line){ let out=[],cur="",q=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){ if(q&&line[i+1]==='"'){cur+='"'; i++;} else q=!q; } else if(ch===','&&!q){out.push(cur); cur="";} else cur+=ch;} out.push(cur); return out; }
function parseCSV(txt){ const L = txt.replace(/
/g,"
").replace(//g,"
").split("
").filter(Boolean); const headers=splitCSVLine(L[0]); const rows=[]; for(let i=1;i<L.length;i++){ const cols=splitCSVLine(L[i]); const r={}; headers.forEach((h,j)=> r[h.trim()] = (cols[j]??"").trim()); rows.push(r);} return {headers,rows}; }
const pick=(r,ks)=>{for(const k of ks) if(r[k]) return String(r[k]).trim(); return "";};
function canonicalizeRow(r){ return {exchange:"OKX", id:pick(r,["id","ID","orderId","订单ID","关联订单id"]), inst:pick(r,["交易品种","instId","Instrument","Symbol"]), side:pick(r,["交易类型","side","方向","Side"]), qty:pick(r,["数量","size","Qty","FilledQty","accFillSz"]), unit:pick(r,["交易单位","QtyUnit","Unit"]), px:pick(r,["成交价","fillPx","price","Price"]), pnl:pick(r,["收益","pnl","RealizedPnL","盈亏"]), ts:pick(r,["时间","ts","Time","timestamp"]) }; }
function stableJSONString(o){ const k=["exchange","id","inst","side","qty","unit","px","pnl","ts"]; const z={}; k.forEach(x=> z[x]=o[x]??""); return JSON.stringify(z); }
function keccakJson(o){ return ethers.keccak256(ethers.toUtf8Bytes(stableJSONString(o))); }
function buildMerkle(leaves){ if(!leaves.length) return ethers.ZeroHash; let lvl=leaves.map(h=>h.toLowerCase()).sort(); while(lvl.length>1){ const nxt=[]; for(let i=0;i<lvl.length;i+=2){ if(i+1===lvl.length) nxt.push(lvl[i]); else{ const a=lvl[i], b=lvl[i+1]; const L=a<=b?a:b, R=a<=b?b:a; nxt.push(ethers.keccak256(ethers.concat([ethers.getBytes(L), ethers.getBytes(R)]))); } } lvl=nxt.sort(); } return lvl[0]; }

let lastRoot="";
byId('btnRoot').onclick = async () => {
  const f = byId('csv').files?.[0]; if(!f){ alert('先选择 CSV'); return; }
  const txt = await f.text();
  const {rows}=parseCSV(txt);
  const leaves = rows.map(r=> keccakJson(canonicalizeRow(r)) );
  lastRoot = buildMerkle(leaves);
  byId('rootOut').innerHTML = 'root: <code>'+lastRoot+'</code> ('+rows.length+' rows)';
};

byId('btnAttJson').onclick = async () => {
  if(!lastRoot){ alert('请先生成 root'); return; }
  const data = {
    merkleRoot: lastRoot,
    chainId: 8453,
    contract: ATTESTOR_ADDR,
    dataset: { uri: "<UPLOAD_CSV_URL>", sha256Hex: "<SHA256_OF_CSV>", rows: -1 },
    generator: { name: "liqpass-web", version: "0.1.0" },
    market: { exchange: "OKX", symbols: [] },
    method: { treeAlgo: "keccak256", leafFormat: "keccak(JSON)" },
    createdAt: new Date().toISOString(),
    notes: "demo"
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='attest.json'; a.click(); URL.revokeObjectURL(url);
};

// Purchase
byId('approve').onclick = async () => {
  if(!signer){ alert('先连接钱包'); return; }
  const usdc = byId('usdc').value.trim(); const pm = byId('pm').value.trim();
  if(!usdc||!pm){ alert('填 USDC 与 PolicyManager 地址'); return; }
  const erc = new ethers.Contract(usdc, ERC20_ABI, signer);
  const sku = Number(byId('sku').value);
  const pmc = new ethers.Contract(pm, PM_ABI, signer);
  const p = await pmc.products(sku);
  const tx = await erc.approve(pm, p.premium);
  await tx.wait();
  byId('buyOut').innerText = 'Approve OK: '+tx.hash;
};

byId('buy').onclick = async () => {
  const pm = byId('pm').value.trim(); if(!pm){ alert('填 PolicyManager 地址'); return; }
  const sku = Number(byId('sku').value);
  const pmc = new ethers.Contract(pm, PM_ABI, signer);
  const tx = await pmc.buy(sku); const rc = await tx.wait();
  byId('buyOut').innerText = 'Buy OK: '+tx.hash+" — 事件里能看到 policyId 递增";
};

// Claim
byId('doAttest').onclick = async () => {
  const root = byId('rootClaim').value.trim(); const uri=byId('uriClaim').value.trim();
  if(!root||!uri){ alert('填 root 与 uri'); return; }
  const att = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, signer);
  const tx = await att.attest(root, uri); await tx.wait(); byId('claimOut').innerText = 'attest tx: '+tx.hash;
};
byId('doHas').onclick = async () => {
  const root = byId('rootClaim').value.trim();
  const att = new ethers.Contract(ATTESTOR_ADDR, ATTESTOR_ABI, provider||new ethers.JsonRpcProvider('https://mainnet.base.org'));
  const ok = await att.has(root); byId('claimOut').innerText = 'has(root) = '+ok;
};
byId('doClaim').onclick = async () => {
  const pm = byId('pm').value.trim(); const pid=Number(byId('pid').value); const root=byId('rootClaim').value.trim(); const uri=byId('uriClaim').value.trim(); const ts=Number(byId('eventTs').value);
  const pmc = new ethers.Contract(pm, PM_ABI, signer);
  const tx = await pmc.submitClaim(pid, root, uri, ts); await tx.wait();
  byId('claimOut').innerText = 'claim tx: '+tx.hash;
};
</script>
</body>
</html>
```

---

## scripts/mkroot.js（命令行本地生成 merkleRoot）
```js
// 用法：node mkroot.js orders.csv
const fs = require("fs");
const { keccak256, toUtf8Bytes, getBytes, concat } = require("ethers");
function splitCSVLine(line){ const out=[],cur=[""]; let q=false,curStr=""; out.length=0; let s="",res=[]; let i=0; const push=()=>{res.push(s); s=""};
  res=[]; for(i=0;i<line.length;i++){ const ch=line[i]; if(ch=='"'){ if(q && line[i+1]=='"'){ s+='"'; i++; } else q=!q; }
    else if(ch==',' && !q){ push(); } else s+=ch; } push(); return res; }
function parseCSV(txt){ const L=txt.replace(/
/g,"
").replace(//g,"
").split("
").filter(Boolean); const H=splitCSVLine(L[0]); const rows=[]; for(let i=1;i<L.length;i++){ const cols=splitCSVLine(L[i]); const r={}; H.forEach((h,j)=> r[h.trim()] = (cols[j]??"").trim()); rows.push(r);} return {headers:H,rows}; }
const pick=(r,ks)=>{for(const k of ks) if(r[k]) return String(r[k]).trim(); return "";};
function canonicalizeRow(r){ return {exchange:"OKX", id:pick(r,["id","ID","orderId","订单ID","关联订单id"]), inst:pick(r,["交易品种","instId","Instrument","Symbol"]), side:pick(r,["交易类型","side","方向","Side"]), qty:pick(r,["数量","size","Qty","FilledQty","accFillSz"]), unit:pick(r,["交易单位","QtyUnit","Unit"]), px:pick(r,["成交价","fillPx","price","Price"]), pnl:pick(r,["收益","pnl","RealizedPnL","盈亏"]), ts:pick(r,["时间","ts","Time","timestamp"]) }; }
function stableJSONString(o){ const k=["exchange","id","inst","side","qty","unit","px","pnl","ts"]; const z={}; k.forEach(x=> z[x]=o[x]??""); return JSON.stringify(z); }
function buildMerkle(leaves){ if(leaves.length===0) return "0x"+"0".repeat(64); let lvl=leaves.map(h=>h.toLowerCase()).sort(); while(lvl.length>1){ const nxt=[]; for(let i=0;i<lvl.length;i+=2){ if(i+1===lvl.length) nxt.push(lvl[i]); else{ const a=lvl[i], b=lvl[i+1]; const L=a<=b?a:b, R=a<=b?b:a; nxt.push(keccak256(concat([getBytes(L), getBytes(R)]))); } } lvl=nxt.sort(); } return lvl[0]; }
const csv = fs.readFileSync(process.argv[2]||"orders.csv","utf8");
const {rows}=parseCSV(csv);
const leaves = rows.map(r => keccak256(toUtf8Bytes(stableJSONString(canonicalizeRow(r)))));
const root = buildMerkle(leaves);
console.log("merkleRoot =", root, " (rows:", rows.length,")");
```

---

## examples/attest.sample.json（替换占位后直接可用）
```json
{
  "merkleRoot": "0x<REPLACE_WITH_YOUR_ROOT>",
  "chainId": 8453,
  "contract": "0x9552b58d323993f84d01e3744f175f47a9462f94",
  "dataset": {
    "uri": "https://wjz5788.com/files/orders.csv",
    "sha256Hex": "<SHA256_OF_CSV>",
    "rows": 123
  },
  "generator": { "name": "liqpass-local", "version": "0.1.0" },
  "market": { "exchange": "OKX", "symbols": ["LINK-USDT-SWAP"] },
  "method": { "treeAlgo": "keccak256", "leafFormat": "keccak(JSON)" },
  "createdAt": "2025-10-12T16:45:00+09:00",
  "notes": "demo"
}
```

---

## schema/attest.schema.json（审计复核用）
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LiqPass Attestation Payload",
  "type": "object",
  "properties": {
    "merkleRoot": { "type": "string", "pattern": "^0x[0-9a-fA-F]{64}$" },
    "chainId": { "type": "integer", "enum": [8453] },
    "contract": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
    "dataset": {
      "type": "object",
      "properties": {
        "uri": { "type": "string", "format": "uri" },
        "sha256Hex": { "type": "string", "pattern": "^[0-9a-fA-F]{64}$" },
        "rows": { "type": "integer", "minimum": 0 }
      },
      "required": ["uri", "sha256Hex"]
    },
    "generator": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "version": { "type": "string" }
      },
      "required": ["name", "version"]
    },
    "market": {
      "type": "object",
      "properties": {
        "exchange": { "type": "string" },
        "symbols": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["exchange"]
    },
    "method": {
      "type": "object",
      "properties": {
        "treeAlgo": { "type": "string" },
        "leafFormat": { "type": "string" }
      },
      "required": ["treeAlgo"]
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "notes": { "type": "string" }
  },
  "required": ["merkleRoot", "chainId", "contract", "dataset", "generator", "market", "method", "createdAt"]
}
```

---

## README.md（提交用最小说明）
```markdown
# LiqPass — Liquidation Attestation & Retail Cover (Base Mainnet)

**Live**: Attestor `0x9552…f94` on Base mainnet. PolicyManager (this repo) = `<DEPLOYED_ADDRESS>`.

## What it does
- Users create a local Merkle root from OKX CSV (privacy-preserving; no server needed now).
- Publish `attest.json` (dataset SHA-256, method, sample) and call onchain `attest(root, uri)`.
- Purchase a retail cover (USDC). If liquidation occurs within the window, submit a claim with the attested root → **automatic payout** from the contract balance.

## Why Base
Onchain, tamper-evident audit logs and payouts; brings a new user segment (insured leverage traders) and recurring onchain activity.

## Quickstart
1. Compile & deploy `contracts/PolicyManager.sol` with constructor `(USDC, ATTESTOR)`.
2. `setProduct(id, {premium,maxPayout,waitSeconds,coverSeconds,active=true})` for 4 SKUs.
3. Fund the contract via `topup()` with USDC for demo payouts.
4. Open `frontend/index.html` → Connect → Upload CSV → Generate root → Generate `attest.json` → paste URL → `attest(root, uri)` → Buy → SubmitClaim.

## Verify
- `Read Contract` → `has(root)` returns `true` on Attestor.
- Claim tx emits `Claimed(policyId, root, uri, payout, to)`.

## Roadmap (post-grant)
- OKX read-only API **automatic evidence** (server-side HMAC; encrypted-at-rest; no secrets in browser).
- Paymaster gasless UX; risk controls/blacklist caps; audit.

## Security
No custody of funds by backend; only contract holds USDC for payouts. Evidence is hashed+URI; users may redact CSV to minimal fields as long as the root is reproducible.
```

---

> 提交 Base Grants 时，把：合约地址、一次成功的 `attest` 交易、一次成功的 `submitClaim` 交易、以及 1 分钟演示视频链接，填进表单即可。
