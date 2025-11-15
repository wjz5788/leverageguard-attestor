import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { getExplorerTxUrl } from "../lib/explorer";
import { authFetch } from '../lib/authFetch';
import { getAuthToken, loginWithWallet } from '../lib/auth';

interface ClaimsPageProps {
  t: (key: string) => string;
}

interface ClaimRecord {
  id: string;
  orderId: string;
  payout: { amount: number; currency: string };
  status: 'in_review' | 'approved' | 'paid' | 'rejected' | 'onchain_failed';
  txHash?: string;
  createdAt: string;
  evidence?: {
    type: string;
    time: string;
    pair: string;
  };
}

// 本地存储操作
const loadClaims = (): ClaimRecord[] => {
  try { 
    return JSON.parse(localStorage.getItem('liqpass:claims') || '[]'); 
  } catch { 
    return []; 
  }
};

const saveClaims = (rows: ClaimRecord[]) => {
  localStorage.setItem('liqpass:claims', JSON.stringify(rows));
};

async function apiClaimsPrepare(orderId: string): Promise<{ claimToken: string; expiresAt?: string }> {
  const res = await authFetch('/api/v1/claims/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return { claimToken: data.claimToken, expiresAt: data.expiresAt };
}

async function apiClaimsVerify(orderId: string, orderRef: string, claimToken: string) {
  const res = await authFetch('/api/v1/claims/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, orderRef, claimToken }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data;
}

async function walletSendClaimPayout(): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random()*16).toString(16)).join('');
}

