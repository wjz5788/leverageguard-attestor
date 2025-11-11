# 运维与上线速览

本文件汇总运维/配置/回放/监听说明，统一入口如下：

- 环境变量总表：根 `.env.example`
- 各服务样例：`apps/*/.env.sample`
- 合约 ABI/地址：`packages/abi/`
- 监听服务：`apps/chain-listener/`
- 证据与日志：`reports/`（业务已有引用，未迁移）与 `data/`

## 启动前检查（env:check）

- Node 服务（backend / chain-listener）在 `start/dev` 前执行 `scripts/env-check.mjs`，缺失即退出。
- Python 服务（jp-verify）在 `start.sh` 中执行 `env_check.py`，缺失即退出。

## 常用探针

- Backend: `GET /api/v1/health`、`/api/v1/health/ready`、`/api/v1/health/live`
- JP Verify: `GET /healthz`

## 回放与去重

- 监听服务应维护 `lastProcessedBlock` 与确认数 `confirmations`，重启从 `lastProcessedBlock - confirmations` 回放，避免重复入库。

> 说明：本轮为目录与配置收敛，未改动业务逻辑与监听实现。

