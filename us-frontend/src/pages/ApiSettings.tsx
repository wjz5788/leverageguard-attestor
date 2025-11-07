import React, { useEffect, useMemo, useState } from 'react';

// 类型定义
interface ExchangeAccount {
  id: string;
  exchange: 'OKX' | 'Hyperliquid' | 'Binance';
  label: string;
  status: 'draft' | 'unverified' | 'verifying' | 'verified' | 'failed' | 'disabled' | 'deleted';
  lastVerifiedAt: string | null;
  caps: {
    orders: boolean;
    fills: boolean;
    positions: boolean;
    liquidations: boolean;
  };
  account: {
    exchangeUid?: string;
    subAccount?: string;
  };
  masked: {
    apiKeyLast4?: string;
  };
  environment: 'live' | 'testnet';
  userConfirmedEcho?: boolean;
  lastVerifyResult?: VerifyResult;
}

interface VerifyResult {
  status: 'verified' | 'failed' | 'partial' | 'error';
  caps: {
    orders: boolean;
    fills: boolean;
    positions: boolean;
    liquidations: boolean;
  };
  account: {
    exchangeUid?: string;
    subAccount?: string;
    accountType?: string;
    sampleInstruments?: string[];
  };
  proof?: {
    echo?: {
      firstOrderIdLast4?: string;
      firstFillQty?: string;
      firstFillTime?: string;
    };
    hash?: string;
  };
  reasons?: string[];
  verifiedAt?: string;
  order?: OrderEcho;
  checks?: VerifyChecks;
  liquidation?: LiquidationInfo;
  sessionId?: string;
}

interface OrderEcho {
  orderId: string;
  pair: string;
  side?: string;
  type?: string;
  status?: string;
  executedQty?: string;
  avgPrice?: string;
  quoteAmount?: string;
  orderTimeIso?: string;
  exchangeTimeIso?: string;
}

interface VerifyChecks {
  authOk: boolean;
  capsOk: boolean;
  orderFound: boolean;
  echoLast4Ok: boolean;
  arithmeticOk: boolean;
  pairOk: boolean;
  timeSkewMs: number;
  verdict: 'pass' | 'fail';
}

interface LiquidationInfo {
  status: 'none' | 'forced_liquidation' | 'adl';
  eventTimeIso?: string;
  instrument?: string;
  positionSizeBefore?: string;
  positionSizeAfter?: string;
  pnlAbs?: string;
}

interface AccountVerifyForm {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  uid: string;
  ordId: string;
  instId: string;
}

interface VerifyPayload {
  exchange: string;
  ordId: string;
  instId: string;
  live: boolean;
  fresh: boolean;
  noCache: boolean;
  keyMode: 'inline' | 'alias';
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  uid?: string;
}

const createInitialVerifyForm = (): AccountVerifyForm => ({
  apiKey: '',
  secretKey: '',
  passphrase: '',
  uid: '',
  ordId: '',
  instId: '',
});

type VerifyResponse = {
  meta?: any;
  normalized?: any;
  raw?: any;
  evidence?: any;
  perf?: any;
  detail?: string;
  message?: string;
  error?: string;
};

// 交易所字段定义
const EXCHANGES_META = {
  OKX: {
    label: 'OKX',
    fields: [
      { key: 'apiKey', label: 'API Key', sensitive: true },
      { key: 'apiSecret', label: 'API Secret', sensitive: true },
      { key: 'passphrase', label: 'Passphrase', sensitive: true },
    ],
  },
  Hyperliquid: {
    label: 'Hyperliquid',
    fields: [
      { key: 'apiKey', label: 'API Key', sensitive: true },
      { key: 'apiSecret', label: 'API Secret / Signing Key', sensitive: true },
      { key: 'accountId', label: 'Account ID / SubAccount', sensitive: false },
    ],
  },
  Binance: {
    label: 'Binance',
    fields: [
      { key: 'apiKey', label: 'API Key', sensitive: true },
      { key: 'apiSecret', label: 'API Secret', sensitive: true },
    ],
  },
} as const;

