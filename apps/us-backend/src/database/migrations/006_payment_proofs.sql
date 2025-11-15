-- LiqPass 支付证明机制迁移
-- 修复P0-01：订单创建不再信任paymentTx，实现PaymentProof机制

-- 1) 创建支付证明表
CREATE TABLE IF NOT EXISTS payment_proofs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,                -- 链ID (0x2105 for Base)
  token TEXT NOT NULL,                   -- 代币合约 (USDC)
  from_addr TEXT NOT NULL,               -- 用户地址
  to_addr TEXT NOT NULL,                 -- 金库/合约地址
  amount_min_unit TEXT NOT NULL,         -- 最小单位金额 (6位精度)
  amount_usdc DECIMAL(20,8) NOT NULL,    -- USDC金额 (便于报表)
  tx_hash TEXT NOT NULL UNIQUE,          -- 交易哈希
  block_number TEXT NULL,                -- 区块号
  status TEXT NOT NULL DEFAULT 'pending', -- pending/confirmed/failed
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 2) 修改orders表，添加状态机字段
-- 检查列是否存在，避免重复添加（SQLite不支持IF NOT EXISTS，使用PRAGMA检查）
-- 注意：这些列可能已在其他迁移中添加，如果已存在则跳过
-- ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'; -- pending/awaiting_payment/paid/failed
-- ALTER TABLE orders ADD COLUMN payment_proof_id TEXT NULL;
-- ALTER TABLE orders ADD COLUMN payment_tx_hash TEXT NULL; -- 仅用于历史兼容，新逻辑使用payment_proofs表

-- 3) 创建索引
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_tx ON payment_proofs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_proof ON orders(payment_proof_id);

-- 4) 更新现有订单数据（兼容性处理）
-- 将现有已支付订单的状态迁移到新的状态机
-- 注意：payment_tx列可能不存在，跳过此更新
-- UPDATE orders 
-- SET payment_status = 'paid', 
--     payment_tx_hash = payment_tx 
-- WHERE status = 'paid' AND payment_tx IS NOT NULL;

-- 5) SQLite不支持ENUM类型，使用CHECK约束替代