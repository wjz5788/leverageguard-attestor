# 金额字段标准化测试步骤

## 测试目标
验证系统正确处理 `premiumUSDC` 和 `premiumUSDC_6d` 字段的转换和验证，以及金额范围限制（最小 0.01 USDC，最大 100 USDC）。

## 前端测试步骤

### 1. 验证 premiumUSDC 到 premiumUSDC_6d 的转换
1. 打开下单页面
2. 输入不同的 premiumUSDC 值：
   - 0.01 USDC
   - 0.1 USDC
   - 1 USDC
3. 提交订单
4. 检查网络请求，确认请求体中包含正确的 premiumUSDC_6d 值：
   - 0.01 USDC → premiumUSDC_6d = "10000"
   - 0.1 USDC → premiumUSDC_6d = "100000"
   - 1 USDC → premiumUSDC_6d = "1000000"

### 2. 验证错误处理
1. 尝试发送错误格式的 premiumUSDC 值（如字符串或负数）
2. 尝试发送超出范围的金额（小于 0.01 USDC 或大于 100 USDC）
3. 确认系统显示适当的错误提示："金额单位不匹配：应为6位整数（*_6d）"或"金额超出允许范围：最小 0.01 USDC，最大 100 USDC"

### 3. 验证深层嵌套对象的处理
1. 如果有批量下单功能，尝试发送包含多个订单的请求
2. 每个订单都包含 premiumUSDC 字段
3. 检查网络请求，确认所有 premiumUSDC 字段都被正确转换为 premiumUSDC_6d

## 后端测试步骤

### 1. 验证正确的 premiumUSDC_6d 请求
1. 使用 API 工具（如 Postman）发送包含 premiumUSDC_6d 字段的请求
2. 确认请求成功处理并返回 201 状态码
3. 检查数据库中存储的值是否正确

### 2. 验证错误的 premiumUSDC 请求
1. 发送包含 premiumUSDC 字段（而不是 premiumUSDC_6d）的请求
2. 确认返回 400 错误和正确的错误消息：
   ```json
   {
     "error": "ERR_SCHEMA_FIELD_MISMATCH",
     "message": "expected: premiumUSDC_6d (micro-USDC, integer)"
   }
   ```

### 3. 验证混合字段请求
1. 发送同时包含 premiumUSDC 和 premiumUSDC_6d 字段的请求
2. 确认系统拒绝请求并返回适当的错误消息

## 自动化测试验证

### 1. 运行单元测试
```bash
npm run test:unit -- tests/unit/services/api.test.ts
```

### 2. 运行前端集成测试
```bash
npm run test:e2e -- tests/e2e/amount-decimals.spec.ts
```

## 验收标准

### 成功标准
- [ ] 0.01/0.1/1 USDC 下单均返回 201 状态码
- [ ] 数据库中存储的值为正确的 premiumUSDC_6d 整数格式
- [ ] 前端显示的金额 = 数据库值 / 1e6
- [ ] 发错字段或直接发小数时返回 400 错误
- [ ] 超出范围金额（<0.01 USDC 或 >100 USDC）返回 400 错误
- [ ] Toast 错误提示显示正确的文案："金额单位不匹配：应为6位整数（*_6d）"或"金额超出允许范围：最小 0.01 USDC，最大 100 USDC"
- [ ] 所有自动化测试通过

### 兼容性测试
- [ ] 在7天兼容期内，旧的 premiumUSDC 字段仍能正常工作
- [ ] 前端自动将 premiumUSDC 转换为 premiumUSDC_6d
- [ ] 新的 premiumUSDC_6d 字段直接通过验证