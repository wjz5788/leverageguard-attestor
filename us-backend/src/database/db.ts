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
        '002_org_structure.sql',
        '002_verify_schema.sql',
        '003_policy_claim_payout.sql',
        '004_min_loop.sql',
        '005_auth_sessions.sql',
        '006_payment_proofs.sql',
        '007_products_quotes.sql',
        '008_api_keys.sql'
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
