-- LiqPass 内存数据持久化迁移
-- 将内存中的 Map 数据迁移到 SQLite 表结构

-- 1) 订单表 (orders) - 替代 orderService 中的 orders Map
-- 基于现有订单结构，适配6位整数金额存储
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  product_id TEXT NOT NULL,
  principal_usdc INTEGER NOT NULL,        -- 6位整数，最小单位
  leverage INTEGER NOT NULL,
  premium_usdc INTEGER NOT NULL,          -- 6位整数，保费
  payout_usdc INTEGER NOT NULL,           -- 6位整数，赔付金额
  duration_hours INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending/paid/active/expired/claimed
  payment_proof_id TEXT,
  evidence_id TEXT,
  claim_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  paid_at TIMESTAMP,
  claimed_at TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (payment_proof_id) REFERENCES payment_proofs(id),
  FOREIGN KEY (claim_id) REFERENCES claims(id)
);

-- 订单索引
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);

-- 2) 报价表 (quotes) - 替代 orderService 中的 quotes Map
-- 报价快照，用于幂等性和历史记录
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  principal_usdc INTEGER NOT NULL,      -- 6位整数
  leverage INTEGER NOT NULL,
  premium_usdc INTEGER NOT NULL,          -- 6位整数
  payout_usdc INTEGER NOT NULL,           -- 6位整数
  fee_rate DECIMAL(10,8) NOT NULL,       -- 费率，如0.001
  params_json TEXT NOT NULL DEFAULT '{}',
  expires_at TIMESTAMP NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT 0,
  consumed_by_order_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (consumed_by_order_id) REFERENCES orders(id)
);

-- 报价索引
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_product ON quotes(product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_quotes_consumed ON quotes(consumed);

-- 3) SKU定义表 (skus) - 替代 orderService 中的 skus Map
-- 产品SKU定义，支持动态配置
CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  leverage_min INTEGER NOT NULL,
  leverage_max INTEGER NOT NULL,
  principal_min_usdc INTEGER NOT NULL,    -- 6位整数
  principal_max_usdc INTEGER NOT NULL,    -- 6位整数
  duration_hours INTEGER NOT NULL,
  fee_rate DECIMAL(10,8) NOT NULL,
  payout_rate DECIMAL(10,8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active/inactive
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- SKU索引
CREATE INDEX IF NOT EXISTS idx_skus_product ON skus(product_id);
CREATE INDEX IF NOT EXISTS idx_skus_code ON skus(code);
CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status);

-- 4) 幂等键表 (idempotency_keys) - 替代 orderService 中的 idempotencyIndex
-- 用于API幂等性控制
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL, -- 'quote'|'order'|'claim'|'payout'
  request_hash TEXT,
  response_data TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- 幂等键索引
CREATE INDEX IF NOT EXISTS idx_idempotency_scope ON idempotency_keys(scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 5) 订单引用索引表 (order_references) - 替代 orderService 中的 orderRefIndex
-- 外部订单引用到内部订单ID的映射
CREATE TABLE IF NOT EXISTS order_references (
  external_ref TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  ref_type TEXT NOT NULL, -- 'payment_proof'|'contract_event'|'api'
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 订单引用索引
CREATE INDEX IF NOT EXISTS idx_order_refs_order ON order_references(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refs_type ON order_references(ref_type);

-- 6) 理赔表增强 (claims) - 适配现有claimsService的ClaimRecord结构
-- 扩展原有claims表，支持完整的理赔流程
ALTER TABLE claims ADD COLUMN IF NOT EXISTS claim_type TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS amount_usdc INTEGER; -- 6位整数，替代payout_amount
ALTER TABLE claims ADD COLUMN IF NOT EXISTS evidence_files TEXT; -- JSON数组
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS payout_status TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS payout_at TIMESTAMP;

-- 7) 支付证明表增强 (payment_proofs) - 适配现有PaymentProofService
-- 扩展原有payment_proofs表，支持完整的支付验证流程
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS from_addr TEXT;
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS to_addr TEXT;
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS chain_id TEXT;
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS validation_error TEXT;

-- 8) 合约事件表增强 (contract_events) - 适配现有内存结构
-- 扩展原有contract_events表，支持更完整的事件处理
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS contract_address TEXT;
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS buyer_address TEXT;
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS amount_usdc INTEGER; -- 6位整数，替代amount
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS quote_id TEXT;
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE contract_events ADD COLUMN IF NOT EXISTS processed_error TEXT;

-- 添加注释
COMMENT ON TABLE orders IS '订单主表，替代内存中的orders Map，支持6位整数金额存储';
COMMENT ON TABLE quotes IS '报价快照表，替代内存中的quotes Map，支持幂等性和历史记录';
COMMENT ON TABLE skus IS 'SKU定义表，替代内存中的skus Map，支持动态产品配置';
COMMENT ON TABLE idempotency_keys IS '幂等键表，替代内存中的idempotencyIndex，用于API幂等性控制';
COMMENT ON TABLE order_references IS '订单引用索引表，替代内存中的orderRefIndex，支持外部引用映射';