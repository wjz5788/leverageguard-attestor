-- LiqPass 购买订单系统数据库迁移
-- 创建购买订单表，与验证系统的orders表区分

-- 购买订单表（purchase_orders）
-- 购买页面（Products/Payment）创建的"保单订单"
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,                                 -- ord_xxx
  user_id TEXT NOT NULL,                               -- 归属用户
  sku_id TEXT NOT NULL,                                -- sku_24h_liq
  principal DECIMAL(20,8) NOT NULL,                    -- 本金（USDT计）
  leverage INTEGER NOT NULL,
  wallet TEXT NOT NULL,                                -- 用户钱包地址（EVM）
  premium_usdc DECIMAL(20,8) NOT NULL,                 -- 保费（2位小数展示，存8位以便对账）
  payout_usdc DECIMAL(20,8) NOT NULL,                  -- 赔付上限
  fee_ratio DECIMAL(20,8) NOT NULL,                    -- 0-1
  payout_ratio DECIMAL(20,8) NOT NULL,                 -- 0-1
  idempotency_key TEXT NOT NULL,                       -- 报价幂等键
  payment_method TEXT NOT NULL,                        -- permit2 / approve_transfer
  payment_tx TEXT NULL,                                -- 支付上链交易哈希（USDC→金库）
  status TEXT NOT NULL DEFAULT 'pending',              -- pending/paid/failed
  quote_expires_at TIMESTAMP NULL,
  coverage_start_at TIMESTAMP NULL,                    -- 可选，若需要覆盖期精确边界
  coverage_end_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_po_idem ON purchase_orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_po_user ON purchase_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_wallet ON purchase_orders(wallet);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- 添加注释说明
-- 映射前端字段：
-- Products.tsx: principal, leverage, feeRatio, payoutRatio, feeUSDC→premium_usdc, payoutUSDC→payout_usdc
-- Payment.tsx: paymentTx → payment_tx，状态变更为 `paid`