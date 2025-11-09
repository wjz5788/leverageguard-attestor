import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend } from "recharts";
import { RefreshCw, AlertTriangle, Database, ShieldCheck, ExternalLink, Wallet, BarChart3, PieChart as PieChartIcon, Gauge, Clock, Copy, ChevronDown, ChevronRight } from "lucide-react";

/**
 * LiqPass · 透明度页 (/transparency)
 * 目标：按UTC日聚合的"可审计汇总"，默认7D，可切换30D/全部；历史不清空。
 * 展示：KPI、双折线(保费/赔付)、累计可选、甜甜圈(本金档位占比)、事件摘录(20条)、审计块、金库充足度仪表。
 * 数据来源（后端仅返回聚合）：
 *  - GET /transparency/overview?range=7d|30d|all
 *  - GET /transparency/timeseries?range=7d&interval=1d
 *  - GET /transparency/distribution?range=7d
 *  - GET /transparency/events?limit=20
 *  - GET /transparency/audit
 * 备注：若后端暂未就绪，组件内置 mock 回退（仅演示）。
 */

// =====================
// 配置
// =====================
const API_BASE = ""; // 同域部署留空，或例如 "/api"
const DEFAULT_RANGE = "7d"; // 7d | 30d | all
const BASESCAN_TX = (hash: string) => `https://basescan.org/tx/${hash}`; // Base主网(8453)
const BASESCAN_ADDR = (addr: string) => `https://basescan.org/address/${addr}`;

// 甜甜圈颜色（不指定具体主题色，仅分组）
const PALETTE = ["#4C78A8", "#F58518", "#54A24B", "#E45756"]; // 可替换为主题色

const COLOR_PREMIUM = "#4C78A8";
const COLOR_PAID = "#E45756";

// =====================
// 工具函数
// =====================
import { formatUSDC6d, fromUSDC6d, fmtUSDCCompat } from '../lib/usdcUtils';

function fmtInt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toLocaleString();
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || !isFinite(n)) return "-";
  return (n * 100).toFixed(1) + "%";
}

