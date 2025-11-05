-- LiqPass M1: SKU & 报价系统迁移
-- 创建 products 和 quotes 表

-- 1) 产品表 (products)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 'DAY24','H8','MDD','NO-LIQ'
  title TEXT NOT NULL,
  terms_version TEXT NOT NULL DEFAULT '1.0',
  payout_type TEXT NOT NULL CHECK (payout_type IN ('fixed', 'ratio')), -- 'fixed'|'ratio'
  payout_value REAL NOT NULL,
  window_hours INTEGER NOT NULL,
  leverage_min REAL NOT NULL,
  leverage_max REAL NOT NULL,
  principal_min REAL NOT NULL,
  principal_max REAL NOT NULL,
  base_load REAL NOT NULL DEFAULT 0.1, -- 基础负载率
  op_fee REAL NOT NULL DEFAULT 0.001, -- 操作费用
  probability REAL NOT NULL DEFAULT 0.05, -- 概率（配置值）
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) 报价表 (quotes)
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  principal REAL NOT NULL,
  leverage REAL NOT NULL,
  premium REAL NOT NULL,
  payout REAL NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_product ON quotes(product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);

-- 插入默认产品数据（如果不存在）
INSERT OR IGNORE INTO products (
  id, code, title, payout_type, payout_value, window_hours, 
  leverage_min, leverage_max, principal_min, principal_max, base_load, op_fee, probability
) VALUES 
(
  'prod_day24', 'DAY24', '24小时保险', 'fixed', 1000, 24,
  1.0, 10.0, 100, 10000, 0.1, 0.001, 0.05
),
(
  'prod_h8', 'H8', '8小时保险', 'fixed', 500, 8,
  1.0, 8.0, 50, 5000, 0.08, 0.001, 0.03
),
(
  'prod_mdd', 'MDD', '最大回撤保险', 'ratio', 0.1, 24,
  1.0, 5.0, 100, 10000, 0.12, 0.001, 0.02
),
(
  'prod_noliq', 'NO-LIQ', '防清算保险', 'fixed', 2000, 24,
  1.0, 20.0, 200, 20000, 0.15, 0.001, 0.01
);