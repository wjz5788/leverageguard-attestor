# LiqPass 开发规范与设计蓝图 v1.0

> 适用范围：OKX/币安验证最小闭环（本地→US→JP），并能平滑扩展到上链赔付与透明度审计。

---

## 0. 术语与约定
- **US Backend**：美国服务器 Node/Express（或 Fastify）服务，面对前端与合约，统一网关与业务编排。
- **JP Verify**：日本服务器 FastAPI 微服务，负责交易所订单验证、证据生成、Merkle 汇总。
- **Customer Web**：前端 React/Tailwind SPA。
- **Policy**：参数化赔付合约/订单（不是监管意义的保险）。
- **Evidence**：单笔验证产生的可审计 JSON（哈希化后入 Merkle）。
- **Attestation**：将某周期 Merkle Root 上链记录。
- **ID 风格**：使用 `ulid`（可排序）或 `uuid v7`；所有外部 ID（OKX ordId 等）原样存储并加索引。
- **时间**：全部使用 UTC ISO8601；服务端保存 `createdAt/updatedAt`。

---

## 1. 架构原则（能落地的）
1. **边界清晰**：JP 只做“验证 + 证据 + Merkle”，US 负责“销售/下单/赔付/上链/账号”。
2. **最小可用**：先通 1 所交易所（OKX），接口留可选字段兼容币安。
3. **可证据化**：任何自动决策（是否爆仓/平仓）对应一份 Evidence；Evidence 只在 JP 存明文，US 仅拉取摘要。
4. **幂等与可重放**：所有写操作支持 `Idempotency-Key`；验证任务可重复执行，输出哈希相等视为一致。
5. **安全默认拒绝**：JP 仅白名单 IP（US），前端从不直连交易所；密钥仅在 JP 内存/磁盘密文短暂使用。
6. **可观测**：统一 `requestId`、结构化日志、基本指标（QPS、P95、错误率、外部依赖时延）。

---

## 2. 版本与命名规范
- 仓库：`LiqPass/`
- 分支：`main`（生产）、`dev`（开发），JP 与 US 各自有 `deploy-*.yml`。
- 语义版本：`major.minor.patch`；接口变更走 `v1 → v2` 路径。
- 目录（顶层）：
  ```
  contracts/   us-backend/   us-frontend/   jp-verify/
  docs/        tests/        scripts/       reports/
  ```

---

## 3. 领域模型（核心实体、关键字段）
> 类型示例：`str`, `int`, `decimal(18,8)`, `bool`, `datetime`, `jsonb`

### 3.1 账户与密钥
- **User**：`id`, `email`, `status`, `createdAt`
- **ApiCredential**（按交易所+账号存密钥，服务端加密）
  - `id`, `userId`, `exchange('okx'|'binance')`, `label`, `encApiKey`, `encSecret`, `encPassphrase`, `uid?`, `createdAt`, `lastVerifiedAt?`，唯一键：`(userId, exchange, label)`

### 3.2 交易与策略
- **Policy**（参数化“赔付工具”）
  - `id`, `userId`, `exchange`, `symbol`, `leverage`, `principalUSD`, `payoutUSD`, `durationHours`, `pricingVersion`, `feeUSD`, `status('active'|'expired'|'claimed')`, `createdAt`, `expiresAt`
- **Order**（购买记录）
  - `id`, `policyId`, `payTxHash?`, `paymentMethod('USDC'|'Permit2')`, `status('pending'|'paid'|'cancelled')`, `createdAt`

### 3.3 验证与证据
- **VerificationJob**（一次验证任务）
  - `id`, `policyId`, `exchange`, `ordId`, `instId`, `trigger('manual'|'webhook'|'schedule')`, `status('queued'|'running'|'succeeded'|'failed')`, `jpTaskId?`, `createdAt`, `finishedAt?`
- **EvidenceBundle**（JP 产物，US 保存摘要）
  - `id`, `jobId`, `evidenceHash(keccak256)`, `jpUrl`, `bytesSize`, `createdAt`
- **MerkleRoot**（JP 汇总）
  - `id`, `root`, `leaves`, `periodStart`, `periodEnd`, `parentRoot?`, `attestedTx?`, `createdAt`

### 3.4 理赔与支付
- **Claim**：`id`, `policyId`, `triggerJobId`, `status('initiated'|'approved'|'rejected'|'paid')`, `reasonCode`, `createdAt`, `decisionAt?`
- **Payout**：`id`, `claimId`, `amountUSD`, `chain('base')`, `toAddress`, `txHash?`, `createdAt`

---

## 4. 状态机（关键约束）
### 4.1 Policy
`draft → active → {expired | claimed}`
- 进入 `claimed` 需存在 `Claim.approved`。

### 4.2 VerificationJob
`queued → running → {succeeded | failed}`
- `succeeded` 需写入 Evidence；失败可重试。

### 4.3 Claim
`initiated → {approved | rejected} → (paid)`
- `approved` 需满足规则：`isLiquidated==true` 且在保障窗口内。

---

## 5. 接口设计（精简但可直接实现）

### 5.1 US Backend（REST, `api/v1`）
**Headers**：`X-Request-Id`, `Idempotency-Key?`

1) **API 密钥管理**
- `POST /api/v1/api-keys` 保存或更新（服务端加密）
  - body: `{exchange, label, apiKey, secretKey, passphrase?, uid?}`
  - resp: `{id, exchange, label, lastVerifiedAt?}`
- `GET /api/v1/api-keys` 列表（仅元数据）

2) **报价与下单**
- `POST /api/v1/quotes` 计算费用
  - body: `{principalUSD, leverage, windowHours, exchange}`
  - resp: `{feeUSD, payoutUSD, pricingVersion}`
- `POST /api/v1/policies` 购买
  - body: `{quoteId, paymentMethod, chain, payTxHash?}`
  - resp: `{policyId, status}`

3) **验证编排（代理 JP）**
- `POST /api/v1/verify`（由 US 代发到 JP）
  - body: `{exchange, ordId, instId, live, noCache, credentialLabel}`
  - resp: `JP /api/verify` 原样（去除任何密钥）＋ `evidenceHash`
- `GET /api/v1/evidence/:jobId` → 302 到 JP 只读链接或返回 `evidenceHash`

4) **理赔与支付**
- `POST /api/v1/claims` `{policyId, triggerJobId}` → `{claimId, status}`
- `POST /api/v1/payouts` `{claimId, toAddress}` → `{txHash}`

5) **透明度**
- `GET /api/v1/transparency/roots` 列出已上链 Merkle root 摘要

**错误码**（统一）：
- `400_VALIDATION`, `401_UNAUTHORIZED`, `403_FORBIDDEN`, `404_NOT_FOUND`, `409_CONFLICT`, `422_SEMANTIC`, `429_RATE_LIMIT`, `500_INTERNAL`, `502_UPSTREAM`, `504_UPSTREAM_TIMEOUT`

### 5.2 JP Verify（FastAPI, `:8082`）
- `GET /healthz` → `{status:'ok'}`
- `POST /api/verify`
  - **Request**（只在 JP 接收密钥；US 调用时用 `credentialLabel` 查询密钥并在 US→JP 时附上密钥）
  ```json
  {
    "exchange": "okx",
    "ordId": "294007103...",
    "instId": "BTC-USDT-SWAP",
    "live": true,
    "fresh": true,
    "noCache": true,
    "apiKey": "...",
    "secretKey": "...",
    "passphrase": "...",
    "uid": "2019..."
  }
  ```
  - **Response**（不回显任何密钥）
  ```json
  {
    "meta": {"exchange":"okx","ordId":"...","instId":"...","verifiedAt":"2025-11-04T09:00:00Z"},
    "normalized": {"status":"filled|canceled|liquidated","side":"buy|sell","avgPx":"...","fillSz":"...","liq":true|false},
    "raw": {"okxOrder": {"...": "原始返回"}},
    "evidence": {"hash":"0x..","leaf": {"..."}, "merkle": {"root":"0x..","index":123}},
    "perf": {"okxLatencyMs": 180, "totalMs": 260}
  }
  ```
- `GET /api/evidence/{ordId}`（或 `{jobId}`） → 返回精简只读 Evidence（不含密钥）
- `POST /api/merkle/rollup`（内部/CRON）→ 生成新 root，返回 `{root, leaves, periodStart, periodEnd}`

