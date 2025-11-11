-- 幂等性存储：按 idempotency_key 保存订单响应快照
CREATE TABLE IF NOT EXISTS idempotency_store (
  idempotency_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

