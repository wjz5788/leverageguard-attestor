import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../contexts/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { Dictionary } from '../types';
import { buildLink } from '../utils';

interface CreateLinkProps {
  t: Dictionary;
}

export const CreateLink: React.FC<CreateLinkProps> = ({ t }) => {
  const navigate = useNavigate();
  const { push } = useToast();
  const { address } = useWallet();
  
  const [formData, setFormData] = useState({
    product: '',
    symbol: '',
    amount: '',
    duration: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateLink = () => {
    if (!address) {
      push({ title: t.walletRequired, type: 'error' });
      return;
    }

    if (!formData.product || !formData.symbol || !formData.amount || !formData.duration) {
      push({ title: t.fillAllFields, type: 'error' });
      return;
    }

    const url = buildLink(
      formData.product,
      formData.symbol,
      parseFloat(formData.amount),
      parseInt(formData.duration)
    );

    // 复制到剪贴板
    navigator.clipboard.writeText(url).then(() => {
      push({ title: t.linkCreated });
      navigate('/links');
    }).catch(() => {
      push({ title: t.copyFailed, type: 'error' });
    });
  };

  const breadcrumbItems = [
    { label: t.home, to: '/' },
    { label: t.createLink }
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb items={breadcrumbItems} />
      
      <div className="mt-6">
        <h1 className="text-3xl font-bold">{t.createLink}</h1>
        <p className="mt-2 text-stone-600">{t.createLinkDesc}</p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* 表单区域 */}
        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                {t.product}
              </label>
              <Select
                value={formData.product}
                onChange={(e) => handleInputChange('product', e.target.value)}
              >
                <option value="">选择产品</option>
                <option value="24h">24h 当日爆仓保</option>
                <option value="7d">7天爆仓保</option>
                <option value="30d">30天爆仓保</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                {t.symbol}
              </label>
              <Select
                value={formData.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value)}
              >
                <option value="">选择交易对</option>
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="SOLUSDT">SOL/USDT</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                {t.amount}
              </label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="输入金额"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                {t.duration}
              </label>
              <Input
                type="number"
                value={formData.duration}
                onChange={(e) => handleInputChange('duration', e.target.value)}
                placeholder="输入时长（小时）"
              />
            </div>

            <Button 
              onClick={handleCreateLink}
              disabled={!address}
              className="w-full"
            >
              {address ? t.createLink : t.connectWalletFirst}
            </Button>
          </div>
        </Card>

        {/* 预览区域 */}
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">支付链接预览</h3>
            
            {formData.product && formData.symbol && formData.amount && formData.duration ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600">产品:</span>
                  <span className="font-medium">{formData.product}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600">交易对:</span>
                  <span className="font-medium">{formData.symbol}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600">金额:</span>
                  <span className="font-medium">{formData.amount} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-600">时长:</span>
                  <span className="font-medium">{formData.duration} 小时</span>
                </div>
                
                <div className="mt-4 p-3 bg-stone-50 rounded text-xs font-mono break-all">
                  {buildLink(
                    formData.product,
                    formData.symbol,
                    parseFloat(formData.amount),
                    parseInt(formData.duration)
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-stone-500 py-8">
                <div className="text-sm">填写表单查看预览</div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};