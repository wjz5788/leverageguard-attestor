-- LiqPass 验证系统数据库迁移
-- 创建订单验证、赔付申请和审计日志表

-- 1) 用户表（最小化）
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) API 密钥表（加密存储）
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  key_alias TEXT NOT NULL,
  enc_payload BLOB NOT NULL, -- 加密存储 {apiKey,secretKey,passphrase,uid}
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3) 订单验证记录表
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  ord_id TEXT NOT NULL,
  inst_id TEXT NOT NULL,
  verified_at TIMESTAMP NOT NULL,
  liquidated BOOLEAN NOT NULL,
  reason TEXT NULL,
  evidence_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 4) 赔付申请表
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ord_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, paid
  payout_amount DECIMAL(15,8) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 5) 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL, -- verify_order, create_claim, etc.
  ref_id TEXT NOT NULL, -- order_id, claim_id, etc.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_user_verified ON orders(user_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_exchange_ord ON orders(exchange, ord_id);
CREATE INDEX IF NOT EXISTS idx_orders_liquidated ON orders(liquidated, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_evidence ON orders(evidence_id);

CREATE INDEX IF NOT EXISTS idx_claims_user_status ON claims(user_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_ord ON claims(ord_id);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_topic_ref ON audit_logs(topic, ref_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 创建唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS uniq_api_keys_user_exchange_alias ON api_keys(user_id, exchange, key_alias);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_exchange_ord ON orders(exchange, ord_id);

-- 插入默认用户（用于本地测试）
INSERT OR IGNORE INTO users (id) VALUES ('local-test-user');