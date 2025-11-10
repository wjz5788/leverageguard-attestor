# 合约金额规则变更记录

## 变更概述
将合约中的金额验证规则从步长 0.1 USDC 调整为步长 1e-6 USDC（1 micro-USDC），以支持更精细的金额粒度。

## 变更详情

### 修改文件
1. `contracts/CheckoutUSDC.sol` - 主合约
2. `liqpass-verify/contracts/CheckoutUSDC.sol` - 验证合约
3. `verify-only/contracts/CheckoutUSDC.sol` - 纯验证合约

### 具体变更

#### 1. isValidAmount 函数逻辑调整
**修改前：**
```solidity
function isValidAmount(uint256 amount) internal pure returns (bool) {
    return amount > 0 && amount % (10 ** (USDC_DECIMALS - 1)) == 0; // 步长 0.1 USDC
}
```

**修改后：**
```solidity
function isValidAmount(uint256 amount) internal pure returns (bool) {
    return amount > 0 && amount % (10 ** USDC_DECIMALS) == 0; // 步长 1e-6 USDC
}
```

#### 2. 验证逻辑统一
- 所有合约版本现在都使用相同的 `isValidAmount` 验证逻辑
- 验证条件：金额必须为正数且能被 1e6 整除（1 micro-USDC 精度）

## 链下规则
- **最小金额**：0.01 USDC（10000 micro-USDC）
- **最大金额**：100 USDC（100000000 micro-USDC）
- **步长要求**：1e-6 USDC（1 micro-USDC）

## 回滚策略
如需要回滚此变更，可以：
1. 重新部署使用旧版本 `isValidAmount` 逻辑的合约
2. 或者修改现有合约的 `isValidAmount` 函数，恢复为 `(10 ** (USDC_DECIMALS - 1))` 的验证逻辑

## 影响评估
- **正向影响**：支持更精细的金额粒度，提升用户体验
- **风险**：需要确保所有相关系统（前端、后端、监听器）都同步更新验证逻辑
- **兼容性**：新规则向后兼容，旧的大额交易仍然有效

## 测试要求
- [ ] 0.01/0.1/1 USDC 下单均返回 201 状态码
- [ ] 非法金额（如 0.100001 USDC）被拒绝
- [ ] 合约验证与链下验证逻辑一致
- [ ] 文档和示例用例全部通过