-- LiqPass 报价快照数据库迁移（可选）
-- 创建报价快照表，如需持久化报价（而非内存 Map）

-- 报价快照表（order_quotes）
-- 可选表，如需持久化报价而非内存 Map
CREATE TABLE IF NOT EXISTS order_quotes (
  idempotency_key TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL,
  principal DECIMAL(20,8) NOT NULL,
  leverage INTEGER NOT NULL,
  fee_ratio DECIMAL(20,8) NOT NULL,
  payout_ratio DECIMAL(20,8) NOT NULL,
  premium_usdc DECIMAL(20,8) NOT NULL,
  payout_usdc DECIMAL(20,8) NOT NULL,
  wallet TEXT NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_oq_wallet ON order_quotes(wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oq_created ON order_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oq_expires ON order_quotes(expires_at);

-- 添加注释说明
-- 可选表，如需持久化报价而非内存 Map
-- 可用于报价幂等性验证和报价历史查询