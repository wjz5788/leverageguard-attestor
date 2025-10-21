# 03-05 美国服务器架构细化 / US Server Architecture Details

> 适用于美国节点的 LiqPass / LeverSafe 后端集群，重点强调前后端分层、数据安全与跨区域同步。文档目标是在与日本服务器协同时提供一致的交付基线。

## 1. 系统概览 / System Overview

- **前端栈 Frontend Stack**：React 18 + Next.js 14（App Router），结合 Tailwind CSS 与 Wagmi/Ethers.js 完成钱包交互。
- **后端栈 Backend Stack**：Python 3.11，框架选型 FastAPI（首选）或 Django REST Framework（备选）。
- **数据层 Data Layer**：托管式 PostgreSQL 15，采用多 schema 隔离业务数据与审计日志。
- **部署目标 Deployment Target**：AWS（us-east-1）或 GCP（us-central1），支持 Docker/Kubernetes。
- **对外接口 External Interfaces**：Binance 订单校验 API、日本服务器跨区同步 API、链上 RPC 节点（Base Mainnet/Sepolia）。

## 2. 前端模块拆解 / Frontend Modules

| 模块 Module | 关键功能 Key Features | 实现要点 Implementation Notes |
| --- | --- | --- |
| **产品目录 Product Catalog** | 展示保险产品、保额、费率、可用交易所 | 静态生成（SSG）+ 客户端过滤；数据来源 `/api/products` |
| **订单管理 Orders** | 购买保单、查看状态、触发验证 | 使用 Next.js Server Actions 写入订单；乐观更新与重试提示 |
| **帮助中心 Help Center** | FAQ、索赔流程、KYC 指引 | 从 Markdown/Notion 同步；支持站内搜索 |
| **钱包连接 Wallet Connect** | 支持 MetaMask、WalletConnect、Coinbase Wallet | Wagmi + RainbowKit；提示链切换；签名获取用户 UID |
| **凭证上传 Verification** | 输入 Binance API Key、上传订单截图/Tx Hash | 使用加密存储（Secret Manager）；前端校验格式；调用 `/api/verification` |
| **申诉中心 Appeals** | 提交补充凭证、查看处理进度 | WebSocket/SSE 更新；多语言通知 |

### 前端技术要点

1. **App Router 路由分层**：公共页面使用 SSG/ISR，涉及用户数据的页面通过 Server Components 获取数据并在客户端渲染敏感信息前做脱敏。
2. **钱包与账户绑定**：首次连接钱包时，调用 `/api/auth/nonce` 获取挑战信息，签名后换取 JWT；JWT 中包含 `wallet_address` 与 `binance_uid` 映射关系。
3. **API Key 提交体验**：前端仅接受 Read-Only 权限的 Key，提交前展示权限校验结果（通过 `/api/exchange/validate-key`）。
4. **国际化 I18N**：使用 `next-intl`，默认语言英文，支持中文/日文；依赖 cookie 记录语言偏好。

## 3. 后端服务分层 / Backend Services

### 3.1 核心服务

- **API Gateway**：FastAPI 主应用，负责认证、请求路由、限流；提供 REST + WebSocket。
- **Verification Worker**：基于 Celery/Redis 或 FastAPI BackgroundTasks，用于异步校验订单与撮合结果。
- **Payment Service**：集成 Stripe/加密支付网关（Coinbase Commerce）；处理订单扣款与退款。
- **Evidence Chain Service**：与区块链交互，负责生成链上存证 payload，调用日本节点的多签服务。

### 3.2 关键接口

| Endpoint | 方法 Method | 描述 Description |
| --- | --- | --- |
| `/api/auth/nonce` | GET | 获取签名挑战 nonce |
| `/api/auth/session` | POST | 钱包签名换取 JWT，绑定用户资料 |
| `/api/orders` | POST | 创建保单订单，写入数据库并触发支付流程 |
| `/api/orders/{id}` | GET | 查询订单状态、赔付结果 |
| `/api/verification` | POST | 提交订单凭证，异步校验并返回任务 ID |
| `/api/appeals` | POST | 创建申诉记录，触发人工/半自动复核 |
| `/api/exchange/validate-key` | POST | 检查 Binance API Key 权限与有效性 |
| `/internal/sync/evidence` | POST | 与日本服务器互通链上凭证、赔付记录 |

