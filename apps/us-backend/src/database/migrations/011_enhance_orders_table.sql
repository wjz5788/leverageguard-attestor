-- LiqPass 订单表增强迁移
-- 补全orders表必要字段和唯一索引，支持完整的内存到数据库迁移

-- 1) 添加缺失的关键字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'permit2';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pair TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_ratio DECIMAL(10,8) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_ratio DECIMAL(10,8) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMP;

-- 2) 添加唯一索引，支持幂等性控制
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency 
ON orders(wallet_address, payment_proof_id) 
WHERE payment_proof_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_ref 
ON orders(wallet_address, order_ref) 
WHERE order_ref IS NOT NULL;

-- 3) 添加复合索引，优化查询性能
CREATE INDEX IF NOT EXISTS idx_orders_wallet_status 
ON orders(wallet_address, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_premium_status 
ON orders(premium_usdc, status, created_at DESC);

-- 4) 添加约束，确保数据完整性
-- 确保金额字段为正数
CREATE TRIGGER IF NOT EXISTS trigger_orders_amount_positive
BEFORE INSERT ON orders
FOR EACH ROW
WHEN NEW.principal_usdc <= 0 OR NEW.premium_usdc <= 0 OR NEW.payout_usdc <= 0
BEGIN
    SELECT RAISE(ABORT, 'Amount values must be positive');
END;

-- 确保状态转换有效
CREATE TRIGGER IF NOT EXISTS trigger_orders_status_valid
BEFORE UPDATE ON orders
FOR EACH ROW
WHEN NEW.status NOT IN ('pending', 'paid', 'active', 'expired', 'claimed')
BEGIN
    SELECT RAISE(ABORT, 'Invalid status value');
END;

-- 5) 添加注释说明
COMMENT ON COLUMN orders.payment_status IS '支付状态：pending/paid/failed';
COMMENT ON COLUMN orders.payment_method IS '支付方式：permit2/approve_transfer';
COMMENT ON COLUMN orders.exchange IS '交易所标识';
COMMENT ON COLUMN orders.pair IS '交易对标识';
COMMENT ON COLUMN orders.fee_ratio IS '费率比例';
COMMENT ON COLUMN orders.payout_ratio IS '赔付比例';
COMMENT ON COLUMN orders.quote_expires_at IS '报价过期时间';

-- 6) 验证迁移结果
-- 检查所有必需字段是否存在
SELECT 
    COUNT(*) as missing_columns
FROM pragma_table_info('orders') 
WHERE name IN ('payment_status', 'payment_method', 'exchange', 'pair', 'fee_ratio', 'payout_ratio', 'quote_expires_at')
HAVING COUNT(*) < 6;

-- 检查索引是否创建成功
SELECT 
    COUNT(*) as missing_indexes
FROM sqlite_master 
WHERE type = 'index' AND name IN ('idx_orders_idempotency', 'idx_orders_external_ref', 'idx_orders_wallet_status', 'idx_orders_premium_status')
HAVING COUNT(*) < 4;