// API 调用函数
async function api(path: string, options: { method?: string; body?: any } = {}) {
  const { method = 'GET', body } = options;
  
  // 模拟后端调用
  if (process.env.NODE_ENV === 'development') {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 模拟数据
    if (path === '/api/v1/verification/supported-exchanges' && method === 'GET') {
      return {
        exchanges: Object.keys(EXCHANGES_META),
        fields: EXCHANGES_META,
      };
    }
    
    if (path === '/api/v1/verification/verify' && method === 'POST') {
      return {
        status: 'verified',
        caps: { orders: true, fills: true, positions: true, liquidations: true },
        account: { exchangeUid: '12345678', subAccount: 'main', accountType: 'futures', sampleInstruments: ['BTC-USDT-PERP'] },
        proof: { echo: { firstOrderIdLast4: '8a3f', firstFillQty: '0.001', firstFillTime: new Date().toISOString() }, hash: 'keccak256(0x...)' },
        verifiedAt: new Date().toISOString(),
        order: {
          orderId: body.orderRef,
          pair: body.pair,
          side: 'SELL',
          type: 'MARKET',
          status: 'FILLED',
          executedQty: '0.001',
          avgPrice: '100000',
          quoteAmount: '100',
          orderTimeIso: new Date().toISOString(),
          exchangeTimeIso: new Date().toISOString(),
        },
        checks: {
          authOk: true,
          capsOk: true,
          orderFound: true,
          echoLast4Ok: true,
          arithmeticOk: true,
          pairOk: true,
          timeSkewMs: 10,
          verdict: 'pass',
        },
        liquidation: { status: 'none' },
        sessionId: 'sess_' + Date.now(),
      };
    }
  }
  
  const res = await fetch(`http://localhost:3002${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// 状态徽章组件
function StatusBadge({ status, lastVerifiedAt, pendingConfirm, verifying }: {
  status: ExchangeAccount['status'];
  lastVerifiedAt: string | null;
  pendingConfirm?: boolean;
  verifying?: boolean;
}) {
  const formatTime = (time: string) => {
    return new Date(time).toLocaleString('zh-CN');
  };

  const getBadgeConfig = () => {
    if (verifying) {
      return { text: '🔄 验证中…', cls: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' };
    }
    if (status === 'verified' && pendingConfirm) {
      return { text: '🟡 待确认 · 核对回显后点击"确认无误"', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    
    const map = {
      verified: { text: `✅ 已验证${lastVerifiedAt ? ` · ${formatTime(lastVerifiedAt)}` : ''}`, cls: 'bg-green-50 text-green-700 border-green-200' },
      failed: { text: '❌ 未通过 · 点击查看原因', cls: 'bg-red-50 text-red-700 border-red-200' },
      unverified: { text: '⏳ 待验证 · 请先验证', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      verifying: { text: '🔄 验证中…', cls: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' },
      disabled: { text: '⛔ 已禁用', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
      deleted: { text: '🗑 已删除', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
      draft: { text: '草稿', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
    };
    
    return map[status] || map.unverified;
  };

  const config = getBadgeConfig();
  return (
    <span className={`inline-block rounded-xl border px-2 py-1 text-xs ${config.cls}`}>
      {config.text}
    </span>
  );
}

// 表单字段组件
function Field({ label, children, required }: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block mb-3">
      <div className="mb-1 text-sm text-zinc-700">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </div>
      {children}
    </label>
  );
}

// 按钮组件
function Button({ children, onClick, kind = 'primary', className = '', disabled }: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
}) {
  const base = 'px-3 py-2 rounded-xl text-sm border shadow-sm disabled:opacity-50';
  const cls = {
    primary: 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800',
    ghost: 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50',
    danger: 'bg-white text-red-700 border-red-300 hover:bg-red-50',
  }[kind];
  
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${cls} ${className}`}>
      {children}
    </button>
  );
}

