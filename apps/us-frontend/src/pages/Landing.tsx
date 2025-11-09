import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Dictionary } from '../types';
import { buildLink } from '../utils';

interface LandingProps {
  t: Dictionary;
}

// 支付链接预览组件
function PaymentLinkPreview({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-stone-600">{new URL(url).pathname}</div>
        <Badge>Link</Badge>
      </div>
      
      <div className="mt-4 grid gap-6">
        <Card className="p-4">
          <div className="text-sm text-stone-500">SKU</div>
          <div className="mt-1 text-base font-semibold">24h 当日爆仓保</div>
          <div className="mt-1 text-sm text-stone-600">BTCUSDT · 固定赔付</div>
          <div className="mt-3 text-2xl font-extrabold">20 USDC</div>
        </Card>
        
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
          <div className="break-all rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-xs text-stone-700">
            {url}
          </div>
          <Button onClick={onCopy}>复制</Button>
        </div>
      </div>
    </Card>
  );
}

export const Landing: React.FC<LandingProps> = ({ t }) => {
  const { message, setMessage, address, onBase } = useWallet();
  const { push } = useToast();
  const [linkUrl, setLinkUrl] = useState("");

  const createPaymentLink = () => {
    const url = buildLink("24h", "BTCUSDT", 20, 24);
    setLinkUrl(url);
    setMessage(t.linkCreated);
    push({ title: t.linkCreated });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      push({ title: t.copied });
    } catch {
      setMessage(linkUrl);
    }
  };

  return (
    <section className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
      <div className="grid items-center gap-14 md:grid-cols-2">
        {/* 左侧内容 */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
            {t.hero.badge}
          </div>
          
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t.hero.title}
          </h1>
          
          <p className="mt-4 max-w-xl text-stone-600">
            {t.hero.subtitle}
          </p>
          
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={createPaymentLink}>
              生成支付链接
            </Button>
            
            <Link 
              to="/links/create" 
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-50 transition-colors"
            >
              去高级创建
            </Link>
          </div>
          
          {message && (
            <Card className="mt-4">
              <div className="text-sm text-stone-800">{message}</div>
            </Card>
          )}
          
          <div className="mt-4 text-xs text-stone-500">
            {address ? (
              <span>已连接 · Base: {onBase ? "是" : "否"}</span>
            ) : (
              <span>未连接</span>
            )}
          </div>
        </div>

        {/* 右侧预览 */}
        {linkUrl ? (
          <PaymentLinkPreview url={linkUrl} onCopy={copyToClipboard} />
        ) : (
          <Card>
            <div className="text-center text-stone-500 py-12">
              <div className="text-lg font-medium mb-2">生成支付链接预览</div>
              <div className="text-sm">点击左侧按钮开始创建</div>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
};