### 3.3 安全与合规

- **认证**：JWT + 短期刷新令牌，所有写操作要求二次验证（钱包签名或邮件 OTP）。
- **数据加密**：API Key 与敏感凭证使用 KMS/Secret Manager 加密存储；数据库字段级加密（pgcrypto）。
- **审计日志**：所有关键操作写入 `audit_log` 表，并通过 CDC 流向 SIEM（如 Splunk）。
- **限流与风控**：FastAPI 中间件 + Redis 令牌桶；对异常 IP 进行自动封禁。

## 4. 数据库设计 / Database Schema

### 4.1 核心表

| 表 Table | 作用 Purpose | 关键字段 Key Fields |
| --- | --- | --- |
| `users` | 存储用户基础信息、钱包绑定关系 | `id`, `wallet_address`, `email`, `binance_uid`, `kyc_status` |
| `products` | 保险产品定义、费率、限额 | `id`, `name`, `exchange`, `max_leverage`, `premium_rate`, `coverage_cap` |
| `orders` | 用户购买的保单订单 | `id`, `user_id`, `product_id`, `status`, `premium_amount`, `payout_amount` |
| `payments` | 支付记录、第三方流水号 | `id`, `order_id`, `provider`, `tx_hash`, `status`, `currency` |
| `evidence_chain` | 存证数据、链上哈希 | `id`, `order_id`, `snapshot_uri`, `merkle_root`, `onchain_tx_hash`, `synced_to_jp` |
| `verifications` | 订单验证任务及结果 | `id`, `order_id`, `source`, `status`, `payload`, `failure_reason` |
| `appeals` | 申诉记录、处理流程 | `id`, `order_id`, `channel`, `status`, `handler`, `resolution_note` |
| `audit_log` | 审计日志、操作轨迹 | `id`, `actor_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at` |

### 4.2 数据治理

- **Schema 划分**：`core`（业务数据）、`compliance`（审计/留痕）、`analytics`（衍生报表）。
- **备份策略**：每日全量快照 + 15 分钟增量，使用 Point-In-Time Recovery；跨区复制至 us-west-2。
- **隐私保护**：对邮箱、手机号等字段进行哈希/脱敏存储，遵循美国隐私法规（CCPA）。

## 5. 与日本服务器的协同 / JP-US Coordination

1. **证据同步**：美国节点在验证完成后，将 `evidence_chain` 的 Merkle Root 与链上 Tx Hash 通过 `/internal/sync/evidence` 推送到日本服务器，确保双边可核验。
2. **赔付触发**：当赔付条件满足时，美国服务器调用日本节点的多签合约服务；若日本节点未响应，则本地记录重试队列并提示人工介入。
3. **故障回退**：采用消息队列（如 AWS SQS）缓存未同步的事件；日本节点恢复后进行补偿同步。

## 6. 运行与监控 / Operations & Monitoring

- **CI/CD**：GitHub Actions 构建 + 单元测试 → 推送 Docker Registry → Argo CD/Cloud Run 部署。
- **监控 Observability**：Prometheus + Grafana 监控 API 延迟、任务队列积压；OpenTelemetry 追踪跨服务链路。
- **日志 Logging**：结构化 JSON 日志接入 AWS OpenSearch；关键告警同步到 PagerDuty/Slack。
- **合规审计**：季度渗透测试 + SOC 2 Type II 报告；日志保存 ≥ 400 天。

## 7. 里程碑与下一步 / Roadmap

1. **MVP（T+4 周）**：完成订单购买、Binance 验证、链上存证闭环；部署单区容灾。
2. **Alpha（T+8 周）**：引入 Stripe 支付、申诉模块、跨区同步；完善审计日志。
3. **Beta（T+12 周）**：多语言前端、SLA 监控、自动化赔付触发；准备外部审计与资助材料。

---

> 如需图表版部署拓扑或时序图，可在 `docs/_assets/architecture/` 目录追加 Draw.io / Mermaid 文件并引用本页面。
