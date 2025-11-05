-- LiqPass 订单支付记录数据库迁移
-- 创建订单支付记录表，支持多支付尝试与对账

-- 订单支付记录表（order_payments）
-- 即使 purchase_orders.payment_tx 已记录，仍建议独立支付表
CREATE TABLE IF NOT EXISTS order_payments (
  id TEXT PRIMARY KEY,                   -- pay_xxx
  order_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,                -- 0x2105(Base)
  token TEXT NOT NULL,                   -- USDC 合约
  from_addr TEXT NOT NULL,               -- 用户地址
  to_addr TEXT NOT NULL,                 -- 金库/合约地址
  amount_min_unit TEXT NOT NULL,         -- 6位精度最小单位字符串
  amount_usdc DECIMAL(20,8) NOT NULL,    -- 便于报表
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',-- pending/confirmed/failed
  block_number TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id)
);

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_op_tx ON order_payments(tx_hash);
CREATE INDEX IF NOT EXISTS idx_op_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_op_status ON order_payments(status);
CREATE INDEX IF NOT EXISTS idx_op_created ON order_payments(created_at DESC);

-- 添加注释说明
-- 支持多支付尝试与对账，记录链上支付详情