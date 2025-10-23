import React, { useState } from 'react';
import QuoteCalculator, { QuoteData } from '../components/QuoteCalculator';

const QuoteDemo: React.FC = () => {
  const [generatedQuotes, setGeneratedQuotes] = useState<QuoteData[]>([]);

  const handleQuoteGenerated = (quote: QuoteData) => {
    setGeneratedQuotes(prev => [quote, ...prev.slice(0, 4)]); // Keep last 5 quotes
  };

  const clearQuotes = () => {
    setGeneratedQuotes([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">报价计算器演示</h1>
          <p className="text-gray-600">体验我们的保险产品报价计算功能</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Calculator Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">计算工具</h2>
            <QuoteCalculator onQuoteGenerated={handleQuoteGenerated} />
          </div>

          {/* Recent Quotes Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">最近报价</h2>
              {generatedQuotes.length > 0 && (
                <button
                  onClick={clearQuotes}
                  className="text-sm text-red-600 hover:text-red-800 focus:outline-none"
                >
                  清空
                </button>
              )}
            </div>

            {generatedQuotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="mb-2">📊</div>
                <p>暂无报价记录</p>
                <p className="text-sm">使用左侧计算器生成报价</p>
              </div>
            ) : (
              <div className="space-y-4">
                {generatedQuotes.map((quote, index) => (
                  <div key={quote.id} className="border border-gray-200 rounded-md p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-gray-500">#{index + 1}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(quote.expiresAt).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-gray-600">本金</div>
                        <div className="font-medium">{quote.principal} USDT</div>
                      </div>
                      <div>
                        <div className="text-gray-600">杠杆</div>
                        <div className="font-medium">{quote.leverage}×</div>
                      </div>
                      <div>
                        <div className="text-gray-600">保费</div>
                        <div className="font-medium text-green-600">{quote.premium.toFixed(2)} USDT</div>
                      </div>
                      <div>
                        <div className="text-gray-600">赔付</div>
                        <div className="font-medium text-blue-600">{quote.payout.toFixed(2)} USDT</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">使用说明</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-800 mb-2">计算规则</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 保费 = 本金 × 杠杆 × 2%</li>
                <li>• 赔付额 = 本金 × 杠杆 × 85%</li>
                <li>• 本金范围: 50-500 USDT</li>
                <li>• 杠杆范围: 1-100 倍</li>
                <li>• 报价有效期: 5 分钟</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-800 mb-2">使用方法</h3>
              <ol className="text-sm text-gray-600 space-y-1">
                <li>1. 输入本金金额 (50-500 USDT)</li>
                <li>2. 选择杠杆倍数 (1-100 倍)</li>
                <li>3. 点击"获取报价"按钮</li>
                <li>4. 查看计算结果和详细信息</li>
                <li>5. 报价将在5分钟后过期</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Integration Example */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">集成示例</h2>
          <div className="bg-gray-50 rounded-md p-4">
            <pre className="text-xs text-gray-800 overflow-x-auto">
{`// 基本使用
<QuoteCalculator />

// 监听报价生成事件
<QuoteCalculator onQuoteGenerated={(quote) => {
  console.log('Generated quote:', quote);
  // 处理生成的报价数据
}} />

// 自定义样式
<QuoteCalculator className="my-custom-class" />

// 在组件中使用报价数据
const MyComponent = () => {
  const [quotes, setQuotes] = useState([]);
  
  const handleQuoteGenerated = (quote) => {
    setQuotes(prev => [...prev, quote]);
  };
  
  return <QuoteCalculator onQuoteGenerated={handleQuoteGenerated} />;
};`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteDemo;