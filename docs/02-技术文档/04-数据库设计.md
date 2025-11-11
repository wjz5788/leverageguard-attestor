# LiqPass 数据库 Schema v1.1（修订版：最小闭环＋证据/Merkle/理赔）

> 面向 **SQLite（开发）→ Postgres（生产）**。秉持“最小闭环、证据可审计、字段可演进”的设计。本文兼容你现稿，补齐缺失的 **Policy/Verification/Evidence/Merkle/Payout** 关键域，并提供“保守沿用版”与“规范版”两套走法。

---

## 0. 约定
- 标识：业务侧统一使用 `*_uid`（可为 ULID/UUIDv7），表内自增 `id` 仅作行标识。
- 时间：均用 UTC ISO8601，列名 `*_at`。
- 金额：`DECIMAL(18,8)`（SQLite 存为 NUMERIC/TEXT）；若迁移 Postgres，可改 `NUMERIC(18,8)`。
- JSON：SQLite 中为 `TEXT` 且值为 JSON 字符串；Postgres 用 `JSONB`。
- 外键：默认 `ON DELETE CASCADE`，除系统配置、审计等保留链路外。

---

## 1. 基础表（沿用并加固）

### 1.1 用户表 users（沿用）
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,               -- 业务外显ID（ULID/UUID）
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,               -- Argon2id/BCrypt 哈希
  status TEXT NOT NULL DEFAULT 'active',     -- active|inactive|suspended
  role TEXT NOT NULL DEFAULT 'user',         -- user|admin|super_admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);
