-- API 密钥安全修复迁移
-- 为 api_keys 表新增密钥片段哈希与前缀，并为 key_id 创建索引

ALTER TABLE api_keys ADD COLUMN key_id TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN secret_fragment_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN secret_prefix TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_api_keys_key_id ON api_keys(key_id);
