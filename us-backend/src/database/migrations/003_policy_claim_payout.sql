-- Schema v1.1 补充：Policy / Exchange Orders / Verification / Evidence / Merkle / Claims_v2 / Payouts / Idempotency
-- 适配现有 users(id TEXT PRIMARY KEY) 与 SQLite 方言

-- 1) 安全版 API 凭据（加密存储）
CREATE TABLE IF NOT EXISTS api_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'okx',
  label TEXT NOT NULL,
  key_mode TEXT NOT NULL DEFAULT 'inline',
  enc_api_key BLOB NOT NULL,
  enc_secret  BLOB NOT NULL,
  enc_passphrase BLOB,
  uid TEXT,
  key_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_api_credentials UNIQUE (user_id, exchange, label)
);
CREATE INDEX IF NOT EXISTS idx_api_user_exchange ON api_credentials(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_api_active         ON api_credentials(is_active);

-- 2) 保障单（Policy）
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_uid TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  leverage INTEGER NOT NULL,
  principal_usd DECIMAL(18,8) NOT NULL,
  payout_usd DECIMAL(18,8) NOT NULL,
  duration_hours INTEGER NOT NULL,
  pricing_version TEXT NOT NULL,
  fee_usd DECIMAL(18,8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_policies_user    ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_status  ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_expire  ON policies(expires_at);

-- 3) 交易所订单（归一数据）
CREATE TABLE IF NOT EXISTS exchange_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'okx',
  instrument_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  api_credential_id INTEGER,
  side TEXT NOT NULL,
  size DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  ts DATETIME NOT NULL,
  liquidated BOOLEAN NOT NULL DEFAULT 0,
  liquidation_price DECIMAL(18,8),
  margin_ratio DECIMAL(10,4),
  leverage INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  normalized_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  UNIQUE (exchange, order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (api_credential_id) REFERENCES api_credentials(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_exo_user       ON exchange_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_exo_instrument ON exchange_orders(instrument_id);
CREATE INDEX IF NOT EXISTS idx_exo_status     ON exchange_orders(status);
CREATE INDEX IF NOT EXISTS idx_exo_liq        ON exchange_orders(liquidated);
CREATE INDEX IF NOT EXISTS idx_exo_ts         ON exchange_orders(ts);

-- 4) 验证作业
CREATE TABLE IF NOT EXISTS verification_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_uid TEXT UNIQUE NOT NULL,
  policy_uid TEXT,
  exchange TEXT NOT NULL,
  order_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  jp_task_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (policy_uid) REFERENCES policies(policy_uid) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_vjobs_order   ON verification_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_vjobs_status  ON verification_jobs(status);

-- 5) 证据包
CREATE TABLE IF NOT EXISTS evidence_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_uid TEXT UNIQUE NOT NULL,
  job_uid TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  storage_url TEXT,
  bytes_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_uid) REFERENCES verification_jobs(job_uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evi_job  ON evidence_bundles(job_uid);
CREATE INDEX IF NOT EXISTS idx_evi_hash ON evidence_bundles(evidence_hash);

-- 6) Merkle 汇总与上链
CREATE TABLE IF NOT EXISTS merkle_roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root TEXT UNIQUE NOT NULL,
  leaves INTEGER NOT NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  parent_root TEXT,
  attested_tx TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mrk_period ON merkle_roots(period_start, period_end);

-- 7) 理赔与支付
CREATE TABLE IF NOT EXISTS claims_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_uid TEXT UNIQUE NOT NULL,
  policy_uid TEXT NOT NULL,
  trigger_job_uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason_code TEXT,
  amount_usd DECIMAL(18,8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  risk_level TEXT NOT NULL DEFAULT 'low',
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
CREATE INDEX IF NOT EXISTS idx_claims_v2_policy  ON claims_v2(policy_uid);
CREATE INDEX IF NOT EXISTS idx_claims_v2_status  ON claims_v2(status);
CREATE INDEX IF NOT EXISTS idx_claims_v2_created ON claims_v2(created_at);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_uid TEXT UNIQUE NOT NULL,
  claim_uid TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  to_address TEXT NOT NULL,
  amount_usd DECIMAL(18,8) NOT NULL,
  tx_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_uid) REFERENCES claims_v2(claim_uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payouts_claim ON payouts(claim_uid);
CREATE INDEX IF NOT EXISTS idx_payouts_tx    ON payouts(tx_hash);

-- 8) 幂等键
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  scope TEXT,
  request_hash TEXT,
  response_hash TEXT
);