// 输入框组件
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 ${props.className || ''}`}
    />
  );
}

// 选择框组件
function Select({ value, onChange, options, disabled }: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// API 设置页面主组件
export const ApiSettings: React.FC<{ t: (key: string) => string }> = ({ t }) => {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [accountForms, setAccountForms] = useState<Record<string, AccountVerifyForm>>({});
  const [resultOpen, setResultOpen] = useState(false);
  const [resultData, setResultData] = useState<VerifyResponse | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});
  
  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(() => accounts.find(x => x.id === editingId) || null, [accounts, editingId]);
  
  // 表单状态
  const [form, setForm] = useState({
    exchange: 'OKX' as 'OKX' | 'Hyperliquid' | 'Binance',
    label: '',
    environment: 'live' as 'live' | 'testnet',
    ipWhitelist: '',
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    extra: {} as Record<string, string>,
  });
  
  // 初始加载
  useEffect(() => {
    loadAccounts();
  }, []);

  // 加载账户列表
  const loadAccounts = async () => {
    setLoading(true);
    try {
      // 模拟数据
      const mockAccounts: ExchangeAccount[] = [
        {
          id: 'eacc_okx_1',
          exchange: 'OKX',
          label: 'OKX 主账号',
          status: 'verified',
          lastVerifiedAt: new Date().toISOString(),
          caps: { orders: true, fills: true, positions: true, liquidations: true },
          account: { exchangeUid: '12345678', subAccount: 'main' },
          masked: { apiKeyLast4: 'a9f2' },
          environment: 'live',
          userConfirmedEcho: false,
        },
        {
          id: 'eacc_bin_1',
          exchange: 'Binance',
          label: '工作号',
          status: 'unverified',
          lastVerifiedAt: null,
          caps: { orders: false, fills: false, positions: false, liquidations: false },
          account: {},
          masked: {},
          environment: 'testnet',
        },
      ];
      setAccounts(mockAccounts);
      setAccountForms(prev => {
        const next: Record<string, AccountVerifyForm> = {};
        mockAccounts.forEach(acc => {
          next[acc.id] = prev[acc.id] ?? createInitialVerifyForm();
        });
        return next;
      });
    } catch (error) {
      setToast('加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开创建表单
  const openCreate = () => {
    setEditingId(null);
    setForm({
      exchange: 'OKX',
      label: '',
      environment: 'live',
      ipWhitelist: '',
      apiKey: '',
      apiSecret: '',
      passphrase: '',
      extra: {},
    });
    setDrawerOpen(true);
  };

  // 打开编辑表单
  const openEdit = async (id: string) => {
    setEditingId(id);
    setDrawerOpen(true);
    
    const account = accounts.find(acc => acc.id === id);
    if (account) {
      setForm({
        exchange: account.exchange,
        label: account.label,
        environment: account.environment,
        ipWhitelist: '',
        apiKey: '',
        apiSecret: '',
        passphrase: '',
        extra: {},
      });
    }
  };

  // 保存表单
  const saveForm = async () => {
    try {
      if (!editingId) {
        // 创建新账户
        const newAccount: ExchangeAccount = {
          id: 'eacc_' + Date.now(),
          exchange: form.exchange,
          label: form.label,
          status: 'unverified',
          lastVerifiedAt: null,
          caps: { orders: false, fills: false, positions: false, liquidations: false },
          account: {},
          masked: { apiKeyLast4: form.apiKey.slice(-4) },
          environment: form.environment,
        };
        
        setAccounts(prev => [newAccount, ...prev]);
        setToast('已创建，待验证');
        setAccountForms(prev => ({
          ...prev,
          [newAccount.id]: createInitialVerifyForm(),
        }));
      } else {
        // 更新现有账户
        setAccounts(prev => prev.map(acc => 
          acc.id === editingId 
            ? { ...acc, label: form.label, environment: form.environment }
            : acc
        ));
        setToast('已保存');
      }
      
      setDrawerOpen(false);
    } catch (error) {
      setToast('保存失败');
    }
  };

  // 删除账户
  const deleteAccount = async (id: string) => {
    if (!confirm('确认删除？将清空密钥并标记为已删除')) return;
    
    try {
      // 调用后端删除API
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || '删除失败');
      }

      // 后端删除成功后，更新前端状态
      setAccounts(prev => prev.map(acc => 
        acc.id === id 
          ? { ...acc, status: 'deleted' as const }
          : acc
      ));
      setAccountForms(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setToast('已删除');
    } catch (error: any) {
      console.error('删除账户失败:', error);
      setToast(error.message || '删除失败');
    }
  };

  // 执行验证
  const doVerify = async (accountId: string, payload: VerifyPayload) => {
    setResultData(null);
    setResultError(null);
    setResultOpen(true);
    setVerifyingMap(prev => ({ ...prev, [accountId]: true }));

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const maybeJson = await res.json().catch(() => ({}));
      const data: VerifyResponse = maybeJson && typeof maybeJson === 'object' ? maybeJson : {};

      if (!res.ok) {
        const reason = (data?.detail || data?.message || data?.error || '') as string;
        throw new Error(reason || `HTTP ${res.status}`);
      }

      // 统一状态处理逻辑
      const statusHint = String((data as any)?.status || (data as any)?.meta?.status || '').toLowerCase();
      const normalizedStatus: ExchangeAccount['status'] = statusHint.includes('fail')
        ? 'failed'
        : 'verified';
      const verifiedAt = (data as any)?.meta?.verifiedAt || (data as any)?.verifiedAt || new Date().toISOString();

      setAccounts(prev => prev.map(acc =>
        acc.id === accountId
          ? {
              ...acc,
              status: normalizedStatus,
              lastVerifiedAt: typeof verifiedAt === 'string' ? verifiedAt : new Date().toISOString(),
              lastVerifyResult: data as unknown as VerifyResult,
              userConfirmedEcho: normalizedStatus === 'verified' ? false : acc.userConfirmedEcho,
            }
          : acc
      ));

      setResultData(data);
      setToast(normalizedStatus === 'verified' ? '已生成回显，待确认' : '验证结果已返回');
    } catch (error: any) {
      const message = error?.message || '验证失败';
      setAccounts(prev => prev.map(acc =>
        acc.id === accountId
          ? { ...acc, status: 'failed', lastVerifyResult: undefined }
          : acc
      ));
      setResultError(message);
      setToast(message);
    } finally {
      setVerifyingMap(prev => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }
  };

  // 确认回显
  const confirmEcho = async (id: string) => {
    setAccounts(prev => prev.map(acc => 
      acc.id === id 
        ? { ...acc, userConfirmedEcho: true }
        : acc
    ));
    setToast('已记录确认');
  };

  // 获取当前交易所的字段配置
  const currentExchangeFields = EXCHANGES_META[form.exchange]?.fields || [];

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="sticky top-0 z-10 bg-amber-50/80 backdrop-blur border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-zinc-900">个人中心 · API 设置</span>
            <span className="text-xs text-zinc-500">/settings/exchange-apis</span>
          </div>
          <div className="flex items-center gap-2">
            <Button kind="ghost" onClick={loadAccounts}>刷新</Button>
            <Button onClick={openCreate}>新建账号</Button>
          </div>
        </div>
        {toast && (
          <div className="max-w-5xl mx-auto px-4 pb-3 text-sm text-zinc-700">
            {toast}
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-zinc-600">加载中…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const form = accountForms[acc.id] ?? createInitialVerifyForm();
              return (
                <AccountCard 
                  key={acc.id} 
                  acc={acc} 
                  form={form}
                  onFormChange={(patch) => {
                    setAccountForms(prev => {
                      const prevForm = prev[acc.id] ?? createInitialVerifyForm();
                      return {
                        ...prev,
                        [acc.id]: {
                          ...prevForm,
                          ...patch,
                        },
                      };
                    });
                  }}
                  onEdit={() => openEdit(acc.id)}
                  onDelete={() => deleteAccount(acc.id)}
                  onVerify={(payload) => doVerify(acc.id, payload)}
                  onConfirmEcho={() => confirmEcho(acc.id)}
                  onToast={(msg) => setToast(msg)}
                  verifying={verifyingMap[acc.id]}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* 创建/编辑抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {editingId ? '编辑账号' : '新建账号'}
                </h3>
                <button 
                  onClick={() => setDrawerOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <Field label="交易所" required>
                  <Select
                    value={form.exchange}
                    onChange={(value) => setForm(prev => ({ ...prev, exchange: value as any }))}
                    options={Object.keys(EXCHANGES_META).map(key => ({
                      value: key,
                      label: EXCHANGES_META[key as keyof typeof EXCHANGES_META].label,
                    }))}
                  />
                </Field>
                
                <Field label="标签" required>
                  <Input
                    placeholder="给这个账号起个名字"
                    value={form.label}
                    onChange={(e) => setForm(prev => ({ ...prev, label: e.target.value }))}
                  />
                </Field>
                
                <Field label="环境" required>
                  <Select
                    value={form.environment}
                    onChange={(value) => setForm(prev => ({ ...prev, environment: value as any }))}
                    options={[
                      { value: 'live', label: '实盘' },
                      { value: 'testnet', label: '测试网' },
                    ]}
                  />
                </Field>
                
                {currentExchangeFields.map((field) => (
                  <Field key={field.key} label={field.label} required>
                    <Input
                      type={field.sensitive ? 'password' : 'text'}
                      placeholder={`请输入${field.label}`}
                      value={form[field.key as keyof typeof form] as string || ''}
                      onChange={(e) => setForm(prev => ({ 
                        ...prev, 
                        [field.key]: e.target.value 
                      }))}
                    />
                  </Field>
                ))}
                
                <div className="flex gap-2 pt-4">
                  <Button onClick={saveForm} className="flex-1">
                    {editingId ? '保存' : '创建'}
                  </Button>
                  <Button kind="ghost" onClick={() => setDrawerOpen(false)}>
                    取消
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {resultOpen && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="p-6 space-y-3 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-lg text-zinc-900">验证结果</div>
                <button
                  onClick={() => setResultOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>

              {!resultData && !resultError && (
                <div className="text-sm text-zinc-600">正在验证…请稍候</div>
              )}

              {resultError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  失败：{resultError}
                </div>
              )}

              {resultData && (
                <div className="space-y-3">
                  <Section title="meta" data={resultData.meta} />
                  <Section title="normalized" data={resultData.normalized} />
                  <Section title="raw" data={resultData.raw} />
                  <Section title="evidence" data={resultData.evidence} />
                  <Section title="perf" data={resultData.perf} />
                  {!resultData.meta && !resultData.normalized && !resultData.raw && !resultData.evidence && (
                    <details className="rounded-md border p-3" open>
                      <summary className="cursor-pointer font-medium">response</summary>
                      <pre className="mt-2 text-sm overflow-auto max-h-72">
                        {JSON.stringify(resultData, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {resultData && (
                  <Button
                    kind="ghost"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement('a');
                      anchor.href = url;
                      anchor.download = 'verify-result.json';
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    下载 JSON
                  </Button>
                )}
                <Button kind="primary" onClick={() => setResultOpen(false)}>
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// AccountCard 组件
const AccountCard = ({ 
  acc, 
  form,
  onFormChange,
  onEdit, 
  onDelete, 
  onVerify, 
  onConfirmEcho,
  onToast,
  verifying = false,
}: {
  acc: ExchangeAccount;
  form: AccountVerifyForm;
  onFormChange: (patch: Partial<AccountVerifyForm>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onVerify: (payload: VerifyPayload) => void;
  onConfirmEcho: () => void;
  onToast: (msg: string) => void;
  verifying?: boolean;
}) => {
  const icon = acc.exchange.slice(0, 2).toUpperCase();
  const isVerified = acc.status === "verified";
  const isFailed = acc.status === "failed";
  const last = acc.lastVerifyResult;
  const [submitted, setSubmitted] = useState(false);
  const trimmedForm = {
    apiKey: form.apiKey.trim(),
    secretKey: form.secretKey.trim(),
    passphrase: form.passphrase.trim(),
    uid: form.uid.trim(),
    ordId: form.ordId.trim(),
    instId: form.instId.trim(),
  };
  
  const tryVerify = () => {
    setSubmitted(true);
    const required = [
      { key: 'apiKey', label: 'API Key', value: trimmedForm.apiKey },
      { key: 'secretKey', label: 'Secret Key', value: trimmedForm.secretKey },
      { key: 'ordId', label: '订单号', value: trimmedForm.ordId },
      { key: 'instId', label: '交易对/合约', value: trimmedForm.instId },
    ];
    if (acc.exchange === 'OKX') {
      required.push(
        { key: 'passphrase', label: 'Passphrase', value: trimmedForm.passphrase },
        { key: 'uid', label: 'UID', value: trimmedForm.uid },
      );
    }
    const missing = required.filter(item => !item.value);
    if (missing.length > 0) {
      const missingLabels = missing.map(item => item.label).join('、');
      onToast(`请填写 ${missingLabels}`);
      return;
    }

    onFormChange(trimmedForm);

    onVerify({
      exchange: acc.exchange.toLowerCase(),
      ordId: trimmedForm.ordId,
      instId: trimmedForm.instId,
      live: acc.environment === 'live',
      fresh: true,
      noCache: true,
      keyMode: 'inline',
      apiKey: trimmedForm.apiKey,
      secretKey: trimmedForm.secretKey,
      passphrase: trimmedForm.passphrase || undefined,
      uid: trimmedForm.uid || undefined,
    });
  };
  
  const pendingConfirm = isVerified && !acc.userConfirmedEcho;
  
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
            {icon}
          </div>
          <div>
            <div className="font-medium text-zinc-900">{acc.exchange} · {acc.label}</div>
            <div className="text-xs text-zinc-500">
              环境 {acc.environment} · UID {acc.account?.exchangeUid || "—"} · 子账户 {acc.account?.subAccount || "—"}
            </div>
          </div>
        </div>
        <StatusBadge 
          status={acc.status} 
          lastVerifiedAt={acc.lastVerifiedAt} 
          pendingConfirm={pendingConfirm} 
        />
      </div>

      <div className="text-xs text-zinc-600">
        能力：订单 {bool(acc.caps.orders)} · 成交 {bool(acc.caps.fills)} · 持仓 {bool(acc.caps.positions)} · 强平 {bool(acc.caps.liquidations)}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="text-xs text-zinc-700">API 凭证</div>
        <Input 
          type="password"
          placeholder="API Key" 
          value={form.apiKey} 
          onChange={(e) => onFormChange({ apiKey: e.target.value })}
          className={submitted && !trimmedForm.apiKey ? 'border-red-400' : ''} 
        />
        <Input 
          type="password"
          placeholder="Secret Key" 
          value={form.secretKey} 
          onChange={(e) => onFormChange({ secretKey: e.target.value })}
          className={submitted && !trimmedForm.secretKey ? 'border-red-400' : ''} 
        />
        {acc.exchange === 'OKX' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input 
              type="password"
              placeholder="Passphrase" 
              value={form.passphrase} 
              onChange={(e) => onFormChange({ passphrase: e.target.value })}
              className={submitted && !trimmedForm.passphrase ? 'border-red-400' : ''} 
            />
            <Input 
              placeholder="UID" 
              value={form.uid} 
              onChange={(e) => onFormChange({ uid: e.target.value })}
              className={submitted && !trimmedForm.uid ? 'border-red-400' : ''} 
            />
          </div>
        )}
      </div>
      
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="text-xs text-zinc-700 mb-2">验证参数</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input 
            placeholder="合约订单号 OrdId" 
            value={form.ordId} 
            onChange={(e) => onFormChange({ ordId: e.target.value })}
            className={submitted && !trimmedForm.ordId ? 'border-red-400' : ''} 
          />
          <Input 
            placeholder="交易币对/合约 InstId（如 BTC-USDT-SWAP）" 
            value={form.instId} 
            onChange={(e) => onFormChange({ instId: e.target.value })}
            className={submitted && !trimmedForm.instId ? 'border-red-400' : ''} 
          />
        </div>
        <div className="text-[11px] text-zinc-500 mt-1">
          需填写订单号与币对用于生成回显；生成回显后需"确认无误"才记为通过。
        </div>
      </div>

      {isVerified && last?.proof?.echo && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-2">
          <div className="font-medium">证明片段（脱敏）</div>
          <div>
            第一笔订单ID后4位 {last.proof.echo.firstOrderIdLast4} · {fmtTime(last.proof.echo.firstFillTime)} · 数量 {last.proof.echo.firstFillQty}
          </div>
          <div className="text-xs text-emerald-900/70">哈希：{last.proof.hash}</div>

          {last.order && (
            <div className="pt-2">
              <div className="font-medium mb-1">订单回显</div>
              <div className="text-xs text-emerald-900/90">
                订单号 {last.order.orderId} · 币对 {last.order.pair} · {last.order.side}/{last.order.type} · 状态 {last.order.status}<br/>
                数量 {last.order.executedQty} × 均价 {last.order.avgPrice} ≈ 成交额 {last.order.quoteAmount}<br/>
                时间 {fmtTime(last.order.orderTimeIso)}
              </div>
            </div>
          )}

          {last.checks && (
            <div className="pt-1">
              <div className="font-medium mb-1">一致性检查</div>
              <ul className="text-xs leading-6">
                <li>鉴权 {tick(last.checks.authOk)} · 能力 {tick(last.checks.capsOk)} · 找到订单 {tick(last.checks.orderFound)}</li>
                <li>订单号后4位匹配 {tick(last.checks.echoLast4Ok)} · 乘法闭合 {tick(last.checks.arithmeticOk)} · 币对匹配 {tick(last.checks.pairOk)}</li>
                <li>时间偏差 {last.checks.timeSkewMs} ms · 结论 {last.checks.verdict === 'pass' ? '通过' : '不通过'}</li>
              </ul>
            </div>
          )}

          {last.liquidation && (
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
          )}

          {pendingConfirm && (
            <div className="pt-2">
              <Button onClick={onConfirmEcho} kind="primary" className="w-full">
                ✅ 确认无误
              </Button>
              <div className="text-xs text-zinc-500 mt-1 text-center">核对回显信息后点击确认</div>
            </div>
          )}
        </div>
      )}

      {isFailed && last?.reasons && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="font-medium">失败原因</div>
          <ul className="text-xs mt-1 space-y-1">
            {last.reasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={tryVerify} kind="primary" disabled={verifying}>
          {verifying ? "验证中…" : "验证"}
        </Button>
        <Button onClick={onEdit} kind="ghost">编辑</Button>
        <Button onClick={onDelete} kind="danger">删除</Button>
      </div>
    </div>
  );
};

function Section({ title, data }: { title: string; data: any }) {
  if (data === undefined || data === null) return null;
  return (
    <details className="rounded-md border p-3" open>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-2 text-sm overflow-auto max-h-72">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

// 辅助函数
const bool = (value: boolean) => value ? '✓' : '✗';
const tick = (value: boolean) => value ? '✓' : '✗';
const fmtTime = (timeStr?: string) => {
  if (!timeStr) return '';
  return new Date(timeStr).toLocaleString('zh-CN');
};
