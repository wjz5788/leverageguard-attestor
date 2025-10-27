-- LiqPass 数据库初始迁移
-- 创建四个核心表：exchange_accounts, api_secrets, exchange_account_verifications, exchange_account_logs

-- 1) 账户表
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  label TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'live',
  status TEXT NOT NULL,
  last_verified_at TIMESTAMP NULL,
  exchange_uid TEXT NULL,
  sub_account TEXT NULL,
  account_type TEXT NULL,
  caps_json TEXT NOT NULL DEFAULT '{}',
  masked_api_key_last4 TEXT NULL,
  secret_ref TEXT NULL,
  user_confirmed_echo BOOLEAN NOT NULL DEFAULT false,
  ip_whitelist TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

-- 2) 密钥表（加密区）
CREATE TABLE IF NOT EXISTS api_secrets (
  id TEXT PRIMARY KEY,
  enc_api_key BLOB NOT NULL,
  enc_api_secret BLOB NOT NULL,
  enc_passphrase BLOB NULL,
  enc_extra_json BLOB NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3) 验证记录（不可变快照）
CREATE TABLE IF NOT EXISTS exchange_account_verifications (
  id TEXT PRIMARY KEY,
  exchange_account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  caps_json TEXT NOT NULL,
  order_json TEXT NULL,
  checks_json TEXT NULL,
  liquidation_json TEXT NULL,
  proof_echo_json TEXT NULL,
  proof_hash TEXT NULL,
  reasons_json TEXT NULL,
  session_id TEXT NOT NULL,
  latency_ms INTEGER NULL,
  verifier_version TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exchange_account_id) REFERENCES exchange_accounts(id)
);

-- 4) 运行日志
CREATE TABLE IF NOT EXISTS exchange_account_logs (
  id TEXT PRIMARY KEY,
  exchange_account_id TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_sample_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exchange_account_id) REFERENCES exchange_accounts(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ea_user ON exchange_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ea_status ON exchange_accounts(status);
CREATE INDEX IF NOT EXISTS idx_eav_eacc ON exchange_account_verifications(exchange_account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_eav_session ON exchange_account_verifications(session_id);
CREATE INDEX IF NOT EXISTS idx_eal_eacc ON exchange_account_logs(exchange_account_id, created_at DESC);