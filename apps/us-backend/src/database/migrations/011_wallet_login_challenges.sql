-- Wallet login challenges for SIWE-style verification
CREATE TABLE IF NOT EXISTS wallet_login_challenges (
  nonce TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  message TEXT NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_login_challenges_wallet ON wallet_login_challenges(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_login_challenges_expires ON wallet_login_challenges(expires_at);