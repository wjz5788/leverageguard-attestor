# USDC 金额规则文档

## 概述
本文档定义了 LiqPass 系统中 USDC 金额的处理规则，包括链上和链下的验证逻辑。

## 金额单位
- **USDC_DECIMALS**: 6（USDC 代币的小数位数）
- **micro-USDC**: 1 USDC = 1,000,000 micro-USDC

## 链上规则（合约验证）

### isValidAmount 验证
```solidity
function isValidAmount(uint256 amount) internal pure returns (bool) {
    return amount > 0 && amount % (10 ** USDC_DECIMALS) == 0;
}
```

**规则说明：**
- 金额必须大于 0
- 金额必须能被 1e6 整除（步长 1e-6 USDC）
- 支持的最小精度：1 micro-USDC

### 示例
- ✅ 10000（0.01 USDC）- 有效
- ✅ 100000（0.1 USDC）- 有效  
- ✅ 1000000（1 USDC）- 有效
- ❌ 10001（0.010001 USDC）- 无效（不能被 1e6 整除）
- ❌ 0 - 无效（金额必须大于 0）

## 链下规则（业务验证）

### 金额范围限制
- **最小金额**：0.01 USDC（10000 micro-USDC）
- **最大金额**：100 USDC（100000000 micro-USDC）

### 转换规则
前端使用小数格式，后端使用 micro-USDC 整数格式：
```javascript
// 前端 → 后端
premiumUSDC_6d = Math.round(premiumUSDC * 1000000).toString()

// 后端 → 前端  
premiumUSDC = premiumUSDC_6d / 1000000
```

### 示例转换
- 0.01 USDC → "10000"
- 0.1 USDC → "100000"
- 1 USDC → "1000000"
- 100 USDC → "100000000"

## 错误处理

### 金额格式错误
```json
{
  "error": "ERR_SCHEMA_FIELD_MISMATCH",
  "message": "expected: premiumUSDC_6d (micro-USDC, integer)"
}
```

### 金额范围错误
```json
{
  "error": "ERR_AMOUNT_OUT_OF_RANGE", 
  "message": "金额超出允许范围：最小 0.01 USDC，最大 100 USDC"
}
```

### 金额精度错误
```json
{
  "error": "ERR_AMOUNT_PRECISION",
  "message": "金额精度错误：必须为 1e-6 USDC 的整数倍"
}
```

## 相关文件
- `contracts/CheckoutUSDC.sol` - 主合约验证逻辑
- `liqpass-verify/contracts/CheckoutUSDC.sol` - 验证合约逻辑
- `verify-only/contracts/CheckoutUSDC.sol` - 纯验证合约逻辑
- `TESTING_STEPS.md` - 测试步骤文档
- `docs/03-API文档/01-接口契约.md` - API 接口文档

## 变更历史
- **2024-01-XX**: 将步长从 0.1 USDC 调整为 1e-6 USDC
- **2024-01-XX**: 添加链下金额范围限制（0.01-100 USDC）