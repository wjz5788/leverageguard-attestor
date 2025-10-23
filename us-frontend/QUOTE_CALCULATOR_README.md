# 报价计算器模块

## 功能特性

报价计算器模块提供了一个独立的、可复用的保险报价计算组件，支持以下功能：

- **实时报价计算**: 根据输入的本金和杠杆倍数计算保费和赔付额
- **输入验证**: 自动验证输入值的有效性，确保在合理范围内
- **响应式设计**: 适配不同屏幕尺寸，提供良好的用户体验
- **报价历史**: 记录最近生成的报价，便于对比和参考
- **有效期管理**: 报价具有5分钟有效期，过期后需要重新计算

## 计算规则

### 核心公式
- **保费计算**: `保费 = 本金 × 杠杆 × 2%`
- **赔付额计算**: `赔付额 = 本金 × 杠杆 × 85%`

### 参数限制
- **本金范围**: 50-500 USDT
- **杠杆倍数**: 1-100 倍
- **报价有效期**: 5 分钟

## 使用方法

### 基本使用
```tsx
import QuoteCalculator from './components/QuoteCalculator';

function App() {
  return <QuoteCalculator />;
}
```

### 监听报价生成事件
```tsx
function App() {
  const handleQuoteGenerated = (quote: QuoteData) => {
    console.log('Generated quote:', quote);
    // 处理报价数据
  };

  return <QuoteCalculator onQuoteGenerated={handleQuoteGenerated} />;
}
```

### 自定义样式
```tsx
<QuoteCalculator className="my-custom-class" />
```

## 数据结构

### QuoteData 接口
```tsx
interface QuoteData {
  id: string;              // 报价唯一标识
  principal: number;       // 本金 (USDT)
  leverage: number;        // 杠杆倍数
  premium: number;       // 保费 (USDT)
  payout: number;        // 赔付额 (USDT)
  premiumRate: number;   // 保费率 (%)
  payoutRate: number;    // 赔付率 (%)
  expiresAt: Date;       // 过期时间
}
```

### QuoteCalculatorProps 接口
```tsx
interface QuoteCalculatorProps {
  onQuoteGenerated?: (quote: QuoteData) => void;  // 报价生成回调
  className?: string;                            // 自定义样式类
}
```

## 演示页面

访问 `/quote-demo` 路径可以查看完整的演示页面，包含：

- 交互式报价计算器
- 最近报价历史记录
- 使用说明和计算规则说明
- 集成示例代码

## 文件结构

```
src/
├── components/
│   └── QuoteCalculator.tsx    # 报价计算器组件
├── pages/
│   └── QuoteDemo.tsx        # 演示页面
└── App.tsx                   # 路由配置
```

## 注意事项

1. **输入验证**: 组件会自动验证输入值，超出范围时会显示错误提示
2. **异步处理**: 报价生成过程包含模拟的异步延迟，提供加载状态
3. **有效期管理**: 报价数据包含过期时间，需要在有效期内使用
4. **状态管理**: 组件内部管理状态，也可以通过回调函数获取数据
5. **样式定制**: 支持通过 className 属性添加自定义样式

## 更新日志

- **v1.0.0**: 初始版本，包含基本计算功能和演示页面