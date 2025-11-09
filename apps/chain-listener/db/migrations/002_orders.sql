CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  sku TEXT,
  leverage INTEGER,
  margin_usd REAL,
  premium_usdc TEXT,
  quote_digest TEXT,
  payer TEXT,
  tx_hash TEXT,
  log_index INTEGER,
  block_number INTEGER,
  paid_amount_usdc TEXT,
  paid_token TEXT,
  treasury TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_tx ON orders(tx_hash, log_index) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_id ON orders(id);
