# LiqPass

LiqPass 是一个为加密货币交易者提供爆仓保护的平台。

## 项目结构

```
.
├── packages/
│   ├── us-frontend/     # 美国站点前端
│   └── us-backend/      # 美国站点后端
├── jp-verify/           # 日本站点验证服务
├── contracts/           # 智能合约
├── docs/                # 文档
├── scripts/             # 脚本
└── reports/             # 报告
```

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
# 同时启动前端和后端开发服务器
pnpm dev

# 或者分别启动
pnpm --filter us-frontend dev
pnpm --filter us-backend dev
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