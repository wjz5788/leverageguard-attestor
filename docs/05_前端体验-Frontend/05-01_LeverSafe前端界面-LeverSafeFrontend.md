# LeverSafe 前端界面说明 (LeverSafe Frontend Overview)

本说明文档记录 `src/apps/leversafe_calculator/insurance_calc.html` 对应的前端实现，覆盖界面布局、交互逻辑与校验规则，便于在更大产品中复用或重构。

## 1. 文件位置 (File Location)

- 路径：`src/apps/leversafe_calculator/insurance_calc.html`
- 架构：纯静态 HTML + CSS + 原生 JavaScript，无外部依赖，适合快速演示或嵌入后台管理页。

## 2. 界面结构 (Layout & Components)

1. **输入区域**
   - 本金输入框 `#principal`（数字输入，默认 100，范围 50-500）
   - 杠杆输入框 `#leverage`（数字输入，默认 20，范围 1-200）
2. **行为按钮**
   - “计算保险”按钮 `#calculate`，点击或回车触发计算
3. **结果展示**
   - 结果卡 `#result`，展示保费、赔付比例、赔付金额三项
   - 错误提示 `#message`，在输入异常时提示用户

页面使用浅色卡片式布局，CSS 内联，兼容暗色模式。

## 3. 交互逻辑 (Interaction Flow)

1. 用户输入本金与杠杆
2. 触发 `runCalculation()`（按钮点击或回车）
3. 如果输入不合法（非数字或超范围），在 `#message` 显示提示，并隐藏结果卡
4. 调用 `calculateInsurance()` —— 内含保费与赔付计算公式
5. 将结果更新到 `#premium`、`#payout-ratio`、`#payout-amount`

## 4. 计算公式 (Formulas)

与 Python 后端保持一致：

```javascript
const basePremiumRatio = 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02;
const premiumRatio = Math.min(0.15, basePremiumRatio);
const premium = Math.max(premiumRatio, 0) * principal;

const basePayoutRatio = 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1;
const payoutRatio = Math.min(0.5, Math.max(0.1, basePayoutRatio));
const payout = payoutRatio * principal;
```

- 本金越高保费比例越高，但赔付比例会下降
- 杠杆越高保费比例与赔付比例均上升
- 保费比例封顶 15%，赔付比例范围 10%-50%

## 5. 输入约束 (Validation)

- 本金：50 ≤ principal ≤ 500
- 杠杆：1 ≤ leverage ≤ 200
- 非数字值会直接拒绝并提示
- 可结合浏览器原生校验（`min`/`max`/`step`）或在未来引入前端校验库

## 6. 扩展建议 (Enhancements)

1. **状态持久化**：记录历史计算或导出 CSV/JSON
2. **视觉优化**：切换主题、自适应移动端样式
3. **框架化重构**：迁移到 React/Vue/Svelte，便于组件化和状态管理
4. **数据联动**：接入真实订单或套餐列表，支持一键填充
5. **多语言支持**：通过 i18n 管理文案

## 7. 与后端的关系 (Backend Parity)

- 所有公式与返回值与 `leversafe_calculator.py` 保持一致，确保不同入口计算结果相同
- 后端可将该逻辑封装为 REST/GraphQL 接口，前端改为异步请求以实现持久化与多用户管理