```
> **建议**：增加 CHECK 约束（Postgres 可用），并为 `updated_at` 建触发器，见文末“通用触发器”。

### 1.2 API 凭据表 api_credentials（替代 api_keys，安全版）
```sql
CREATE TABLE IF NOT EXISTS api_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'okx',      -- okx|binance
  label TEXT NOT NULL,                       -- 用户自定义别名（要求非空）
  key_mode TEXT NOT NULL DEFAULT 'inline',   -- inline|alias（预留）
  enc_api_key BLOB NOT NULL,                 -- AES-256-GCM 密文
  enc_secret  BLOB NOT NULL,
  enc_passphrase BLOB,                       -- OKX 专有
  uid TEXT,                                  -- OKX subaccount 等
  key_version INTEGER NOT NULL DEFAULT 1,    -- KMS/ENV 版本号
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT uq_api_credentials UNIQUE (user_id, exchange, label)
);
CREATE INDEX IF NOT EXISTS idx_api_user_exchange ON api_credentials(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_api_active         ON api_credentials(is_active);
```
> **兼容**：若你已有 `api_keys` 明文列，可先并存；迁移时批量加密写入上述三列后移除明文字段。

### 1.3 审计日志 audit_logs（沿用）
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,                      -- 操作类型
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  details TEXT,                              -- JSON 字符串
  status_code INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource  ON audit_logs(resource_type, resource_id);
```

### 1.4 系统配置 system_configs（沿用）
```sql
CREATE TABLE IF NOT EXISTS system_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_type TEXT NOT NULL DEFAULT 'string', -- string|number|boolean|json
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_syscfg_key ON system_configs(config_key);
```

### 1.5 黑名单 blacklist（沿用）
```sql
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                        -- ip|user|api_key|order
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_blacklist_type_value ON blacklist(type, value);
CREATE INDEX IF NOT EXISTS idx_blacklist_expires    ON blacklist(expires_at);
```

---

## 2. 业务主线表（新增/重命名）

> 将“交易所订单”与“用户购买的保障 Policy”分离，避免歧义；验证与证据可重放且可审计；Merkle 汇总便于上链 attestation。

### 2.1 保障单（Policy）
```sql
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_uid TEXT UNIQUE NOT NULL,           -- 外显ID（ULID/UUID）
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,                    -- okx|binance
  symbol TEXT NOT NULL,                      -- BTC-USDT-SWAP 等
  leverage INTEGER NOT NULL,
  principal_usd DECIMAL(18,8) NOT NULL,
  payout_usd DECIMAL(18,8) NOT NULL,
  duration_hours INTEGER NOT NULL,
  pricing_version TEXT NOT NULL,
  fee_usd DECIMAL(18,8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',     -- draft|active|expired|claimed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_policies_user    ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_status  ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_expire  ON policies(expires_at);
```

### 2.2 交易所订单表（exchange_orders）——原 orders 建议改名
```sql
CREATE TABLE IF NOT EXISTS exchange_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,                    -- 交易所订单ID
  exchange TEXT NOT NULL DEFAULT 'okx',
  instrument_id TEXT NOT NULL,               -- instId
  user_id TEXT NOT NULL,
  api_credential_id INTEGER NOT NULL,
  side TEXT NOT NULL,                        -- buy|sell
  size DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  ts DATETIME NOT NULL,                      -- 交易所时间
  liquidated BOOLEAN NOT NULL DEFAULT FALSE,
  liquidation_price DECIMAL(18,8),
  margin_ratio DECIMAL(10,4),
  leverage INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending|verified|failed
  normalized_json TEXT NOT NULL,             -- JSON 字符串
  raw_json TEXT NOT NULL,                    -- JSON 字符串
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  UNIQUE (exchange, order_id),               -- 跨交易所去重
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (api_credential_id) REFERENCES api_credentials(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_exo_user           ON exchange_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_exo_instrument     ON exchange_orders(instrument_id);
CREATE INDEX IF NOT EXISTS idx_exo_status         ON exchange_orders(status);
CREATE INDEX IF NOT EXISTS idx_exo_liq            ON exchange_orders(liquidated);
CREATE INDEX IF NOT EXISTS idx_exo_ts             ON exchange_orders(ts);
```
> **兼容路径**：若你暂不改名，可保留 `orders` 表名并按该字段集实现；但后续建议统一为 `exchange_orders`。

### 2.3 验证作业（verification_jobs）
```sql
CREATE TABLE IF NOT EXISTS verification_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_uid TEXT UNIQUE NOT NULL,
  policy_uid TEXT,                            -- 可为空（纯验证也可）
  exchange TEXT NOT NULL,
  order_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  trigger TEXT NOT NULL,                      -- manual|webhook|schedule
  status TEXT NOT NULL DEFAULT 'queued',      -- queued|running|succeeded|failed
  jp_task_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (policy_uid) REFERENCES policies(policy_uid) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_vjobs_order   ON verification_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_vjobs_status  ON verification_jobs(status);
```

### 2.4 证据包（evidence_bundles）
```sql
CREATE TABLE IF NOT EXISTS evidence_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_uid TEXT UNIQUE NOT NULL,
  job_uid TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,                -- keccak256(归档字节)
  storage_url TEXT,                           -- JP 只读链接或相对路径
  bytes_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_uid) REFERENCES verification_jobs(job_uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evi_job ON evidence_bundles(job_uid);
CREATE INDEX IF NOT EXISTS idx_evi_hash ON evidence_bundles(evidence_hash);
```

### 2.5 Merkle 汇总与上链（merkle_roots）
```sql
CREATE TABLE IF NOT EXISTS merkle_roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root TEXT UNIQUE NOT NULL,
  leaves INTEGER NOT NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  parent_root TEXT,
  attested_tx TEXT,                           -- 上链交易哈希
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mrk_period ON merkle_roots(period_start, period_end);
```

### 2.6 理赔与支付（claims / payouts）
```sql
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_uid TEXT UNIQUE NOT NULL,
  policy_uid TEXT NOT NULL,                   -- 由哪个保障单触发
  trigger_job_uid TEXT NOT NULL,              -- 对应的验证作业
  status TEXT NOT NULL DEFAULT 'pending',     -- pending|approved|rejected|paid
  reason_code TEXT,                           -- 规则/拒赔原因码
  amount_usd DECIMAL(18,8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  risk_level TEXT NOT NULL DEFAULT 'low',     -- low|medium|high
  risk_score DECIMAL(5,2) DEFAULT 0.0,
  evidence_uid TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  decision_at DATETIME,
  paid_at DATETIME,
  FOREIGN KEY (policy_uid) REFERENCES policies(policy_uid) ON DELETE CASCADE,
  FOREIGN KEY (trigger_job_uid) REFERENCES verification_jobs(job_uid) ON DELETE CASCADE,
  FOREIGN KEY (evidence_uid) REFERENCES evidence_bundles(evidence_uid) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_claims_policy  ON claims(policy_uid);
CREATE INDEX IF NOT EXISTS idx_claims_status  ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_uid TEXT UNIQUE NOT NULL,
  claim_uid TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  to_address TEXT NOT NULL,
  amount_usd DECIMAL(18,8) NOT NULL,
  tx_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_uid) REFERENCES claims(claim_uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payouts_claim ON payouts(claim_uid);
CREATE INDEX IF NOT EXISTS idx_payouts_tx    ON payouts(tx_hash);
```

### 2.7 幂等键（idempotency_keys）
```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  scope TEXT,                                 -- e.g. payouts:create
  request_hash TEXT,
  response_hash TEXT
);
```

---

## 3. 视图与查询（便于后台/透明页）
```sql
-- 最近24小时验证失败明细
CREATE VIEW IF NOT EXISTS vw_failed_verifications AS
SELECT v.job_uid, v.exchange, v.order_id, v.instrument_id, v.finished_at
FROM verification_jobs v
WHERE v.status = 'failed' AND v.finished_at >= datetime('now', '-1 day');

-- 每周期 Merkle 摘要（含上链）
CREATE VIEW IF NOT EXISTS vw_merkle_summary AS
SELECT root, leaves, period_start, period_end, attested_tx
FROM merkle_roots
ORDER BY period_end DESC;
```

---

## 4. 触发器（SQLite 示例）
```sql
-- 通用 updated_at 触发器示例（给 policies，其他表可仿制）
CREATE TRIGGER IF NOT EXISTS trg_policies_updated_at
AFTER UPDATE ON policies
FOR EACH ROW BEGIN
  UPDATE policies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

---

## 5. 迁移策略
- **优先创建**：`policies / verification_jobs / evidence_bundles / merkle_roots / claims / payouts / idempotency_keys`。
- **兼容改名**：现有 `orders` → `exchange_orders`（或保持不改，只需字段对齐）。
- **安全迁移**：将 `api_keys` 明文迁往 `api_credentials` 的加密列；完成后删除明文字段/表。
- **回滚**：每个迁移文件含 up/down；命名 `{timestamp}_{desc}.sql`。

---

## 6. Postgres 差异建议
- 将 JSON 字段改 `JSONB`，并建立 GIN 索引（如 `CREATE INDEX ... ON ... USING GIN (normalized_json)`）。
- 增加 CHECK 约束限制枚举值；用 `GENERATED ALWAYS AS IDENTITY` 代替 AUTOINCREMENT。
- 用 `NUMERIC(18,8)` 存金额；必要时通过 `money`/`bigint` 分 = 1e-6 USD 存储以避免精度风险。

---

## 7. 初始配置样例（沿用并扩展）
```sql
INSERT OR IGNORE INTO system_configs (config_key, config_value, config_type, description, is_public) VALUES
('risk_control_enabled', 'true',  'boolean', '风控开关', true),
('max_leverage',         '100',   'number',  '最大杠杆倍数', true),
('min_claim_amount',     '10',    'number',  '最小赔付金额', true),
('claim_waiting_period', '24',    'number',  '赔付等待期（小时）', true),
('api_rate_limit',       '100',   'number',  'API调用频率限制', false),
('evidence_retention_days','365', 'number',  '证据保留天数', false);
```

---

## 8. 设计要点对齐你现稿的差异
- **把 Evidence 从订单里分离**：`exchange_orders` 只放归一/原始数据，证据归档与哈希进入 `evidence_bundles`，确保可审计、可复算。
- **引入 VerificationJob**：每次验证都是可追踪任务，便于重试与幂等；`job_uid` 串起 JP `task_id` 与 Evidence。
- **补齐 Merkle**：`merkle_roots` 支撑“透明度页 + 上链 attestation”。
- **理赔改为 Policy 归属**：`claims` 绑定 `policy_uid` 与 `trigger_job_uid`，而不是直接绑交易所订单，避免规则演进时的耦合。
- **API 密钥加密**：移除明文列，加入 `key_version` 以支持密钥轮换。

---

## 9. 快速落地顺序
1. 新建：`policies / verification_jobs / evidence_bundles / merkle_roots / claims / payouts / idempotency_keys`。
2. 将 `orders` 对齐为 **exchange_orders** 字段集（可重命名或直接新表迁移）。
3. 新建 `api_credentials` 并接入加密读写；逐步停用 `api_keys` 明文。
4. 为高频查询建索引：`(exchange, order_id)`、`user_id`、`status`、`period_end` 等。
5. 加上 `updated_at` 触发器，完善备份与 VACUUM/ANALYZE 例行任务。

