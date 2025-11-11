# LiqPass Backend API Server

LiqPass 后端API服务器，提供保险订单管理、支付验证、链上事件监听等功能。

## 环境变量说明

### 必填环境变量

| 变量名 | 说明 | 示例值 | 必填 |
|--------|------|--------|------|
| `PAYMENT_VAULT_ADDRESS` | USDC保费金库地址（EVM地址，收款账户） | `0x9aeA8865A46a37a9Db738Fd0f1ee2bed49D143f1` | ✅ |
| `PAYMENT_CHAIN_ID` | 链ID（十进制） | `8453`（Base主网） | ✅ |
| `USDC_ADDRESS` | USDC合约地址 | `0x833589fCD6EDb6E08f4c7c32d4F71B54bDa02913` | ✅ |
| `DB_ADAPTER` | 数据库适配器 | `sqlite`（当前仅支持） | ✅ |
| `DB_FILE` | SQLite数据文件路径 | `data/us-backend.db` | ✅ |
| `CONFIRMATIONS` | 事件确认门槛（区块数） | `3` | ✅ |
| `LISTENER_POLL_INTERVAL_SEC` | 监听器轮询间隔（秒） | `20` | ✅ |

### 可选环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `REPLAY_FROM_BLOCK` | 从指定区块高度开始回放历史事件 | `0`（自动从检查点） |
| `PORT` | 服务器端口 | `3002` |
| `HOST` | 服务器绑定地址 | `0.0.0.0` |
| `NODE_ENV` | 运行环境 | `development` |

### 认证相关

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `JWT_SECRET` | JWT密钥（≥32字符） | `your-super-secret-jwt-key-here` |
| `KMS_KEY` | API密钥加密密钥（32字节Base64） | `your-32-byte-base64-encryption-key-here` |
| `PRICER_PRIVATE_KEY` | 定价器私钥（0x+64hex） | `0x...` |
| `ISSUER_PRIVATE_KEY` | 发行器私钥（0x+64hex） | `0x...` |

> **重要：仅支持钱包登录**
>
> 后端仅接受基于钱包签名的登录流程。任何包含 `email` 或 `password` 字段的登录请求都会返回 `410 Gone`，错误码 `WALLET_LOGIN_ONLY`，并且不会生成会话或令牌。

### 集成服务

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `BASE_RPC` | Base链RPC端点 | `https://mainnet.base.org` |
| `JP_VERIFY_BASE_URL` | JP验证服务地址 | `http://127.0.0.1:8082` |
| `ALLOWED_ORIGINS` | CORS允许的源 | `http://localhost:5173` |

## 快速开始

1. 复制环境变量模板：
```bash
cp .env.sample .env
```

2. 编辑 `.env` 文件，填入实际配置值

3. 安装依赖：
```bash
npm install
```

4. 启动开发服务器：
```bash
npm run dev
```

## 环境契约验证

启动时会自动校验环境变量配置，确保：
- 必填变量完整
- 地址格式正确
- 数值范围合理
- 数据库适配器支持

校验失败会立即退出并显示具体错误。

## API文档

启动后访问：
- OpenAPI文档：`http://localhost:3002/api-docs`
- 健康检查：`http://localhost:3002/health`

## 开发

### 环境要求
- Node.js 18+ 
- SQLite3
- TypeScript 5.0+

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建（TypeScript编译）
npm run build

# 生产模式
npm start

# 测试
npm test

# 类型检查
npm run type-check
```

### 常见问题

#### TypeScript编译错误
如果遇到TypeScript编译错误，请检查：
1. 数据库访问是否使用了正确的异步回调模式
2. 所有回调函数是否添加了类型注解 `(err: any, result: any) => {}`
3. 接口定义是否完整

#### 数据库连接问题
确保：
1. `DB_FILE`路径存在且可写
2. SQLite3驱动正确安装
3. 数据库表结构已初始化

### 代码规范
- 使用TypeScript严格模式
- 所有异步操作必须使用回调函数
- 数据库访问层必须添加完整的类型注解
- 遵循现有的代码结构和命名规范

## 部署

使用 PM2 进程管理器：
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```