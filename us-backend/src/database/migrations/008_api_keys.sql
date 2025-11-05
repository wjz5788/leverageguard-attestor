-- LiqPass M0-02: API 密钥保管系统迁移
-- 创建 api_keys 表用于存储加密的API密钥

-- API密钥表 (api_keys)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('okx')), -- 目前只支持okx
  api_key_id TEXT, -- 可选，API密钥ID
  api_key_enc TEXT NOT NULL, -- AES-GCM加密的API密钥
  secret_enc TEXT NOT NULL, -- AES-GCM加密的Secret密钥
  passphrase_enc TEXT NOT NULL, -- AES-GCM加密的Passphrase
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'verified', 'invalid')),
  last_verified_at TIMESTAMP, -- 最后验证时间
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 确保每个用户每个交易所只有一条记录
  UNIQUE(user_id, exchange)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_exchange ON api_keys(exchange);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_verified ON api_keys(last_verified_at);