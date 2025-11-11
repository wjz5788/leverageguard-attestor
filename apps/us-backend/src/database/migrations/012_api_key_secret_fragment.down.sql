-- 回滚 API 密钥安全修复迁移

DROP INDEX IF EXISTS idx_api_keys_key_id;

ALTER TABLE api_keys DROP COLUMN secret_prefix;
ALTER TABLE api_keys DROP COLUMN secret_fragment_hash;
ALTER TABLE api_keys DROP COLUMN key_id;
