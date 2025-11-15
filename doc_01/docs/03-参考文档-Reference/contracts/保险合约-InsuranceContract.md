# 智能合约参考文档

## 概述

LiqPass智能合约系统采用模块化设计，包含核心保险合约、支付合约、治理合约等组件。所有合约均部署在以太坊主网及兼容的Layer2网络上。

## 合约地址

| 网络 | 合约名称 | 地址 | 部署时间 |
|------|----------|------|----------|
| Ethereum Mainnet | InsuranceCore | `0x...` | 2024-01-01 |
| Polygon | InsuranceCore | `0x...` | 2024-01-01 |
| Arbitrum | InsuranceCore | `0x...` | 2024-01-01 |

## 核心合约

### InsuranceCore.sol

主保险合约，负责保险订单的创建、管理和赔付处理。

#### 主要功能

- 创建保险订单
- 处理保费支付
- 管理订单状态
- 处理赔付申请
- 资金管理

#### 关键方法

```solidity
// 创建保险订单
function createOrder(
    uint256 amount,
    uint256 leverage,
    uint256 duration
) external returns (uint256 orderId)

// 支付保费
function payPremium(uint256 orderId) external payable

// 提交赔付申请
function submitClaim(
    uint256 orderId,
    uint256 claimAmount,
    string memory evidence
) external returns (uint256 claimId)

// 查询订单详情
function getOrder(uint256 orderId) external view returns (Order memory)
```

#### 事件

```solidity
event OrderCreated(
    uint256 indexed orderId,
    address indexed user,
    uint256 amount,
    uint256 leverage,
    uint256 duration
);

event PremiumPaid(
    uint256 indexed orderId,
    address indexed user,
    uint256 premium
);

event ClaimSubmitted(
    uint256 indexed claimId,
    uint256 indexed orderId,
    uint256 claimAmount
);
```

### PaymentContract.sol

支付处理合约，负责USDC代币的接收和转账。

#### 主要功能

- USDC代币处理
- 资金安全转移
- 费用计算

#### 关键方法

```solidity
// 接收USDC支付
function receivePayment(
    address from,
    uint256 amount,
    uint256 orderId
) external

// 转移赔付资金
function transferClaim(
    address to,
    uint256 amount,
    uint256 claimId
) external
```

## 数据结构

### Order结构

```solidity
struct Order {
    uint256 orderId;
    address user;
    uint256 amount;      // 保险金额
    uint256 leverage;    // 杠杆倍数
    uint256 duration;    // 保险期限（天）
    uint256 premium;     // 保费
    OrderStatus status;  // 订单状态
    uint256 createdAt;
    uint256 updatedAt;
}
```

### Claim结构

```solidity
struct Claim {
    uint256 claimId;
    uint256 orderId;
    uint256 claimAmount;
    ClaimStatus status;
    string evidence;
    uint256 submittedAt;
    uint256 processedAt;
}
```

## 枚举类型

### OrderStatus

```solidity
enum OrderStatus {
    Pending,    // 待支付
    Active,     // 生效中
    Claimed,    // 已赔付
    Expired     // 已过期
}
```

### ClaimStatus

```solidity
enum ClaimStatus {
    Submitted,  // 已提交
    Verifying,  // 验证中
    Approved,   // 已批准
    Rejected,   // 已拒绝
    Processing, // 处理中
    Paid        // 已支付
}
```

## 权限控制

### 角色定义

- **DEFAULT_ADMIN_ROLE**: 系统管理员
- **OPERATOR_ROLE**: 运营人员
- **VERIFIER_ROLE**: 验证人员

### 权限方法

```solidity
// 授予角色
function grantRole(bytes32 role, address account) external

// 撤销角色
function revokeRole(bytes32 role, address account) external

// 检查角色
function hasRole(bytes32 role, address account) external view returns (bool)
```

## 安全考虑

### 重入攻击防护

使用Checks-Effects-Interactions模式，所有外部调用在状态更新之后进行。

### 整数溢出防护

使用SafeMath库进行数学运算。

### 访问控制

基于角色的访问控制（RBAC）系统。

## 错误码

| 错误码 | 描述 | 原因 |
|--------|------|------|
| IC001 | 订单不存在 | 查询不存在的订单ID |
| IC002 | 权限不足 | 调用者没有相应权限 |
| IC003 | 订单状态无效 | 操作与当前订单状态不匹配 |
| IC004 | 金额无效 | 金额为0或超过限制 |
| IC005 | 杠杆倍数无效 | 杠杆倍数不在允许范围内 |

## 测试

### 单元测试

```bash
# 运行合约测试
npm run test:contracts

# 生成测试覆盖率报告
npm run coverage
```

### 集成测试

```bash
# 运行集成测试
npm run test:integration
```

## 部署指南

### 环境准备

1. 安装必要的依赖
2. 配置环境变量
3. 准备部署脚本

### 部署步骤

```bash
# 编译合约
npx hardhat compile

# 运行部署脚本
npx hardhat run scripts/deploy.js --network mainnet
```

## 验证

### 合约验证

```bash
# 验证合约源码
npx hardhat verify --network mainnet DEPLOYED_ADDRESS "Constructor Arg1" "Constructor Arg2"
```

## 监控

### 事件监控

建议监控以下关键事件：
- OrderCreated
- PremiumPaid
- ClaimSubmitted
- ClaimApproved

### 指标监控

- 合约调用次数
- 交易成功率
- 平均响应时间
- 资金流动情况

## 升级策略

合约采用可升级模式，支持在不中断服务的情况下进行功能升级。

## 相关链接

- [合约源码](https://github.com/liqpass/contracts)
- [部署脚本](https://github.com/liqpass/deploy)
- [测试用例](https://github.com/liqpass/tests)
- [安全审计报告](https://github.com/liqpass/audits)