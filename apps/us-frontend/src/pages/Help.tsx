import React from 'react';

interface HelpProps {
  t: any;
}

export const Help: React.FC<HelpProps> = ({ t }) => {
  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#3F2E20]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">帮助中心</h1>
        
        <div className="grid gap-6">
          <div className="rounded-2xl border bg-white/70 p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">常见问题</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">什么是 LiqPass？</h3>
                <p className="text-stone-600">LiqPass 是一个基于区块链的支付保护平台，提供支付链接创建、风险控制和赔付管理等功能。</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">如何创建支付链接？</h3>
                <p className="text-stone-600">点击导航栏中的"产品"，然后选择"创建支付链接"，填写相关信息即可生成支付链接。</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">如何查看透明度报告？</h3>
                <p className="text-stone-600">点击导航栏中的"透明度"可以查看平台的运营数据、赔付统计和审计信息。</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-2xl border bg-white/70 p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">联系我们</h2>
            <div className="space-y-2 text-stone-600">
              <p>邮箱: support@liqpass.com</p>
              <p>Discord: LiqPass#1234</p>
              <p>Telegram: @LiqPassSupport</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};