**安全**：
- 仅允许 US IP 访问 `/api/*`；`/healthz` 可放开或独立白名单。
- 日志屏蔽密钥字段；磁盘落地前先用 libsodium/age 密封。

---

## 6. 服务内组件与类（关键方法）

### 6.1 JP Verify（Python/FastAPI）
- `OkxClient`
  - `get_order(ord_id, inst_id) -> OkxOrder`
  - `is_liquidated(order) -> bool`
- `VerifierService`
  - `verify(req: VerifyDTO) -> VerifyResult`
  - 组装 normalized、raw、perf
- `EvidenceStore`
  - `persist(jobId, json_bytes) -> (evidenceHash, bytesSize)`
  - `get_by_ordId(ordId)`
- `MerkleTree`
  - `append(hash) -> index`
  - `rollup() -> {root, leaves}`
- `RateLimiter`
  - `allow(key) -> bool`（防交易所限频）

### 6.2 US Backend（Node/Express）
- `ApiKeyService`
  - `store(userId, exchange, label, plaintext) -> id`
  - 加密：`AES-256-GCM`（密钥来自 KMS/ENV），支持旋转
- `VerifyOrchestrator`
  - `start(policyId, ordId, instId, label) -> jobId`
  - `callJP(credentials, payload) -> VerifyResult`
  - 写 `EvidenceBundle`
- `ClaimService`
  - `evaluate(policy, verify) -> {approved, reason}`
  - `payout(claimId, to) -> txHash`
- `TransparencyService`
  - `listRoots()`，监听 JP `rollup` 钩子，触发上链 `attest(root)`

---

## 7. 前端组件规范（最少但好用）
- **ApiSettingsPage**（单页）
  - 表单字段：`exchange(select)`, `label`, `apiKey`, `secretKey`, `passphrase?`, `uid?`
  - 动作：保存（调用 US `/api-keys`）、测试（US `/verify` with `credentialLabel` + 示例 ordId/instId）
- **VerifyPage**（开发辅助页）
  - 字段：`exchange`, `ordId`, `instId`, `credentialLabel`, `live`, `fresh`
  - 展示：`normalized` 卡片 + `raw` 折叠 + `evidenceHash`
- **Orders/Claims**：状态徽章统一色板；日期统一 `YYYY-MM-DD HH:mm UTC`。

表单校验：
- `ordId` 非空、`instId` 匹配 `^[A-Z0-9-]+$`；
- `apiKey/secretKey/passphrase/uid` 长度与字符集校验；
- 保存前本地不持久化密钥（仅发往 US）。

---

## 8. 数据库（SQLite→Postgres）核心 DDL 草案
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, status TEXT, createdAt TEXT
);
CREATE TABLE api_credentials (
  id TEXT PRIMARY KEY, userId TEXT, exchange TEXT, label TEXT,
  encApiKey BLOB, encSecret BLOB, encPassphrase BLOB, uid TEXT,
  createdAt TEXT, lastVerifiedAt TEXT,
  UNIQUE(userId, exchange, label)
);
CREATE INDEX idx_api_user_exchange ON api_credentials(userId, exchange);

CREATE TABLE policies (
  id TEXT PRIMARY KEY, userId TEXT, exchange TEXT, symbol TEXT,
  leverage INTEGER, principalUSD NUMERIC, payoutUSD NUMERIC,
  durationHours INTEGER, pricingVersion TEXT, feeUSD NUMERIC,
  status TEXT, createdAt TEXT, expiresAt TEXT
);

CREATE TABLE verification_jobs (
  id TEXT PRIMARY KEY, policyId TEXT, exchange TEXT, ordId TEXT, instId TEXT,
  trigger TEXT, status TEXT, jpTaskId TEXT, createdAt TEXT, finishedAt TEXT
);
CREATE INDEX idx_vjob_ord ON verification_jobs(ordId);

CREATE TABLE evidence_bundles (
  id TEXT PRIMARY KEY, jobId TEXT, evidenceHash TEXT,
  jpUrl TEXT, bytesSize INTEGER, createdAt TEXT
);

CREATE TABLE merkle_roots (
  id TEXT PRIMARY KEY, root TEXT, leaves INTEGER, parentRoot TEXT,
  periodStart TEXT, periodEnd TEXT, attestedTx TEXT, createdAt TEXT
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY, policyId TEXT, triggerJobId TEXT,
  status TEXT, reasonCode TEXT, createdAt TEXT, decisionAt TEXT
);

