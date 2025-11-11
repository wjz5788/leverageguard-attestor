# CheckoutUSDC 合约部署指南

## 概述

本指南介绍如何在 Base 主网部署 CheckoutUSDC 智能合约，该合约提供基于 Base USDC 的安全支付功能。

## 前置要求

1. **Node.js** (v16 或更高版本)
2. **npm** 或 **yarn**
3. **Base 网络钱包** (包含足够的 ETH 支付 gas 费用)
4. **BaseScan API 密钥** (可选，用于合约验证)

## 快速开始

### 1. 安装依赖

```bash
cd contracts
npm install
```

### 2. 配置环境变量

复制环境变量模板：
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入以下信息：
```env
# 部署配置
PRIVATE_KEY=你的私钥
BASESCAN_API_KEY=你的BaseScan API密钥

# 合约配置
BASE_USDC_ADDRESS=0x833589fCD6EdB6E08f4c7C32D4f71B54Bda02913
TREASURY_ADDRESS=你的金库地址

# 部署网络
DEPLOY_NETWORK=base
```

### 3. 编译合约

```bash
npm run compile
```

### 4. 部署合约

**Base 主网部署：**
```bash
npm run deploy:base
```

**Base Sepolia 测试网部署：**
```bash
npm run deploy:sepolia
```

**本地网络部署：**
```bash
npm run deploy:local
```

### 5. 验证合约（可选）

```bash
npm run verify:base
```

## 合约功能

### 核心功能

1. **USDC 支付**: 支持 Base 主网 USDC 支付
2. **订单管理**: 防止重复支付
3. **quoteHash 验证**: 确保报价有效性
4. **金库管理**: 支持热切换金库地址
5. **紧急提款**: 防止误转资产

### 安全特性

- ✅ 防重入攻击保护
- ✅ 订单状态跟踪
- ✅ quoteHash 有效期验证
- ✅ USDC 地址验证
- ✅ 暂停/恢复功能

## 网络配置

### Base 主网
- **Chain ID**: 8453
- **RPC URL**: https://mainnet.base.org
- **USDC 地址**: 0x833589fCD6EdB6E08f4c7C32D4f71B54Bda02913

### Base Sepolia 测试网
- **Chain ID**: 84532
- **RPC URL**: https://sepolia.base.org
- **USDC 地址**: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

## 部署流程

### 1. 准备阶段

1. 确保部署钱包有足够的 ETH 支付 gas 费用
2. 确认金库地址正确配置
3. 验证网络连接正常

### 2. 部署阶段

1. 编译合约代码
2. 部署合约到目标网络
3. 等待交易确认
4. 记录合约地址

### 3. 验证阶段

1. 验证合约部署成功
2. 检查合约功能正常
3. 配置前端集成

## 合约交互

### 前端集成示例

```javascript
// 连接合约
const contract = new ethers.Contract(
  contractAddress,
  CheckoutUSDC_ABI,
  signer
);

// 购买保单
const tx = await contract.buyPolicy(orderId, amount, quoteHash);
await tx.wait();

// 检查订单状态
const isProcessed = await contract.isOrderProcessed(orderId);
```

### 后端集成示例

```javascript
// 注册 quoteHash
const tx = await contract.registerQuoteHash(quoteHash, expiryTime);
await tx.wait();

// 监听支付事件
contract.on("PremiumPaid", (orderId, buyer, amount, quoteHash, timestamp) => {
  // 处理支付成功逻辑
});
```

## 故障排除

### 常见问题

1. **Gas 费用不足**
   - 确保钱包有足够的 ETH
   - 调整 gas price 设置

2. **网络连接失败**
   - 检查 RPC URL 配置
   - 确认网络连接正常

3. **合约验证失败**
   - 检查 BaseScan API 密钥
   - 确认合约代码一致

### 调试技巧

1. 使用 `--verbose` 标志获取详细日志
2. 检查交易哈希在区块浏览器中的状态
3. 验证合约字节码匹配

## 安全建议

1. **私钥安全**: 永远不要提交私钥到版本控制
2. **多重签名**: 考虑使用多重签名钱包管理金库
3. **监控告警**: 设置交易监控和异常告警
4. **定期审计**: 定期进行安全审计和代码审查

## 支持

如有问题，请联系开发团队或查看项目文档。