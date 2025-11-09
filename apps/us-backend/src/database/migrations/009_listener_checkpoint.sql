-- 链监听 checkpoint 表：记录最近处理的区块号
CREATE TABLE IF NOT EXISTS chain_listener (
  id TEXT PRIMARY KEY,
  last_processed_block INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

