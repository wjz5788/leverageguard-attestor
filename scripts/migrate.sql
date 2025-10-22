PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, wallet TEXT, skuId TEXT, exchange TEXT, pair TEXT,
  orderRef TEXT, premium INTEGER, payout INTEGER, status TEXT, createdAt TEXT
);
CREATE TABLE IF NOT EXISTS claims(
  id TEXT PRIMARY KEY, orderId TEXT, wallet TEXT, evidenceHash TEXT,
  reason TEXT, status TEXT, createdAt TEXT
);
CREATE TABLE IF NOT EXISTS idempotency_keys(
  key TEXT PRIMARY KEY, route TEXT, reqHash TEXT, respJson TEXT, createdAt TEXT
);
CREATE TABLE IF NOT EXISTS logs(
  ts TEXT, level TEXT, reqId TEXT, route TEXT, wallet TEXT,
  orderId TEXT, claimId TEXT, skuId TEXT, idempoKey TEXT,
  httpStatus INTEGER, latencyMs INTEGER, msg TEXT
);
