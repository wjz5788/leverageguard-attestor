-- LiqPass 审计事件数据库迁移
-- 创建审计事件表，统一事件流供透明度页与离线对账

-- 审计事件表（audit_events）
-- 统一事件流，供透明度页与离线对账
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,                    -- evt_xxx
  event_type TEXT NOT NULL,               -- purchase/claim_paid/reserve_topup/verify_pass/verify_fail...
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  order_id TEXT NULL,
  claim_id TEXT NULL,
  evidence_id TEXT NULL,
  chain_id TEXT NULL,
  tx_hash TEXT NULL,
  amount_usdc DECIMAL(20,8) NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_evt_type_ts ON audit_events(event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_evt_order ON audit_events(order_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_evt_claim ON audit_events(claim_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_evt_tx ON audit_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_evt_ts ON audit_events(ts DESC);

-- 添加注释说明
-- 统一事件流，供透明度页与离线对账
-- 事件类型包括：purchase, claim_paid, reserve_topup, verify_pass, verify_fail 等