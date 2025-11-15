-- LiqPass 赔付上链数据库迁移
-- 创建赔付上链表，记录链上支付详情

-- 赔付上链表（payout_txs）
-- 记录赔付的链上支付详情
CREATE TABLE IF NOT EXISTS payout_txs (
  id TEXT PRIMARY KEY,                   -- ptx_xxx
  claim_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  token TEXT NOT NULL,
  from_addr TEXT NOT NULL,               -- 金库/合约
  to_addr TEXT NOT NULL,                 -- 用户
  amount_min_unit TEXT NOT NULL,
  amount_usdc DECIMAL(20,8) NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',-- pending/confirmed/failed
  block_number TEXT NULL,
  gas_used TEXT NULL,
  effective_gas_price TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  FOREIGN KEY (claim_id) REFERENCES claims(id),
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id)
);

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ptx_tx ON payout_txs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_ptx_claim ON payout_txs(claim_id);
CREATE INDEX IF NOT EXISTS idx_ptx_order ON payout_txs(order_id);
CREATE INDEX IF NOT EXISTS idx_ptx_status ON payout_txs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptx_created ON payout_txs(created_at DESC);

-- 添加注释说明
-- 记录赔付的链上支付，完成后写入 audit_events