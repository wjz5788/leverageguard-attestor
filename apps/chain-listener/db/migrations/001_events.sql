PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS chain_cursor (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  last_block INTEGER NOT NULL
);
INSERT OR IGNORE INTO chain_cursor (id, last_block) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS premium_paid (
  id TEXT PRIMARY KEY,            
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  order_id TEXT,
  payer TEXT,
  token TEXT,
  treasury TEXT,
  amount TEXT,
  raw_args_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pp_block ON premium_paid(block_number);
