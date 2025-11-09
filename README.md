# LiqPass - 加密货币爆仓保护平台

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D8.0.0-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8-blue.svg)](https://soliditylang.org/)

LiqPass 是一个为加密货币交易者提供智能爆仓保护的专业平台。通过动态赔付机制和实时订单验证，为交易者提供公平、透明的风险保障服务。

## 🚦 上线一步走（极简）

- 拉依赖：`pnpm -w install`
- 配置环境：复制根 `.env.example` 为 `.env`，并为每个服务复制其 `.env.sample` 为 `.env`
  - Backend: `apps/us-backend/.env.sample`
  - Frontend: `apps/us-frontend/.env.sample`
  - Chain Listener: `apps/chain-listener/.env.sample`
  - JP Verify: `apps/jp-verify/.env.sample`
- 启动前校验：服务自带 `env:check`（缺配置将退出）
- 最小 CI：PR 自动运行类型检查/构建（存在模块才执行）

安全闸门已启用（保持默认开启即可）。若需关闭，预留开关：`STRICT_AUTH / REQUIRE_JWT / MAINTENANCE_MODE / ALLOW_DEMO_FALLBACK=false`。

## 🧪 烟囱测试（10 分钟）

1. 触发一次小额 USDC 支付，产出 `PremiumPaid`（Base 主网/测试网均可）。
2. 后端日志看到监听入库 1 次，无重复；订单从 `pending → paid`。
3. 重启后端：无重复入库；可从 `lastProcessedBlock - confirmations` 回放。
4. 调用 `jp-verify`：证据摘要/URI 入库（见 `reports/evidence/YYYY-MM-DD/`）。
5. 健康探针：
   - Backend: `GET /api/v1/health` 与 `GET /api/v1/health/ready` 返回 200
   - JP Verify: `GET /healthz` 返回 200；断开 RPC 后 `/ready` 应变红（若实现）

## 📋 项目状态

| 模块 | 状态 | 进度 | 备注 |
|------|------|------|------|
| 前端应用 (us-frontend) | ✅ 已完成 | 100% | React + TypeScript + Vite |
| 后端服务 (us-backend) | ✅ 已完成 | 100% | Node.js + Express + TypeScript |
| 智能合约 (contracts) | ✅ 已完成 | 100% | Solidity + Hardhat |
| 验证服务 (jp-verify) | ✅ 已完成 | 100% | Python + FastAPI |
| 文档站点 (leverageguard-docs) | ✅ 已完成 | 100% | Docusaurus |
| 项目文档 (docs) | 🔄 整理中 | 90% | 技术文档和规范 |

## ✨ 核心特性

### 🔒 智能爆仓保护
- **动态赔付比例**：根据本金和杠杆自动调整赔付比例
- **公平风险定价**：杠杆越高，风险越大，赔付比例越高
- **成本控制机制**：大本金低杠杆赔付比例低，防止系统性风险

### 🔍 实时订单验证
- **多交易所支持**：目前支持 OKX 交易所的订单验证
- **API密钥防伪**：使用用户自有API密钥进行天然身份验证
- **实时监控**：实时检测爆仓订单和成交记录

### 💰 透明赔付机制
- **公式化计算**：基于杠杆和本金的科学赔付公式
- **梯度保险费用**：按用户忠诚度梯度递减的保险费用
- **零风险保障**：赔付比例上限50%，用户零风险参与

## 🏗️ 项目架构

### 技术栈概览

| 模块 | 技术栈 | 主要功能 |
|------|--------|----------|
| **前端应用** | React 18 + TypeScript + Vite + TailwindCSS | 用户界面和交互 |
| **后端服务** | Node.js + Express + TypeScript + PostgreSQL | API服务和业务逻辑 |
| **智能合约** | Solidity 0.8 + Hardhat + Ethers.js | 链上赔付逻辑 |
| **验证服务** | Python + FastAPI + Requests | 交易所API验证 |
| **文档站点** | Docusaurus + React + TypeScript | 项目文档展示 |

### 目录结构

```
LiqPass/
├── apps/
│   ├── us-backend/        # 统一后端服务 (Node.js + TS)
│   ├── us-frontend/       # 前端 (React + Vite + TS)
│   ├── chain-listener/    # 链上监听回填服务
│   └── jp-verify/         # 交易证据验证服务 (Python)
├── contracts/             # 智能合约 (Hardhat)
├── packages/
│   └── abi/               # 合约 ABI 与地址（单一事实来源）
├── docs/                  # 技术与运维文档
├── scripts/               # 部署与运维脚本
├── examples/              # 使用示例
└── data/                  # 运行数据与临时文件（已忽略）
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Python** >= 3.8 (用于JP验证服务)

### 安装依赖

```bash
# 安装根项目依赖
pnpm install

# 安装各子项目依赖
pnpm --filter us-frontend install
pnpm --filter us-backend install
pnpm --filter liqpass-verify install
```

### 开发环境启动

```bash
# 启动后端服务 (端口: 3002)
cd apps/us-backend && pnpm dev

# 启动前端应用 (端口: 3000)
cd apps/us-frontend && pnpm dev

# 启动链上监听（可选）
cd apps/chain-listener && pnpm run watch:checkout

# 启动JP验证服务 (端口: 8082)
cd apps/jp-verify && ./start.sh
```

### 生产环境构建

```bash
# 构建所有包
pnpm build

# 分别构建各项目
pnpm --filter us-frontend build
pnpm --filter us-backend build
```

### 环境配置

项目使用环境变量进行配置，请创建相应的环境文件：

```bash
# 后端环境配置
cp apps/us-backend/.env.sample apps/us-backend/.env

# 前端环境配置  
cp apps/us-frontend/.env.sample apps/us-frontend/.env

# 验证服务配置
cp apps/jp-verify/.env.sample apps/jp-verify/.env
```

### 数据库设置

项目使用 SQLite 作为开发数据库，生产环境建议使用 PostgreSQL：

```bash
# 初始化数据库
cd us-backend && npm run db:init

# 运行数据库迁移
npm run db:migrate
```

## 📊 赔付机制

### 赔付公式

```python
# 赔付比例计算公式
赔付比例 = min(0.5, 0.25 + (杠杆 - 50) * 0.005)
赔付额 = 本金 × 赔付比例
```

### 配置示例

| 用户类型 | 本金 (USD) | 杠杆 | 保险费用 | 赔付比例 | 赔付额 |
|---------|------------|------|----------|----------|--------|
| 散户入门 | 100 | 100x | 20% | 50% | 50 |
| 常规中户 | 200 | 75x | 15% | 43.75% | 87.5 |
| 大户稳健 | 500 | 50x | 10% | 25% | 125 |

## 🔐 安全特性

### API密钥安全
- **加密存储**：用户API密钥使用AES-256-GCM加密
- **脱敏显示**：前端仅显示密钥首尾4位字符
- **权限控制**：最小化API密钥权限要求

### 智能合约安全
- **代码验证**：所有合约在BaseScan上验证
- **权限管理**：严格的合约访问控制
- **资金安全**：多重签名钱包管理

## 🌐 API接口

### 核心接口

```bash
# 订单验证
POST /api/verification/okx

# 赔付申请  
POST /api/claims

# 账户管理
GET /api/accounts
POST /api/accounts

# 支付链接
GET /api/links
POST /api/links
```

### 验证流程

1. **用户提供**：OKX API Key + Secret + Passphrase
2. **系统验证**：调用OKX API查询用户订单
3. **爆仓检测**：分析成交记录识别爆仓事件
4. **赔付计算**：根据公式计算应赔付金额
5. **资金发放**：通过智能合约发放赔付资金

## 📈 业务逻辑

### 爆仓检测算法

1. **订单查询**：获取用户指定时间范围内的订单
2. **成交分析**：分析成交记录中的强平标记
3. **盈亏计算**：计算爆仓订单的总盈亏
4. **证据生成**：生成Merkle树证据链

### 风险控制

- **杠杆上限**：最高支持100倍杠杆
- **赔付上限**：单次赔付不超过本金的50%
- **频率限制**：防止重复索赔和滥用
- **审计追踪**：完整的操作日志记录

## 🔧 开发指南

### 代码规范

- **TypeScript**：全栈TypeScript开发
- **ESLint**：统一的代码风格检查
- **Prettier**：自动代码格式化
- **Husky**：Git提交前检查

### 测试策略

```bash
# 运行单元测试
pnpm test

# 运行集成测试
pnpm test:integration

# 生成测试覆盖率报告
pnpm test:coverage
```

## 📚 文档资源

### 核心文档

- [产品方案](./docs/01_产品方案-Product/) - 业务逻辑和产品设计
- [接口契约](./docs/liq_pass_接口契约_v_1.md) - API接口规范
- [数据库设计](./docs/liq_pass_数据库_schema_v_1_1_（修订版：最小闭环＋证据_merkle_理赔）.md) - 数据模型设计
- [部署指南](./docs/部署说明（US-JP）.md) - 生产环境部署

### 技术文档

- [智能合约](./docs/智能合约/) - 合约开发指南
- [前端开发](./docs/前端按钮与路由检查报告.md) - 前端开发规范
- [验证流程](./docs/验证闭环自测包.md) - 订单验证流程

## 🤝 贡献指南

我们欢迎社区贡献！请阅读我们的贡献指南：

1. Fork 项目仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🛠️ 技术支持

- **文档站点**：访问 [LeverageGuard Docs](./leverageguard-docs/)
- **问题反馈**：创建 GitHub Issue
- **安全漏洞**：通过安全邮件报告

## 🔗 相关链接

- [智能合约地址](https://basescan.org/address/0xc4d1bedc8850771af2d9db2c6d24ec21a8829709)
- [项目演示](http://localhost:3000) (开发环境)
- [API文档](./docs/api-frontend.md)

---

**LiqPass** - 让加密货币交易更安全、更安心 🛡️
