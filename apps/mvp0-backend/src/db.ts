import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbFile = path.resolve(process.cwd(), 'data', 'mvp0.db');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

type Migration = {
  id: string;
  statements: string;
};

const migrations: Migration[] = [
  {
    id: '001_create_orders',
    statements: `
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        premium_usdc_6d INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','refunded')),
        tx_hash TEXT UNIQUE,
        paid_at TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_hash ON orders(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet);
    `
  },
  {
    id: '002_create_payouts',
    statements: `
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','denied','paid')),
        reviewer TEXT,
        decision_note TEXT,
        offchain_ref TEXT,
        decided_at TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_payouts_order_id ON payouts(order_id);
      CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT,
        at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
    `
  }
];

const ensureMigrationsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const hasMigrationRun = db.prepare('SELECT 1 FROM migrations WHERE id = ? LIMIT 1');
const insertMigration = db.prepare('INSERT INTO migrations (id) VALUES (?)');

export const runMigrations = () => {
  ensureMigrationsTable();

  for (const migration of migrations) {
    const alreadyRan = hasMigrationRun.get(migration.id);
    if (alreadyRan) {
      continue;
    }

    db.exec(migration.statements);
    insertMigration.run(migration.id);
  }
};