CREATE TABLE payouts (
  id TEXT PRIMARY KEY, claimId TEXT, amountUSD NUMERIC,
  chain TEXT, toAddress TEXT, txHash TEXT, createdAt TEXT
);
```

---

## 9. 安全基线
- **密钥**：US 端加密存储；JP 端只接收密钥在内存使用后立即销毁；磁盘 Evidence 不含密钥。
- **网络**：JP `:8082` 仅 US IP 白名单；UFW 默认拒绝；Fail2ban；Mosh 可选。
- **CORS**：前端仅调用 US；US 对外域名白名单；JP 禁止跨域（除 `/healthz`）。
- **审计**：任何下载 Evidence 都记录 `userId`、`jobId`、来源 IP。

---

## 10. 可观测与日志
- 日志字段：`ts, level, requestId, service(us|jp), route, latencyMs, exchange, ordId(*部分掩码*), outcome`
- 指标：`verify_qps`, `verify_p95_ms`, `okx_upstream_err_rate`, `evidence_bytes_total`
- 追踪：`W3C Trace Context` 透传 US→JP。

---

## 11. 测试分层
- **单测**：`OkxClient` 响应解析、`is_liquidated` 判定、`MerkleTree` 一致性。
- **合约测**：`attest(root)` 事件与权限。
- **契约测**：US↔JP 的 DTO JSON Schema 校验；
- **端到端**：伪造/回放真实 `ordId+instId`，期望 Evidence Hash 稳定。

---

## 12. 运行与发布（最少可用）
- JP：`systemd` 托管 uvicorn；开机自启；`/var/log/jp-verify/*.log`。
- US：`pm2` 或 `systemd` 托管 Node；反向代理 Nginx（TLS）。
- 计划任务：JP `rollup` 每 15/60 min 生成 root，US 监听并上链。

---

## 13. 错误与重试规范
- US 对 JP 超时（>10s）→ `504_UPSTREAM_TIMEOUT`，带 `retryAfter`。
- 幂等：`Idempotency-Key` 相同请求返回同一结果。
- JP 限频：`429`，`X-RateLimit-Remaining` 与 `-Reset`。

---

## 14. 字段清单（最常用）
- `ordId`: string（交易所订单ID）
- `instId`: string（如 `BTC-USDT-SWAP`）
- `live/fresh/noCache`: bool（直连实盘/跳缓存）
- `normalized.status`: enum `filled|canceled|liquidated`
- `normalized.liq`: bool（是否爆仓/ADL/强平）
- `evidence.hash`: hex（`keccak256`）
- `merkle.root`: hex；`leaves`: int

---

## 15. 里程碑与验收
1) **M0**：本地前端 + US 代理 `/verify` 通 OKX；JP 返回 Evidence Hash。
2) **M1**：JP rollup + US 上链 `attest(root)`；Transparency 页面展示。
3) **M2**：理赔规则上线（月度回撤、8 小时窗口等），`claim→payout` 闭环。

---

## 16. 附：示例 JSON Schema 片段
```json
{
  "$id": "https://liqpass.io/schemas/jp.verify.v1.json",
  "type": "object",
  "required": ["exchange","ordId","instId","live"],
  "properties": {
    "exchange": {"enum": ["okx","binance"]},
    "ordId": {"type": "string"},
    "instId": {"type": "string"},
    "live": {"type": "boolean"},
    "fresh": {"type": "boolean"},
    "noCache": {"type": "boolean"},
    "apiKey": {"type": "string"},
    "secretKey": {"type": "string"},
    "passphrase": {"type": "string"},
    "uid": {"type": "string"}
  }
}
```

---

### 执行顺序（建议）
1. 在 US 实现 `/api-keys` 与 `/verify`（代理 JP）。
2. 在 JP 实现 `/api/verify`（OKX 单条查询→normalized→evidence）。
3. 前端完成 **ApiSettingsPage** + **VerifyPage**（单页自测）。
4. JP `rollup` + US `attest` + Transparency 简页。

> 以上为 v1 可落地蓝图：先跑通，再迭代扩容（币安、更多 SKU、批量窗口、复杂理赔）。

