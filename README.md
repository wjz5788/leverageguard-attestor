# LiqPass

LiqPass 是一个为加密货币交易者提供爆仓保护的平台。

## 项目结构

```
.
├── us-frontend/         # 美国站点前端
├── us-backend/          # 美国站点后端（统一后端）
├── jp-verify/           # 验证服务（OKX 订单验证等）
├── contracts/           # 智能合约
├── docs/                # 文档
├── scripts/             # 脚本
└── reports/             # 报告
```

提示：原 `liqpass-backend` 已合并进 `us-backend`，请只使用 `us-backend` 进行后端开发与部署。

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发

```bash
# 分别启动（推荐）
cd us-backend && pnpm install && pnpm dev   # 后端默认端口 3002
cd us-frontend && pnpm install && pnpm dev  # 前端默认端口 3000
```

### 构建

```bash
# 构建所有包
pnpm build

# 或者分别构建
pnpm --filter us-frontend build
pnpm --filter us-backend build
```

## 项目文档

请查看 [docs](./docs) 目录获取详细的项目文档。