function parseISODateUTC(iso: string) {
  // 接收 "2025-10-21" 或 ISO 字符串，输出短日期标签（UTC）
  const d = iso.length <= 10 ? new Date(iso + "T00:00:00Z") : new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}-${day}`;
}

function classNames(...xs: (string | boolean | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch (_) {}
}

function mapEventType(type: string) {
  const map: Record<string, string> = {
    purchase: "购买",
    claim_paid: "赔付",
    reserve_topup: "金库充值",
    reserve_withdraw: "金库提取"
  };
  return map[type] || type;
}

// RangeSwitch 组件
function RangeSwitch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { value: "7d", label: "7天" },
    { value: "30d", label: "30天" },
    { value: "all", label: "全部" }
  ];

  return (
    <div className="inline-flex rounded-lg border bg-white/50 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={classNames(
            "px-3 py-1 rounded-md text-sm transition-colors",
            value === opt.value ? "bg-white shadow-sm" : "hover:bg-white/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// =====================
// Mock 回退（仅在接口失败时使用）
// =====================
function genMock(range: string) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 60;
  const today = new Date();
  const series = [];
  let cumP = 0;
  let cumC = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const premium = Math.max(0, Math.round((Math.random() * 20 + 5) * 100) / 100);
    const paid = Math.max(0, Math.round((Math.random() * 8) * 100) / 100 * (Math.random() < 0.4 ? 1 : 0));
    cumP += premium;
    cumC += paid;
    series.push({ date: d.toISOString().slice(0, 10), premium, paid, cumPremium: cumP, cumPaid: cumC, policies: Math.floor(Math.random() * 8), claims: Math.floor(Math.random() * 3) });
  }
  const overview = {
    policiesSold: series.reduce((a, b) => a + b.policies, 0),
    premiumUSDC: Number(series.reduce((a, b) => a + b.premium, 0).toFixed(2)),
    paidUSDC: Number(series.reduce((a, b) => a + b.paid, 0).toFixed(2)),
    lossRatio: 0, // 后面填充
    activePolicies: Math.floor(30 + Math.random() * 50),
    treasuryBalance: 12000 + Math.floor(Math.random() * 5000),
    requiredReserve: 10000 + Math.floor(Math.random() * 4000),
  };
  overview.lossRatio = overview.premiumUSDC > 0 ? Number((overview.paidUSDC / overview.premiumUSDC).toFixed(4)) : 0;

  const distribution = {
    buckets: [
      { label: "≤100", count: Math.floor(Math.random() * 60 + 40), premium: Math.round(Math.random() * 800) / 1 },
      { label: "101–200", count: Math.floor(Math.random() * 40 + 20), premium: Math.round(Math.random() * 600) / 1 },
      { label: "201–300", count: Math.floor(Math.random() * 20 + 10), premium: Math.round(Math.random() * 400) / 1 },
      { label: ">300", count: Math.floor(Math.random() * 10 + 5), premium: Math.round(Math.random() * 300) / 1 },
    ],
  };

  const events = Array.from({ length: 20 }).map((_, i) => ({
    ts_utc: new Date(Date.now() - i * 3600 * 1000).toISOString(),
    type: ["purchase", "claim_paid", "reserve_topup", "reserve_withdraw"][Math.floor(Math.random() * 4)],
    amount_usdc: Math.round((Math.random() * 200 + 10) * 100) / 100,
    order_digest: Math.random().toString(16).slice(2, 8).toUpperCase(),
    tx_hash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
  }));

  const audit = {
    contracts: [
      { name: "LeverageGuardV3", address: "0x0000000000000000000000000000000000000001", chainId: 8453 },
    ],
    docHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
    evidenceRoots: [
      { label: "2025-W43", merkleRoot: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("") },
    ],
  };

  return { overview, series, distribution, events, audit };
}

async function safeFetchJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// =====================
// 主组件
// =====================
export default function TransparencyPage() {
  const [range, setRange] = useState(DEFAULT_RANGE); // 7d | 30d | all
  const [metric, setMetric] = useState("count"); // 甜甜圈: count | premium
  const [showCumulative, setShowCumulative] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [overview, setOverview] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [distribution, setDistribution] = useState<{ buckets: any[] }>({ buckets: [] });
  const [events, setEvents] = useState<any[]>([]);
  const [audit, setAudit] = useState<any>(null);
  const hasAudit = useMemo(() => Boolean(audit && ((audit.contracts && audit.contracts.length) || audit.docHash || (audit.evidenceRoots && audit.evidenceRoots.length))), [audit]);
  const [auditOpen, setAuditOpen] = useState(false);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [ov, ts, dist, ev, au] = await Promise.all([
        safeFetchJSON(`${API_BASE}/transparency/overview?range=${range}`),
        safeFetchJSON(`${API_BASE}/transparency/timeseries?range=${range}&interval=1d`),
        safeFetchJSON(`${API_BASE}/transparency/distribution?range=${range}`),
        safeFetchJSON(`${API_BASE}/transparency/events?limit=20`),
        safeFetchJSON(`${API_BASE}/transparency/audit`),
      ]);

      // 填充累计字段（如果后端未给）
      let cumP = 0, cumC = 0;
      const tsWithCum = ts.map((d: any) => {
        cumP += (d.premium || 0);
        cumC += (d.paid || 0);
        return { ...d, cumPremium: Number(cumP.toFixed(2)), cumPaid: Number(cumC.toFixed(2)) };
      });

      setOverview(ov);
      setSeries(tsWithCum);
      setDistribution(dist);
      setEvents(ev || []);
      setAudit(au);
    } catch (e) {
      console.warn("API错误，启用mock:", e);
      const mock = genMock(range);
      setOverview(mock.overview);
      setSeries(mock.series);
      setDistribution(mock.distribution);
      setEvents(mock.events);
      setAudit(mock.audit);
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const kpis = useMemo(() => {
    if (!overview) return [];
    const { policiesSold, premiumUSDC, paidUSDC, lossRatio, activePolicies, treasuryBalance } = overview;
    return [
      { label: "7D售出份数", value: fmtInt(policiesSold), icon: <BarChart3 size={16} /> },
      { label: "7D保费", value: fmtUSDCCompat(premiumUSDC), icon: <Wallet size={16} /> },
      { label: "7D已赔付", value: fmtUSDCCompat(paidUSDC), icon: <ShieldCheck size={16} /> },
      { label: "7D赔付率", value: fmtPct(lossRatio), icon: <Gauge size={16} /> },
      { label: "当前在保份数", value: fmtInt(overview.activePolicies), icon: <Clock size={16} /> },
      { label: "金库余额", value: fmtUSDCCompat(treasuryBalance), icon: <Database size={16} /> },
    ];
  }, [overview]);

  const gauge = useMemo(() => {
    if (!overview) return { pct: null, state: "na" };
    const { treasuryBalance, requiredReserve } = overview;
    if (requiredReserve === undefined || requiredReserve === null || requiredReserve <= 0) return { pct: null, state: "na" };
    const pct = Math.max(0, Math.min(1, treasuryBalance / requiredReserve));
    const state = pct >= 1 ? "ok" : pct >= 0.7 ? "warn" : "critical";
    return { pct, state, treasuryBalance, requiredReserve };
  }, [overview]);

  const donutData = useMemo(() => {
    const buckets = (distribution?.buckets || []).map((b) => ({ ...b, value: metric === "count" ? b.count : b.premium }));
    const total = buckets.reduce((a, b) => a + (b.value || 0), 0);
    return { buckets, total };
  }, [distribution, metric]);

  return (
    <div className="min-h-screen w-full bg-[#FFF7ED] text-[#3F2E20]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* 标题与控制 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h1 className="text-2xl font-semibold">透明度 Transparency</h1>
          <div className="flex items-center gap-2">
            <RangeSwitch value={range} onChange={setRange} />
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm hover:bg-white/60"
              title="刷新"
            >
              <RefreshCw size={16} /> 刷新
            </button>
          </div>
        </div>

        {/* 顶部KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {kpis.map((k, idx) => (
            <div key={idx} className="rounded-2xl border bg-white/70 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-500">{k.label}</span>
                <span className="text-stone-500">{k.icon}</span>
              </div>
              <div className="mt-2 text-xl font-semibold tracking-tight">{k.value}</div>
            </div>
          ))}
        </div>

        {/* 图表区：双折线 + 累计切换 + 仪表 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
          <div className="xl:col-span-2 rounded-2xl border bg-white/70 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} />
                <span className="font-medium">保费/赔付（按UTC日）</span>
              </div>
              <label className="text-sm inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showCumulative} onChange={(e) => setShowCumulative(e.target.checked)} />
                累计
              </label>
            </div>
            <div className="h-72">
              {showCumulative ? (
                <ResponsiveContainer>
                  <AreaChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={parseISODateUTC} />
                    <YAxis />
                    <Tooltip formatter={(v: number | string) => typeof v === 'number' ? fmtUSDCCompat(v).replace(" USDC", "") : String(v)} labelFormatter={(l) => `UTC ${l}`} />
                    <Legend />
                    <Area type="monotone" name="累计保费" dataKey="cumPremium" stroke={COLOR_PREMIUM} fill={COLOR_PREMIUM} fillOpacity={0.3} />
                    <Area type="monotone" name="累计赔付" dataKey="cumPaid" stroke={COLOR_PAID} fill={COLOR_PAID} fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={parseISODateUTC} />
                    <YAxis />
                    <Tooltip formatter={(v: number | string) => typeof v === 'number' ? fmtUSDCCompat(v).replace(" USDC", "") : String(v)} labelFormatter={(l) => `UTC ${l}`} />
                    <Legend />
                    <Line type="monotone" name="保费" dataKey="premium" dot={false} stroke={COLOR_PREMIUM} />
                    <Line type="monotone" name="赔付" dataKey="paid" dot={false} stroke={COLOR_PAID} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 仪表 */}
          <div className={`rounded-2xl border bg-white/70 p-4 shadow-sm ${hasAudit ? "" : "hidden"}`}>
            <div className="flex items-center gap-2 mb-2"><Gauge size={16} /><span className="font-medium">金库充足度</span></div>
            {gauge.pct === null ? (
              <div className="text-sm text-stone-500">后端未提供 requiredReserve，暂不显示。可在 /transparency/overview 增加字段。</div>
            ) : (
              <div>
                <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className={classNames("h-2", gauge.state === "ok" ? "bg-green-500" : gauge.state === "warn" ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${Math.min(100, Math.max(0, Math.round(gauge.pct * 100)))}%` }}
                  />
                </div>
                <div className="mt-2 text-sm flex justify-between">
                  <span>余额 {fmtUSDCCompat(gauge.treasuryBalance)}</span>
                  <span>需求 {fmtUSDCCompat(gauge.requiredReserve)}</span>
                </div>
                <div className="mt-1 text-xs text-stone-500">{gauge.state === "ok" ? "ok ≥ 100%" : gauge.state === "warn" ? "warn 70–100%" : "critical < 70%"}</div>
              </div>
            )}
            {err && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-800">
                <AlertTriangle size={16} className="mt-0.5" />
                <span className="text-xs">接口异常已使用演示数据：{err}</span>
              </div>
            )}
          </div>
        </div>

        {/* 甜甜圈 + 事件摘录 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border bg-white/70 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><PieChartIcon size={16} /><span className="font-medium">本金档位占比</span></div>
              <div className="flex gap-2 text-sm">
                <button className={classNames("px-2 py-1 rounded-md border", metric === "count" ? "bg-white" : "opacity-70")} onClick={() => setMetric("count")}>
                  份数
                </button>
                <button className={classNames("px-2 py-1 rounded-md border", metric === "premium" ? "bg-white" : "opacity-70")} onClick={() => setMetric("premium")}>
                  保费
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData.buckets} dataKey="value" nameKey="label" innerRadius={60} outerRadius={90}>
                    {donutData.buckets.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number | string, n: string, p: any) => [metric === "count" ? `${v} 份` : typeof v === 'number' ? fmtUSDCCompat(v).replace(" USDC", "") : String(v), p?.payload?.label]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-stone-500">合计：{metric === "count" ? fmtInt(donutData.total) + " 份" : fmtUSDCCompat(donutData.total)}</div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border bg-white/70 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2"><Clock size={16} /><span className="font-medium">最近上链事件（20条）</span></div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-stone-500">
                    <th className="py-2 pr-4">时间(UTC)</th>
                    <th className="py-2 pr-4">事件</th>
                    <th className="py-2 pr-4">金额</th>
                    <th className="py-2 pr-4">指纹</th>
                    <th className="py-2 pr-4">tx</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.ts_utc).toISOString().replace(".000Z", "Z")}</td>
                      <td className="py-2 pr-4">{mapEventType(e.type)}</td>
                      <td className="py-2 pr-4">{fmtUSDCCompat(e.amount_usdc)}</td>
                      <td className="py-2 pr-4 font-mono">{(e.order_digest || e.orderDigest || "——").toString().slice(-6)}</td>
                      <td className="py-2 pr-4">
                        {e.tx_hash ? (
                          <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={BASESCAN_TX(e.tx_hash)} target="_blank" rel="noreferrer">
                            查看 <ExternalLink size={14} />
                          </a>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 审计块 */}
        <div className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><ShieldCheck size={16} /><span className="font-medium">审计信息</span></div><button onClick={() => setAuditOpen(v => !v)} className="text-sm inline-flex items-center gap-1 text-blue-600 hover:underline">{auditOpen ? <>收起<ChevronDown size={14} /></> : <>展开<ChevronRight size={14} /></>}</button></div>
          {auditOpen && audit && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-stone-500 mb-1">合约地址 · 链</div>
                <ul className="text-sm space-y-1">
                  {audit.contracts?.map((c: any, i: number) => (
                    <li key={i} className="font-mono break-all">
                      {c.name ? <span className="mr-2">[{c.name}]</span> : null}
                      <a href={BASESCAN_ADDR(c.address)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{c.address}</a><button onClick={() => copy(c.address)} className="ml-2 inline-flex items-center text-xs text-stone-500 hover:text-stone-700" title="复制地址"><Copy size={14} /></button>
                      {c.chainId ? <span className="ml-2 text-stone-500">chainId {c.chainId}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-sm text-stone-500 mb-1">最新承诺文档 docHash</div>
                <div className="font-mono break-all text-sm">
                  {audit.docHash || "——"}
                  {audit.docHash ? <button onClick={() => copy(audit.docHash)} className="ml-2 inline-flex items-center text-xs text-stone-500 hover:text-stone-700" title="复制"><Copy size={14} /></button> : null}
                </div>
              </div>
              <div>
                <div className="text-sm text-stone-500 mb-1">证据根 evidenceRoots</div>
                <ul className="text-sm space-y-1">
                  {audit.evidenceRoots?.map((r: any, i: number) => (
                    <li key={i} className="font-mono break-all">
                      [{r.label}] {r.merkleRoot}
                      <button onClick={() => copy(r.merkleRoot)} className="ml-2 inline-flex items-center text-xs text-stone-500 hover:text-stone-700" title="复制"><Copy size={14} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}