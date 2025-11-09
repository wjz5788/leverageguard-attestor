CREATE TABLE IF NOT EXISTS unmatched_payments (
  id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  order_id TEXT,
  payer TEXT,
  token TEXT,
  treasury TEXT,
  amount TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_unmatched_block ON unmatched_payments(block_number);
