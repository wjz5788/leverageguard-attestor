-- LiqPass 赔付申请数据库迁移
-- 创建赔付申请表（新版本），记录审核与状态

-- 赔付申请表（claims）
-- 新版本赔付申请表，与现有claims表区分
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,                   -- clm_xxx
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  eligible BOOLEAN NOT NULL DEFAULT 0,
  payout_amount DECIMAL(20,8) NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  verify_ref TEXT NULL,                  -- 关联 evidence_id/verify_results.id
  status TEXT NOT NULL DEFAULT 'pending',-- pending/in_review/approved/rejected/paid/onchain_failed
  reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_order ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_updated ON claims(updated_at DESC);

-- 添加注释说明
-- 记录审核与状态，与payout_txs表配合使用