export const ClaimsPage: React.FC<ClaimsPageProps> = ({ t }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { address, connectWallet } = useWallet();
  const isNewClaim = location.pathname.includes('/new');
  const queryParams = new URLSearchParams(location.search);
  const orderId = (queryParams.get('orderId') || '').trim();

  if (!address) {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">请先连接钱包</h2>
            <p className="text-gray-600 mb-6">连接钱包以查看和管理您的赔付申请</p>
            <button 
              onClick={connectWallet}
              className="inline-flex items-center px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              连接钱包
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">赔付管理</h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/claims')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                !isNewClaim 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              赔付列表
            </button>
            <button
              onClick={() => navigate('/claims/new')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isNewClaim 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              发起赔付
            </button>
          </div>
        </div>

        {!isNewClaim ? (
          <ClaimsList />
        ) : (
          <NewClaimView orderId={orderId} />
        )}
      </div>
    </div>
  );
};

// 赔付列表组件
function ClaimsList() {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ordRefInputs, setOrdRefInputs] = useState<Record<string, string>>({});
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});
  const [verifyMap, setVerifyMap] = useState<Record<string, any>>({});
  
  useEffect(() => {
    setClaims(loadClaims());
  }, []);

  const formatTime = (timeStr: string) => {
    try {
      return new Date(timeStr).toLocaleString();
    } catch {
      return timeStr;
    }
  };

  const getStatusBadge = (status: ClaimRecord['status']) => {
    const config = {
      in_review: { label: '审核中', className: 'bg-yellow-100 text-yellow-800' },
      approved: { label: '已批准', className: 'bg-blue-100 text-blue-800' },
      paid: { label: '已赔付', className: 'bg-green-100 text-green-800' },
      rejected: { label: '已拒绝', className: 'bg-red-100 text-red-800' },
      onchain_failed: { label: '链上失败', className: 'bg-red-200 text-red-900' },
    };
    const statusConfig = config[status];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.className}`}>
        {statusConfig.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">赔付申请列表</h2>
          <span className="text-sm text-gray-500">共 {claims.length} 条记录</span>
        </div>

        {claims.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无赔付申请</h3>
            <p className="text-gray-500 mb-4">您还没有任何赔付申请记录</p>
            <Link 
              to="/account/claims/new"
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              发起新的赔付申请
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {claims.map((claim) => {
              const isExpanded = expandedId === claim.id;
              const ordInput = ordRefInputs[claim.id] || '';
              const verifying = verifyingMap[claim.id] || false;
              const vres = verifyMap[claim.id];
              const onToggle = () => setExpandedId(isExpanded ? null : claim.id);
              const onInput = (v: string) => setOrdRefInputs(prev => ({ ...prev, [claim.id]: v }));
              const onVerify = async () => {
                if (!ordInput.trim()) return;
                setVerifyingMap(prev => ({ ...prev, [claim.id]: true }));
                try {
                  const { claimToken } = await apiClaimsPrepare(claim.orderId);
                  const result = await apiClaimsVerify(claim.orderId, ordInput.trim(), claimToken);
                  setVerifyMap(prev => ({ ...prev, [claim.id]: result }));
                  const next = loadClaims().map(r => r.id === claim.id ? { ...r, status: result.eligible ? ('approved' as const) : ('rejected' as const), payout: { amount: result.payout || r.payout.amount, currency: result.currency || r.payout.currency }, evidence: result.evidence } : r);
                  saveClaims(next);
                  setClaims(next);
                } finally {
                  setVerifyingMap(prev => ({ ...prev, [claim.id]: false }));
                }
              };
              const onPayout = async () => {
                if (!vres || !vres.eligible) return;
                const txHash = await walletSendClaimPayout();
                const next = loadClaims().map(r => r.id === claim.id ? { ...r, status: 'paid' as const, txHash } : r);
                saveClaims(next);
                setClaims(next);
              };
              const url = getExplorerTxUrl({ chainId: null, txHash: String(claim.txHash || '').trim() });
              return (
                <div key={claim.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{claim.payout.amount} {claim.payout.currency}</div>
                        <div className="text-sm text-gray-500">ClaimID: {claim.id}</div>
                      </div>
                    </div>
                    {getStatusBadge(claim.status)}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div><span className="text-gray-500">订单ID:</span><span className="ml-2 font-medium">{claim.orderId}</span></div>
                    <div><span className="text-gray-500">申请时间:</span><span className="ml-2 font-medium">{formatTime(claim.createdAt)}</span></div>
                    <div><span className="text-gray-500">证据类型:</span><span className="ml-2 font-medium">{claim.evidence?.type || '-'}</span></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={onToggle} className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50">{isExpanded ? '收起' : '验证订单'}</button>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50">查看链上</a>
                    ) : null}
                  </div>
                  {isExpanded && (
                    <div className="mt-3 p-3 border border-gray-100 rounded-lg">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600">交易所订单号</label>
                          <input value={ordInput} onChange={e => onInput(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="请输入交易所订单号" />
                        </div>
                        <div className="flex items-end">
                          <button onClick={onVerify} disabled={verifying} className="w-full px-3 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">{verifying ? '验证中...' : '验证'}</button>
                        </div>
                      </div>
                      {vres && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">赔付金额：{vres.payout} {vres.currency}</div>
                            <span className={`px-2 py-1 rounded-full text-xs ${vres.eligible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{vres.eligible ? '可赔付' : '不可赔'}</span>
                          </div>
                          {vres.evidence && (
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm bg-gray-50 rounded p-2">
                              <div className="flex justify-between"><span className="text-gray-600">类型</span><span className="font-medium">{vres.evidence.type}</span></div>
                              <div className="flex justify-between"><span className="text-gray-600">交易对</span><span className="font-medium">{vres.evidence.pair}</span></div>
                            </div>
                          )}
                          {vres.eligible && (
                            <div className="mt-3">
                              <button onClick={onPayout} className="px-3 py-2 rounded-lg bg-red-600 text-white">赔付（你付gas）</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 发起赔付组件
function NewClaimView({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const [orderRef, setOrderRef] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [paying, setPaying] = useState(false);

  // 模拟订单数据
  const orderData = {
    orderId: orderId,
    principal: 250,
    leverage: 40,
    premiumPaid: 3.25,
    payoutMax: 75,
    coverage: { 
      start: '2025-10-26T00:00:00Z', 
      end: '2025-10-27T00:00:00Z' 
    },
    exchangeAccountId: 'ex_acc_7af2',
  };

  React.useEffect(() => {
  }, [orderData.orderId]);

  const handleVerify = async () => {
    if (!orderRef.trim()) {
      alert('请输入交易所订单号');
      return;
    }

    setVerifying(true);
    try {
      const { claimToken } = await apiClaimsPrepare(orderData.orderId);
      const result = await apiClaimsVerify(orderData.orderId, orderRef, claimToken);
      setVerifyResult(result);
    } catch (error) {
      alert('验证失败，请重试');
    } finally {
      setVerifying(false);
    }
  };

  const handlePayout = async () => {
    if (!verifyResult || !verifyResult.eligible) return;
    
    setPaying(true);
    try {
      const txHash = await walletSendClaimPayout();
      
      // 保存赔付记录到本地存储
      const newClaim: ClaimRecord = {
        id: verifyResult.claimId,
        orderId: orderData.orderId,
        payout: { amount: verifyResult.payout, currency: verifyResult.currency },
        status: 'paid',
        txHash,
        createdAt: new Date().toISOString(),
        evidence: verifyResult.evidence,
      };
      
      const claims = loadClaims();
      claims.push(newClaim);
      saveClaims(claims);
      
      // 同时创建理赔记录到后端
      try {
        await authFetch('/api/v1/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            orderId: orderData.orderId,
            claimType: 'liquidation',
            amountUSDC: verifyResult.payout,
            description: `用户发起赔付申请，交易所订单号: ${orderRef}`,
            evidenceFiles: verifyResult.evidence ? [verifyResult.evidence] : []
          }),
        });
      } catch (backendError) {
        console.error('创建后端理赔记录失败:', backendError);
        // 不阻塞前端流程，继续执行
      }
      
      // 跳转回列表
      navigate('/claims');
    } catch (error) {
      alert('链上赔付失败：' + (error as Error).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold mb-4">发起赔付申请</h2>
        
        {/* 订单摘要 */}
        <div className="mb-6">
          <h3 className="text-md font-medium mb-3">订单摘要（只读）</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-gray-600">订单ID:</span>
              <span className="font-medium">{orderData.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">账户:</span>
              <span className="font-medium">{orderData.exchangeAccountId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">本金:</span>
              <span className="font-medium">{orderData.principal} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">杠杆:</span>
              <span className="font-medium">{orderData.leverage}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">已付保费:</span>
              <span className="font-medium">{orderData.premiumPaid} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">赔付上限:</span>
              <span className="font-medium">{orderData.payoutMax} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">保障开始:</span>
              <span className="font-medium">{orderData.coverage.start}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">保障结束:</span>
              <span className="font-medium">{orderData.coverage.end}</span>
            </div>
          </div>
        </div>

        {/* 交易所订单号输入 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            交易所订单号 orderRef
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            placeholder="请输入交易所订单号"
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? "验证中..." : "验证"}
            </button>
          </div>
        </div>

        {/* 验证结果 */}
        {verifyResult && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-medium">核验结果</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                verifyResult.eligible 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {verifyResult.eligible ? "可赔付" : "不可赔"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <span className="text-gray-600 text-sm">赔付金额:</span>
                <div className="font-medium">{verifyResult.payout} {verifyResult.currency}</div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Claim ID:</span>
                <div className="font-medium">{verifyResult.claimId}</div>
              </div>
              <div>
                <span className="text-gray-600 text-sm">过期时间:</span>
                <div className="font-medium">{verifyResult.expiresAt ? new Date(verifyResult.expiresAt).toLocaleString() : '-'}</div>
              </div>
            </div>

            {verifyResult.evidence && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">证明片段 Evidence</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">类型:</span>
                    <span className="font-medium">{verifyResult.evidence.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">时间:</span>
                    <span className="font-medium">{new Date(verifyResult.evidence.time).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">交易对:</span>
                    <span className="font-medium">{verifyResult.evidence.pair}</span>
                  </div>
                </div>
              </div>
            )}

            {verifyResult.eligible && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <input 
                    type="checkbox" 
                    id="confirm" 
                    checked={confirm} 
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <label htmlFor="confirm" className="text-sm text-gray-700">
                    我已确认核验结果与赔付金额
                  </label>
                </div>
                <button
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={!verifyResult.eligible || !confirm || paying}
                  onClick={handlePayout}
                >
                  {paying ? "链上赔付中..." : "赔付（你付gas）"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 帮助信息 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">操作说明</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 从订单卡点击"发起赔付"进入此页面</li>
            <li>• 输入交易所订单号进行验证</li>
            <li>• 验证通过后可发起链上赔付申请</li>
            <li>• 用户支付gas费用，合约将USDC赔付到用户钱包</li>
            <li>• 成功后可在赔付列表查看交易详情</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
