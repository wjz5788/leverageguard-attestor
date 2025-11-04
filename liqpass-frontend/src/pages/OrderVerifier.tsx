import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

interface VerifyRequest {
  ordId: string;
  instId: string;
  live: boolean;
  fresh: boolean;
  noCache: boolean;
  keyMode: 'inline';
  apiKey: string;
  secretKey: string;
  passphrase: string;
  uid?: string;
}

interface VerifyResponse {
  meta: {
    exchange: string;
    instId: string;
    ordId: string;
    verifiedAt: string;
    live: boolean;
    fresh: boolean;
    requestId: string;
    version: string;
  };
  normalized: {
    order: {
      side: string;
      px: string;
      sz: string;
      state: string;
      avgFillPx: string;
      accFillSz: string;
      fee: string;
      ts: string;
    };
    position: {
      lever: string;
      mode: string;
      liqPx: string;
      adl: boolean;
      liquidated: boolean;
      liquidatedAt: string;
      reason: string;
    };
  };
  evidence: {
    leaves: Array<{ path: string; hash: string }>;
    root: string;
    rootAlgo: string;
    bundleHash: string;
    evidenceId: string;
    parentRoot: string | null;
  };
  perf: {
    okxRttMs: number;
    totalMs: number;
    cache: boolean;
    rateLimit: { remaining: number; resetSec: number };
  };
  error: null | { code: string; msg: string; hint: string };
  evidenceId?: string;
}

const OrderVerifier: React.FC = () => {
  const [formData, setFormData] = useState<VerifyRequest>({
    ordId: '',
    instId: 'BTC-USDT-SWAP',
    live: true,
    fresh: true,
    noCache: true,
    keyMode: 'inline',
    apiKey: '',
    secretKey: '',
    passphrase: '',
    uid: ''
  });
  
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleInputChange = (field: keyof VerifyRequest, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/v1/verify/okx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.msg || `HTTP error! status: ${response.status}`);
      }

      const data: VerifyResponse = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || '验证过程中发生错误');
    } finally {
      setLoading(false);
    }
  };

  const getLiquidationStatus = () => {
    if (!result) return null;
    
    if (result.error) {
      return { status: 'error', message: result.error.msg };
    }
    
    const liquidated = result.normalized?.position?.liquidated;
    const reason = result.normalized?.position?.reason;
    
    if (liquidated) {
      return { 
        status: 'liquidated', 
        message: `订单已被强平 (${reason || 'forced-liquidation'})` 
      };
    } else {
      return { 
        status: 'safe', 
        message: '订单状态正常，未被强平' 
      };
    }
  };

  const liquidationStatus = getLiquidationStatus();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">订单验证器</h1>
          <p className="text-muted-foreground">
            验证 OKX 订单是否被强平，生成可审计的证据包
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>验证参数</CardTitle>
            <CardDescription>
              输入订单信息和 API 密钥进行验证
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ordId">订单ID (ordId)</Label>
                  <Input
                    id="ordId"
                    value={formData.ordId}
                    onChange={(e) => handleInputChange('ordId', e.target.value)}
                    placeholder="例如: 2940071038556348417"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="instId">交易对 (instId)</Label>
                  <Input
                    id="instId"
                    value={formData.instId}
                    onChange={(e) => handleInputChange('instId', e.target.value)}
                    placeholder="例如: BTC-USDT-SWAP"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.live}
                    onCheckedChange={(checked) => handleInputChange('live', checked)}
                  />
                  <Label htmlFor="live">实时模式</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.fresh}
                    onCheckedChange={(checked) => handleInputChange('fresh', checked)}
                  />
                  <Label htmlFor="fresh">强制刷新</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.noCache}
                    onCheckedChange={(checked) => handleInputChange('noCache', checked)}
                  />
                  <Label htmlFor="noCache">绕过缓存</Label>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">API 密钥信息</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={formData.apiKey}
                      onChange={(e) => handleInputChange('apiKey', e.target.value)}
                      placeholder="输入您的 API Key"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      type="password"
                      value={formData.secretKey}
                      onChange={(e) => handleInputChange('secretKey', e.target.value)}
                      placeholder="输入您的 Secret Key"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="passphrase">Passphrase</Label>
                    <Input
                      id="passphrase"
                      type="password"
                      value={formData.passphrase}
                      onChange={(e) => handleInputChange('passphrase', e.target.value)}
                      placeholder="输入您的 Passphrase"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="uid">UID (可选)</Label>
                    <Input
                      id="uid"
                      value={formData.uid}
                      onChange={(e) => handleInputChange('uid', e.target.value)}
                      placeholder="输入您的 UID"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    验证中...
                  </>
                ) : (
                  '开始验证'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                验证结果
                {liquidationStatus && (
                  <Badge 
                    variant={liquidationStatus.status === 'liquidated' ? 'destructive' : 
                             liquidationStatus.status === 'safe' ? 'default' : 'secondary'}
                  >
                    {liquidationStatus.status === 'liquidated' ? '已强平' : 
                     liquidationStatus.status === 'safe' ? '正常' : '错误'}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                订单验证完成，证据包已生成
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {liquidationStatus && (
                <div className="flex items-center gap-2">
                  {liquidationStatus.status === 'liquidated' ? (
                    <XCircle className="h-5 w-5 text-red-500" />
                  ) : liquidationStatus.status === 'safe' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : null}
                  <span className="font-medium">{liquidationStatus.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">订单信息</h4>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">交易对:</span> {result.meta.instId}</div>
                    <div><span className="text-muted-foreground">订单ID:</span> {result.meta.ordId}</div>
                    <div><span className="text-muted-foreground">验证时间:</span> {new Date(result.meta.verifiedAt).toLocaleString()}</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">性能指标</h4>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">总耗时:</span> {result.perf.totalMs}ms</div>
                    <div><span className="text-muted-foreground">OKX API:</span> {result.perf.okxRttMs}ms</div>
                    <div><span className="text-muted-foreground">请求ID:</span> {result.meta.requestId}</div>
                  </div>
                </div>
              </div>

              {result.evidence && (
                <div>
                  <h4 className="font-semibold mb-2">证据信息</h4>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">证据ID:</span> {result.evidence.evidenceId}</div>
                    <div><span className="text-muted-foreground">根哈希:</span> 
                      <code className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">
                        {result.evidence.root}
                      </code>
                    </div>
                    <div><span className="text-muted-foreground">算法:</span> {result.evidence.rootAlgo}</div>
                  </div>
                </div>
              )}

              {result.normalized?.position && (
                <div>
                  <h4 className="font-semibold mb-2">持仓详情</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-muted-foreground">杠杆:</span> {result.normalized.position.lever}x</div>
                    <div><span className="text-muted-foreground">模式:</span> {result.normalized.position.mode}</div>
                    <div><span className="text-muted-foreground">强平价格:</span> {result.normalized.position.liqPx}</div>
                    <div><span className="text-muted-foreground">ADL:</span> {result.normalized.position.adl ? '是' : '否'}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  查看完整证据
                </Button>
                <Button variant="outline" size="sm">
                  下载证据包
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default OrderVerifier;