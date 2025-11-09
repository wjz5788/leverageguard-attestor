-- LiqPass M0-02: API 密钥保管系统迁移
-- 创建 api_keys 表用于存储加密的API密钥

-- API密钥表 (api_keys)
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

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_api_keys_user_exchange_alias ON api_keys(user_id, exchange, key_alias);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_exchange ON api_keys(exchange);