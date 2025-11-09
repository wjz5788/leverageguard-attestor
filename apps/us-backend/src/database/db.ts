import sqlite3 from 'sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseManager {
  private db: sqlite3.Database | null = null;

  constructor(dbPath: string = './data/liqpass.db') {
    // 确保数据目录存在
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 创建数据库连接
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        // PRAGMA 设置：WAL 模式 + busy 超时
        try {
          this.db!.exec('PRAGMA journal_mode=WAL;');
          this.db!.exec('PRAGMA busy_timeout=3000;');
        } catch (e) {
          console.warn('Failed to apply PRAGMA settings:', e);
        }
        // 异步初始化数据库
        this.initialize().catch(error => {
          console.error('Database initialization failed:', error);
        });
      }
    });
  }

  private async initialize() {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      // 运行所有迁移
      const migrations = [
        '001_initial_schema.sql',
        // 事件与订单快照（只信链上事件）
        '001_create_contract_events.sql',
        '002_org_structure.sql',
        '002_verify_schema.sql',
        '003_policy_claim_payout.sql',
        '004_min_loop.sql',
        '005_auth_sessions.sql',
        '006_payment_proofs.sql',
        '007_products_quotes.sql',
        '008_api_keys.sql',
        '009_listener_checkpoint.sql',
        '010_idempotency_store.sql'
      ];
      
      const executeMigration = (index: number) => {
        if (index >= migrations.length) {
          console.log('Database initialized successfully');
          resolve();
          return;
        }

        const migrationFile = migrations[index];
        const migrationPath = join(__dirname, 'migrations', migrationFile);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        
        this.db!.exec(migrationSQL, (err) => {
          if (err) {
            console.error(`Migration ${migrationFile} failed:`, err);
            reject(err);
            return;
          }
          
          console.log(`Migration ${migrationFile} executed successfully`);
          executeMigration(index + 1);
        });
      };
      
      executeMigration(0);
    });
  }

  getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// 创建全局数据库实例
const dbManager = new DatabaseManager(process.env.DB_URL || './data/liqpass.db');

export const db = dbManager.getDatabase();
export default dbManager;

// --- Transaction helpers (sqlite3) ---

function execAsync(database: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    database.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Execute a function within a SQLite transaction.
 * Ensures BEGIN/COMMIT/ROLLBACK with proper error propagation.
 */
export async function withTransaction<T>(fn: (tx: sqlite3.Database) => Promise<T>): Promise<T> {
  // serialize guarantees statements run sequentially on this connection
  db.serialize();
  // SQLite并发与可靠性：WAL + busy_timeout
  await execAsync(db, 'PRAGMA journal_mode=WAL');
  await execAsync(db, 'PRAGMA busy_timeout=3000');
  await execAsync(db, 'BEGIN IMMEDIATE');
  try {
    const result = await fn(db);
    await execAsync(db, 'COMMIT');
    return result;
  } catch (err) {
    try { await execAsync(db, 'ROLLBACK'); } catch {}
    throw err;
  }
}
