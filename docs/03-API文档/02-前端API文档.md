# LiqPass API 接口文档

## 目录

1. [概述](#概述)
2. [认证方式](#认证方式)
3. [通用响应格式](#通用响应格式)
4. [错误处理](#错误处理)
5. [API接口详情](#api接口详情)
   - [支付链接相关](#支付链接相关)
   - [订单相关](#订单相关)
   - [理赔相关](#理赔相关)
   - [API设置相关](#api设置相关)
   - [钱包相关](#钱包相关)
6. [数据模型](#数据模型)
7. [示例代码](#示例代码)
8. [状态码说明](#状态码说明)

## 概述

本文档描述了LiqPass前端应用所需的后端API接口。LiqPass是一个去中心化保险平台，提供加密货币交易爆仓保险服务。

### 基础信息

- **Base URL**: `https://api.liqpass.com`
- **API版本**: `v1`
- **数据格式**: `JSON`
- **字符编码**: `UTF-8`

### 环境信息

- **生产环境**: `https://api.liqpass.com`
- **测试环境**: `https://test-api.liqpass.com`

## 认证方式

API使用JWT（JSON Web Token）进行身份验证。客户端需要在每个请求的Header中包含有效的JWT令牌。

```
Authorization: Bearer <JWT_TOKEN>
```

### 获取JWT令牌

通过钱包签名获取JWT令牌：

```http
POST /api/v1/auth/wallet-signature
Content-Type: application/json

{
  "address": "0x...",
  "signature": "0x...",
  "message": "Sign in to LiqPass at {timestamp}"
}

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  }
}
```

## 状态码说明

### HTTP 状态码

| 状态码 | 含义 | 描述 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权访问 |
| 403 | Forbidden | 禁止访问 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突 |
| 422 | Unprocessable Entity | 请求格式正确但语义错误 |
| 429 | Too Many Requests | 请求频率超限 |
| 500 | Internal Server Error | 服务器内部错误 |

### 业务状态码

#### 支付链接状态

| 状态 | 描述 |
|------|------|
| `active` | 激活状态，可用于创建订单 |
| `inactive` | 非激活状态，不可用于创建订单 |
| `expired` | 已过期 |
| `disabled` | 已禁用 |

#### 订单状态

| 状态 | 描述 |
|------|------|
| `pending_onchain` | 等待链上确认 |
| `active` | 激活状态，保险生效中 |
| `expired` | 已过期，保险期结束 |
| `claimed` | 已理赔 |
| `cancelled` | 已取消 |
| `failed` | 失败 |

#### 理赔状态

| 状态 | 描述 |
|------|------|
| `prepared` | 已准备，等待提交证据 |
| `submitted` | 已提交证据，等待审核 |
| `verified` | 已验证，等待赔付 |
| `approved` | 已批准，赔付已完成 |
| `rejected` | 已拒绝 |
| `cancelled` | 已取消 |

#### API设置状态

| 状态 | 描述 |
|------|------|
| `active` | 激活状态，API可用 |
| `inactive` | 非激活状态，API不可用 |
| `expired` | 已过期 |
| `deleted` | 已删除 |

## 数据模型

### 支付链接模型

```typescript
interface PaymentLink {
  id: string;
  title: string;
  product: string;          // 产品类型: "24h", "72h", "168h"
  symbol: string;           // 交易对: "BTCUSDT", "ETHUSDT"
  principal: number;        // 本金
  leverage: number;         // 杠杆倍数
  premium: number;          // 保费
  payoutMax: number;        // 最大赔付
  status: string;           // 状态
  createdAt: string;        // 创建时间
  updatedAt: string;        // 更新时间
  expiresAt?: string;       // 过期时间
}
```

### 订单模型

```typescript
interface Order {
  id: string;
  orderRef: string;         // 订单参考号
  title: string;
  product: string;          // 产品类型
  symbol: string;           // 交易对
  principal: number;        // 本金
  leverage: number;         // 杠杆倍数
  premiumPaid: number;      // 已付保费
  payoutMax: number;        // 最大赔付
  status: string;           // 状态
  coverageStartTs: string;  // 保障开始时间
  coverageEndTs: string;    // 保障结束时间
  createdAt: string;        // 创建时间
  orderRef: string;         // 订单参考号
  exchangeAccountId?: string; // 交易所账户ID
  chain: string;            // 区块链
  txHash?: string;          // 交易哈希
  orderDigest?: string;     // 订单摘要
  skuId: string;            // SKU ID
  exchange?: string;        // 交易所
  pair?: string;            // 交易对
  priceUsdc?: number;       // USDC价格
  qty?: number;             // 数量
  evidenceId?: string;      // 证据ID
  claimId?: string;         // 理赔ID
  payoutAmount?: number;    // 赔付金额
  payoutStatus?: string;    // 赔付状态
}
```

### 理赔模型

```typescript
interface Claim {
  id: string;
  orderId: string;          // 订单ID
  orderRef: string;         // 订单参考号
  title: string;
  status: string;           // 状态
  payoutAmount?: number;    // 赔付金额
  payoutCurrency?: string;  // 赔付货币
  payoutTxHash?: string;    // 赔付交易哈希
  submittedAt: string;      // 提交时间
  processedAt?: string;     // 处理时间
  evidenceItems?: EvidenceItem[]; // 证据项
  reviewer?: string;        // 审核人
  reviewNotes?: string;     // 审核备注
}

interface EvidenceItem {
  id: string;
  type: string;             // 证据类型
  status: string;           // 状态
  uploadedAt: string;       // 上传时间
  reviewNotes?: string;     // 审核备注
}
```

### API设置模型

```typescript
interface ApiSetting {
  id: string;
  exchange: string;         // 交易所名称
  accountId: string;        // 交易所账户ID
  status: string;           // 状态
  permissions: string[];    // 权限列表
  createdAt: string;        // 创建时间
  updatedAt: string;        // 更新时间
  lastVerifiedAt?: string;  // 最后验证时间
}
```

### 钱包模型

```typescript
interface WalletInfo {
  address: string;          // 钱包地址
  chainId: number;          // 链ID
  chainName: string;        // 链名称
  ensName?: string;         // ENS名称
  balance?: string;         // 余额
  balanceUsd?: number;      // 美元余额
  currency?: string;        // 货币
  isConnected: boolean;     // 是否连接
  lastConnectedAt?: string; // 最后连接时间
}

interface ChainInfo {
  chainId: number;          // 链ID
  chainName: string;        // 链名称
  rpcUrl: string;           // RPC URL
  blockExplorerUrl: string; // 区块浏览器URL
  nativeCurrency: {         // 原生代币
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;       // 是否测试网
  isDefault: boolean;       // 是否默认
}
```

## 示例代码

### 创建支付链接

```javascript
// 使用 fetch API
const createPaymentLink = async (linkData) => {
  const response = await fetch('https://api.liqpass.com/api/v1/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
    },
    body: JSON.stringify(linkData)
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('支付链接创建成功:', result.data);
    return result.data;
  } else {
    console.error('创建失败:', result.error);
    throw new Error(result.error.message);
  }
};

// 使用示例
const linkData = {
  title: "24小时爆仓保险",
  product: "24h",
  symbol: "BTCUSDT",
  principal: 1000,
  leverage: 10,
  premium: 50,
  payoutMax: 1000,
  walletAddress: "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
  signature: "0x...",
  message: "Sign to create link at 1705315800"
};

createPaymentLink(linkData)
  .then(link => console.log('链接ID:', link.id))
  .catch(error => console.error('错误:', error.message));
```

### 创建订单

```javascript
const createOrder = async (linkId) => {
  const walletAddress = await getCurrentWalletAddress();
  const message = `Sign to create order at ${Date.now()}`;
  const signature = await signMessage(message);
  
  const response = await fetch('https://api.liqpass.com/api/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
    },
    body: JSON.stringify({
      linkId,
      walletAddress,
      signature,
      message
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error.message);
  }
};
```

### 提交理赔

```javascript
const submitClaim = async (orderId, evidenceFiles) => {
  // 1. 准备理赔
  const walletAddress = await getCurrentWalletAddress();
  const message = `Sign to prepare claim at ${Date.now()}`;
  const signature = await signMessage(message);
  
  const prepareResponse = await fetch('https://api.liqpass.com/api/v1/claims/prepare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
    },
    body: JSON.stringify({
      orderId,
      walletAddress,
      signature,
      message
    })
  });
  
  const prepareResult = await prepareResponse.json();
  if (!prepareResult.success) {
    throw new Error(prepareResult.error.message);
  }
  
  const claimId = prepareResult.data.claimId;
  
  // 2. 上传证据
  for (const [type, file] of Object.entries(evidenceFiles)) {
    const formData = new FormData();
    formData.append('evidenceType', type);
    formData.append('file', file);
    
    await fetch(`https://api.liqpass.com/api/v1/claims/${claimId}/evidence`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
      },
      body: formData
    });
  }
  
  // 3. 验证理赔
  const verifyMessage = `Sign to verify claim at ${Date.now()}`;
  const verifySignature = await signMessage(verifyMessage);
  
  const verifyResponse = await fetch(`https://api.liqpass.com/api/v1/claims/${claimId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
    },
    body: JSON.stringify({
      walletAddress,
      signature: verifySignature,
      message: verifyMessage
    })
  });
  
  const verifyResult = await verifyResponse.json();
  if (!verifyResult.success) {
    throw new Error(verifyResult.error.message);
  }
  
  return verifyResult.data;
};
```

### 钱包签名验证

对于需要钱包签名的操作，请求体中需要包含以下字段：
- `walletAddress`: 用户钱包地址
- `signature`: 钱包签名
- `message`: 签名消息，通常包含时间戳

### 钱包相关

#### 获取钱包信息

获取用户连接的钱包信息。

```http
GET /api/v1/wallet/info
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `address` (可选): 钱包地址，如果不提供则使用认证用户的默认钱包

**响应**:
```json
{
  "success": true,
  "data": {
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
    "chainId": 8453,
    "chainName": "Base",
    "ensName": "user.eth",
    "balance": "1250.75",
    "balanceUsd": 1250.75,
    "currency": "USDC",
    "isConnected": true,
    "lastConnectedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 获取支持的链

获取应用支持的所有区块链网络。

```http
GET /api/v1/wallet/supported-chains
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "chainId": 8453,
      "chainName": "Base",
      "rpcUrl": "https://mainnet.base.org",
      "blockExplorerUrl": "https://basescan.org",
      "nativeCurrency": {
        "name": "Ether",
        "symbol": "ETH",
        "decimals": 18
      },
      "isTestnet": false,
      "isDefault": true
    },
    {
      "chainId": 1,
      "chainName": "Ethereum Mainnet",
      "rpcUrl": "https://mainnet.infura.io/v3/",
      "blockExplorerUrl": "https://etherscan.io",
      "nativeCurrency": {
        "name": "Ether",
        "symbol": "ETH",
        "decimals": 18
      },
      "isTestnet": false,
      "isDefault": false
    }
  ]
}
```

#### 切换网络

请求切换到指定的区块链网络。

```http
POST /api/v1/wallet/switch-network
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "chainId": 8453,              // 目标链ID
  "walletAddress": "0x...",     // 用户钱包地址
  "signature": "0x...",         // 钱包签名
  "message": "Sign to switch network at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "chainId": 8453,
    "chainName": "Base",
    "switchedAt": "2024-01-15T10:35:00Z",
    "requiresWalletAction": true,
    "walletActionMessage": "请在钱包中确认网络切换"
  }
}
```

#### 获取钱包余额

获取指定钱包的余额信息。

```http
GET /api/v1/wallet/balance
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `address` (可选): 钱包地址，如果不提供则使用认证用户的默认钱包
- `token` (可选): 代币合约地址，如果不提供则返回原生代币余额

**响应**:
```json
{
  "success": true,
  "data": {
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
    "chainId": 8453,
    "chainName": "Base",
    "balances": [
      {
        "tokenAddress": "0x0000000000000000000000000000000000000000",
        "tokenSymbol": "ETH",
        "tokenName": "Ether",
        "balance": "0.5",
        "balanceUsd": 1250.75,
        "decimals": 18
      },
      {
        "tokenAddress": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531770b230",
        "tokenSymbol": "USDC",
        "tokenName": "USD Coin",
        "balance": "1000.0",
        "balanceUsd": 1000.0,
        "decimals": 6
      }
    ],
    "totalBalanceUsd": 2250.75,
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

#### 验证钱包签名

验证钱包签名的有效性。

```http
POST /api/v1/wallet/verify-signature
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
  "message": "Sign to verify wallet at 1705315800",
  "signature": "0x4355c47d63924e8a72e509b65029052eb6c50d033f5b146c4a5ac5127d5c8dc916d2b6e6c5ee3b1d5a2b1a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "address": "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
    "verifiedAt": "2024-01-15T10:35:00Z"
  }
}
```

#### 获取交易历史

获取钱包的交易历史记录。

```http
GET /api/v1/wallet/transactions
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `address` (可选): 钱包地址，如果不提供则使用认证用户的默认钱包
- `page` (可选): 页码，默认为1
- `limit` (可选): 每页数量，默认为20
- `type` (可选): 交易类型筛选 (send, receive, contract_interaction)
- `fromBlock` (可选): 起始区块号
- `toBlock` (可选): 结束区块号

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "hash": "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
        "from": "0x742d35Cc6634C0532925a3b8D4C9db96c4b4d8b",
        "to": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531770b230",
        "value": "1000000000000000000",
        "gasUsed": "21000",
        "gasPrice": "20000000000",
        "blockNumber": 12345678,
        "blockHash": "0xef4f2eb5777b9a71c8e5a8a0e4e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
        "transactionIndex": 5,
        "status": "confirmed",
        "timestamp": "2024-01-15T10:30:00Z",
        "type": "send",
        "valueUsd": 2500.50
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

### API设置相关

#### 验证交易所API

验证用户提供的交易所API密钥是否有效。

```http
POST /api/v1/api-settings/verify
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "exchange": "okx",           // 交易所名称: okx, binance, bybit
  "apiKey": "your_api_key",    // API密钥
  "secret": "your_secret",     // API密钥对应的密钥
  "passphrase": "your_passphrase", // OKX专用
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to verify API at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "exchange": "okx",
    "status": "valid",
    "accountId": "okx_123456789",
    "permissions": [
      "read_trades",
      "read_positions",
      "read_balance"
    ],
    "verifiedAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-02-15T10:30:00Z"
  }
}
```

#### 保存API设置

保存用户的交易所API设置。

```http
POST /api/v1/api-settings
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "exchange": "okx",           // 交易所名称
  "accountId": "okx_123456789", // 交易所账户ID
  "apiKey": "your_api_key",    // 加密后的API密钥
  "secret": "your_secret",     // 加密后的密钥
  "passphrase": "your_passphrase", // OKX专用
  "permissions": [             // API权限
    "read_trades",
    "read_positions",
    "read_balance"
  ],
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to save API settings at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "api_setting_123456789",
    "exchange": "okx",
    "accountId": "okx_123456789",
    "status": "active",
    "permissions": [
      "read_trades",
      "read_positions",
      "read_balance"
    ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "lastVerifiedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 获取API设置列表

获取用户的所有交易所API设置。

```http
GET /api/v1/api-settings
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `exchange` (可选): 交易所筛选

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "api_setting_123456789",
      "exchange": "okx",
      "accountId": "okx_123456789",
      "status": "active",
      "permissions": [
        "read_trades",
        "read_positions",
        "read_balance"
      ],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "lastVerifiedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "api_setting_123456790",
      "exchange": "binance",
      "accountId": "binance_123456789",
      "status": "inactive",
      "permissions": [
        "read_trades",
        "read_positions"
      ],
      "createdAt": "2024-01-10T15:20:00Z",
      "updatedAt": "2024-01-12T09:15:00Z",
      "lastVerifiedAt": "2024-01-12T09:15:00Z"
    }
  ]
}
```

#### 更新API设置

更新现有的交易所API设置。

```http
PUT /api/v1/api-settings/{apiSettingId}
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "apiKey": "new_api_key",     // 新的API密钥（可选）
  "secret": "new_secret",      // 新的密钥（可选）
  "passphrase": "new_passphrase", // 新的passphrase（可选）
  "status": "active",          // 状态（可选）
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to update API settings at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "api_setting_123456789",
    "exchange": "okx",
    "accountId": "okx_123456789",
    "status": "active",
    "permissions": [
      "read_trades",
      "read_positions",
      "read_balance"
    ],
    "updatedAt": "2024-01-15T11:00:00Z",
    "lastVerifiedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 删除API设置

删除指定的交易所API设置。

```http
DELETE /api/v1/api-settings/{apiSettingId}
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to delete API settings at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "api_setting_123456789",
    "status": "deleted",
    "deletedAt": "2024-01-15T11:30:00Z"
  }
}
```

#### 测试API连接

测试已保存的API设置是否仍然有效。

```http
POST /api/v1/api-settings/{apiSettingId}/test
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to test API connection at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "api_setting_123456789",
    "exchange": "okx",
    "status": "active",
    "testResult": "success",
    "testedAt": "2024-01-15T11:45:00Z",
    "permissions": [
      "read_trades",
      "read_positions",
      "read_balance"
    ],
    "accountInfo": {
      "accountId": "okx_123456789",
      "accountType": "universal",
      "currency": "USDT",
      "balance": 1250.75
    }
  }
}
```

### 理赔相关

#### 准备理赔

为指定订单准备理赔，验证订单状态和理赔条件。

```http
POST /api/v1/claims/prepare
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "orderId": "order_123456789",  // 订单ID
  "walletAddress": "0x...",      // 用户钱包地址
  "signature": "0x...",          // 钱包签名
  "message": "Sign to prepare claim at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "claimId": "claim_123456789",
    "orderId": "order_123456789",
    "status": "prepared",
    "evidenceRequired": true,
    "evidenceTypes": [
      "transaction_history",
      "position_screenshot",
      "liquidation_proof"
    ],
    "submissionDeadline": "2024-01-16T10:30:00Z",
    "preparedAt": "2024-01-15T10:35:00Z"
  }
}
```

#### 提交理赔证据

提交理赔所需的证据材料。

```http
POST /api/v1/claims/{claimId}/evidence
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**请求体**:
```
evidenceType: "transaction_history" | "position_screenshot" | "liquidation_proof"
file: [文件数据]
description: "交易历史记录截图" (可选)
```

**响应**:
```json
{
  "success": true,
  "data": {
    "evidenceId": "evidence_123456789",
    "claimId": "claim_123456789",
    "type": "transaction_history",
    "status": "uploaded",
    "uploadedAt": "2024-01-15T10:40:00Z",
    "reviewStatus": "pending"
  }
}
```

#### 验证理赔

验证提交的理赔证据和条件。

```http
POST /api/v1/claims/{claimId}/verify
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "walletAddress": "0x...",      // 用户钱包地址
  "signature": "0x...",          // 钱包签名
  "message": "Sign to verify claim at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "claimId": "claim_123456789",
    "orderId": "order_123456789",
    "status": "verified",
    "verifiedAt": "2024-01-15T10:45:00Z",
    "payoutAmount": 50,
    "payoutCurrency": "USDC",
    "payoutStatus": "pending",
    "reviewer": "auto_verification",
    "reviewNotes": "Evidence verified successfully"
  }
}
```

#### 获取理赔列表

获取用户的所有理赔记录。

```http
GET /api/v1/claims
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `page` (可选): 页码，默认为1
- `limit` (可选): 每页数量，默认为20
- `status` (可选): 状态筛选
- `orderId` (可选): 订单ID筛选

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "claim_123456789",
        "orderId": "order_123456789",
        "orderRef": "ORD20240115001",
        "title": "24h 爆仓保",
        "status": "approved",
        "payoutAmount": 50,
        "payoutCurrency": "USDC",
        "submittedAt": "2024-01-15T10:35:00Z",
        "processedAt": "2024-01-15T11:00:00Z",
        "evidenceCount": 3,
        "reviewer": "auto_verification"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 3,
      "totalPages": 1
    }
  }
}
```

#### 获取理赔详情

获取指定理赔的详细信息。

```http
GET /api/v1/claims/{claimId}
Authorization: Bearer <JWT_TOKEN>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "claim_123456789",
    "orderId": "order_123456789",
    "orderRef": "ORD20240115001",
    "title": "24h 爆仓保",
    "status": "approved",
    "payoutAmount": 50,
    "payoutCurrency": "USDC",
    "payoutTxHash": "0x...",
    "submittedAt": "2024-01-15T10:35:00Z",
    "processedAt": "2024-01-15T11:00:00Z",
    "evidenceItems": [
      {
        "id": "evidence_123456789",
        "type": "transaction_history",
        "status": "approved",
        "uploadedAt": "2024-01-15T10:40:00Z",
        "reviewNotes": "Valid transaction history"
      },
      {
        "id": "evidence_123456790",
        "type": "position_screenshot",
        "status": "approved",
        "uploadedAt": "2024-01-15T10:42:00Z",
        "reviewNotes": "Position screenshot matches order details"
      },
      {
        "id": "evidence_123456791",
        "type": "liquidation_proof",
        "status": "approved",
        "uploadedAt": "2024-01-15T10:44:00Z",
        "reviewNotes": "Liquidation confirmed within coverage period"
      }
    ],
    "reviewer": "auto_verification",
    "reviewNotes": "All evidence verified. Claim approved for full payout."
  }
}
```

#### 撤销理赔

撤销已提交但尚未处理的理赔申请。

```http
DELETE /api/v1/claims/{claimId}
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "walletAddress": "0x...",      // 用户钱包地址
  "signature": "0x...",          // 钱包签名
  "message": "Sign to cancel claim at {timestamp}",
  "reason": "用户主动撤销"        // 撤销原因（可选）
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "claimId": "claim_123456789",
    "status": "cancelled",
    "cancelledAt": "2024-01-15T10:50:00Z",
    "reason": "用户主动撤销"
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  }
}
```

### 订单相关

#### 创建订单

通过支付链接创建新的保险订单。

```http
POST /api/v1/orders
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "linkId": "link_123456789",  // 支付链接ID
  "walletAddress": "0x...",    // 用户钱包地址
  "signature": "0x...",        // 钱包签名
  "message": "Sign to create order at {timestamp}"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "order_123456789",
    "orderRef": "ORD20240115001",
    "title": "24h 爆仓保",
    "product": "24h",
    "symbol": "BTCUSDT",
    "principal": 20,
    "leverage": 10,
    "premiumPaid": 2.5,
    "payoutMax": 50,
    "status": "pending_onchain",
    "coverageStartTs": "2024-01-15T10:30:00Z",
    "coverageEndTs": "2024-01-16T10:30:00Z",
    "createdAt": "2024-01-15T10:30:00Z",
    "chain": "Base",
    "txHash": "0x...",
    "orderDigest": "0x...",
    "skuId": "SKU_24H_FIXED"
  }
}
```

#### 获取订单列表

获取用户的所有订单。

```http
GET /api/v1/orders
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `page` (可选): 页码，默认为1
- `limit` (可选): 每页数量，默认为20
- `status` (可选): 状态筛选
- `product` (可选): 产品类型筛选

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "order_123456789",
        "title": "24h 爆仓保",
        "principal": 20,
        "leverage": 10,
        "premiumPaid": 2.5,
        "payoutMax": 50,
        "status": "active",
        "coverageStartTs": "2024-01-15T10:30:00Z",
        "coverageEndTs": "2024-01-16T10:30:00Z",
        "createdAt": "2024-01-15T10:30:00Z",
        "orderRef": "ORD20240115001",
        "exchangeAccountId": "okx_123456",
        "chain": "Base",
        "txHash": "0x...",
        "orderDigest": "0x...",
        "skuId": "SKU_24H_FIXED"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

#### 获取订单详情

获取指定订单的详细信息。

```http
GET /api/v1/orders/{orderId}
Authorization: Bearer <JWT_TOKEN>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "order_123456789",
    "title": "24h 爆仓保",
    "product": "24h",
    "symbol": "BTCUSDT",
    "principal": 20,
    "leverage": 10,
    "premiumPaid": 2.5,
    "payoutMax": 50,
    "status": "active",
    "coverageStartTs": "2024-01-15T10:30:00Z",
    "coverageEndTs": "2024-01-16T10:30:00Z",
    "createdAt": "2024-01-15T10:30:00Z",
    "orderRef": "ORD20240115001",
    "exchangeAccountId": "okx_123456",
    "chain": "Base",
    "txHash": "0x...",
    "orderDigest": "0x...",
    "skuId": "SKU_24H_FIXED",
    "exchange": "OKX",
    "pair": "BTC-USDT-PERP",
    "priceUsdc": 42000,
    "qty": 0.0005,
    "evidenceId": "evidence_123456",
    "claimId": "claim_123456",
    "payoutAmount": 0,
    "payoutStatus": "none"
  }
}
```

#### 更新订单状态

更新订单状态（内部使用）。

```http
PUT /api/v1/orders/{orderId}/status
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "status": "active",  // 新状态
  "txHash": "0x...",   // 交易哈希（可选）
  "reason": "Order confirmed on chain"  // 原因（可选）
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "order_123456789",
    "status": "active",
    "updatedAt": "2024-01-15T10:35:00Z"
  }
}
```

## 通用响应格式

所有API响应都遵循统一的格式：

### 成功响应

```json
{
  "success": true,
  "data": {
    // 响应数据
  }
}
```

### 分页响应

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

## 错误处理

错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  }
}
```

### 常见错误码

| 错误码 | HTTP状态码 | 描述 |
|--------|------------|------|
| INVALID_REQUEST | 400 | 请求参数无效 |
| UNAUTHORIZED | 401 | 未授权访问 |
| FORBIDDEN | 403 | 权限不足 |
| NOT_FOUND | 404 | 资源不存在 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| WALLET_NOT_CONNECTED | 1001 | 钱包未连接 |
| INVALID_SIGNATURE | 1002 | 签名无效 |
| INSUFFICIENT_BALANCE | 1003 | 余额不足 |
| ORDER_NOT_FOUND | 2001 | 订单不存在 |
| CLAIM_NOT_ELIGIBLE | 3001 | 不符合理赔条件 |
| API_KEY_INVALID | 4001 | API密钥无效 |

## API接口详情

### 支付链接相关

#### 创建支付链接

创建新的支付链接，用于销售保险产品。

```http
POST /api/v1/links
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "product": "24h",        // 产品类型: "24h", "7d", "30d"
  "symbol": "BTCUSDT",     // 交易对
  "amount": 20,            // 金额 (USDC)
  "duration": 24           // 时长 (小时)
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "link_123456789",
    "url": "https://liqpass.com/pay/link_123456789",
    "product": "24h",
    "symbol": "BTCUSDT",
    "amount": 20,
    "duration": 24,
    "status": "active",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 获取支付链接列表

获取用户创建的所有支付链接。

```http
GET /api/v1/links
Authorization: Bearer <JWT_TOKEN>
```

**查询参数**:
- `page` (可选): 页码，默认为1
- `limit` (可选): 每页数量，默认为20
- `status` (可选): 状态筛选 ("active", "inactive")

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "link_123456789",
        "product": "24h",
        "symbol": "BTCUSDT",
        "amount": 20,
        "duration": 24,
        "url": "https://liqpass.com/pay/link_123456789",
        "status": "active",
        "usageCount": 5,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 10,
      "totalPages": 1
    }
  }
}
```

#### 更新支付链接状态

激活或停用支付链接。

```http
PUT /api/v1/links/{linkId}/status
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**请求体**:
```json
{
  "status": "inactive"    // "active" 或 "inactive"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "link_123456789",
    "status": "inactive",
    "updatedAt": "2024-01-15T11:30:00Z"
  }
}
```

#### 获取支付链接详情

获取指定支付链接的详细信息。

```http
GET /api/v1/links/{linkId}
Authorization: Bearer <JWT_TOKEN>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "link_123456789",
    "product": "24h",
    "symbol": "BTCUSDT",
    "amount": 20,
    "duration": 24,
    "url": "https://liqpass.com/pay/link_123456789",
    "status": "active",
    "usageCount": 5,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 删除支付链接

删除指定的支付链接。

```http
DELETE /api/v1/links/{linkId}
Authorization: Bearer <JWT_TOKEN>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "link_123456789",
    "deleted": true
  }
}
```