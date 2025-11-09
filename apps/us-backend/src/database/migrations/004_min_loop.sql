-- 指令页面/8页面.md 最小闭环：api_accounts / verify_requests / verify_results / evidence_blobs

-- 1) 基础表
CREATE TABLE IF NOT EXISTS api_accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL,
  exchange         TEXT NOT NULL CHECK (exchange IN ('okx','binance')),
  label            TEXT NOT NULL,
  api_key          TEXT NOT NULL,
  secret_enc       TEXT NOT NULL,
  passphrase_enc   TEXT,
  status           TEXT NOT NULL DEFAULT 'ready',
  last_verified_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, exchange, label)
);

CREATE TABLE IF NOT EXISTS verify_requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL,
  account_id       INTEGER NOT NULL REFERENCES api_accounts(id) ON DELETE CASCADE,
  exchange         TEXT NOT NULL CHECK (exchange IN ('okx','binance')),
  ord_id           TEXT NOT NULL,
  inst_id          TEXT NOT NULL,
  live             INTEGER NOT NULL DEFAULT 1,
  fresh            INTEGER NOT NULL DEFAULT 1,
  no_cache         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  error_msg        TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS verify_results (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id       INTEGER NOT NULL UNIQUE REFERENCES verify_requests(id) ON DELETE CASCADE,
  normalized_json  TEXT NOT NULL,
  raw_json         TEXT NOT NULL,
  meta_json        TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS evidence_blobs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id       INTEGER NOT NULL UNIQUE REFERENCES verify_requests(id) ON DELETE CASCADE,
  root             TEXT NOT NULL,
  parent_root      TEXT,
  leaves_count     INTEGER NOT NULL,
  evidence_json    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS idx_api_accounts_user_exchange ON api_accounts(user_id, exchange);
CREATE INDEX IF NOT EXISTS idx_verify_requests_user_status ON verify_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_verify_requests_ord ON verify_requests(exchange, ord_id, inst_id);

-- 3) 触发器（统一维护 updated_at）
CREATE TRIGGER IF NOT EXISTS trg_api_accounts_updated
AFTER UPDATE ON api_accounts
FOR EACH ROW BEGIN
  UPDATE api_accounts SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_verify_requests_updated
AFTER UPDATE ON verify_requests
FOR EACH ROW BEGIN
  UPDATE verify_requests SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_verify_results_updated
AFTER UPDATE ON verify_results
FOR EACH ROW BEGIN
  UPDATE verify_results SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_evidence_blobs_updated
AFTER UPDATE ON evidence_blobs
FOR EACH ROW BEGIN
  UPDATE evidence_blobs SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = NEW.id;
END;

-- 4) 开发种子数据（可按需注释）
INSERT OR IGNORE INTO api_accounts (user_id, exchange, label, api_key, secret_enc, passphrase_enc, status, last_verified_at)
VALUES
('user_demo', 'okx',    'OKX-只读-1', 'OKX_KEY_xxx', 'DEV_ENC(OKX_SECRET)', 'DEV_ENC(OKX_PASSPHRASE)', 'ready', NULL),
('user_demo', 'binance','BIN-只读-1', 'BIN_KEY_xxx', 'DEV_ENC(BIN_SECRET)', NULL,                       'ready', NULL);

INSERT OR IGNORE INTO verify_requests (user_id, account_id, exchange, ord_id, inst_id, live, fresh, no_cache, status)
VALUES ('user_demo', 1, 'okx', '2940071038556348417', 'BTC-USDT-SWAP', 1, 1, 0, 'pending');

INSERT OR IGNORE INTO verify_requests (user_id, account_id, exchange, ord_id, inst_id, status)
VALUES ('user_demo', 1, 'okx', 'SIM_DONE_001', 'BTC-USDT-SWAP', 'success');

INSERT OR IGNORE INTO verify_results (request_id, normalized_json, raw_json, meta_json)
SELECT id,
  json('{"orderId":"SIM_DONE_001","side":"buy","size":0.64,"price":35000,"filled":0.64,"status":"filled"}'),
  json('{"code":"0","data":[{"ordId":"SIM_DONE_001","accFillSz":"0.64","fillPx":"35000"}]}'),
  json('{"durationMs":182,"jpHost":"127.0.0.1:8082","cache":false}')
FROM verify_requests WHERE ord_id='SIM_DONE_001';

INSERT OR IGNORE INTO evidence_blobs (request_id, root, parent_root, leaves_count, evidence_json)
SELECT id, '0xabc123...deadbeef', NULL, 5, json('{"leaves":["0x..1","0x..2","0x..3","0x..4","0x..5"],"algo":"keccak256"}')
FROM verify_requests WHERE ord_id='SIM_DONE_001';

