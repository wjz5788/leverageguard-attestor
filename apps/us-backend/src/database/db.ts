import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MigrationManager } from './migrationManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据库接口定义
export interface DatabaseInterface {
  get(sql: string, ...params: any[]): any;
  all(sql: string, ...params: any[]): any[];
  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number };
  transaction(fn: () => void): () => void;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: Promise<void>;

  constructor(dbPath: string = './data/us-backend.db') {
    this.dbPath = dbPath;
    
    // 确保数据目录存在
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o600 });
    }

    // 创建数据库连接
    this.db = new Database(dbPath, { 
      // verbose: console.log // 可选：启用详细日志
    });
    
    console.log('Connected to SQLite database with better-sqlite3');
    
    // PRAGMA 设置：WAL 模式 + busy 超时
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA busy_timeout=3000;');
    
    // 初始化数据库并保存Promise
    this.initialized = this.initialize();
  }

  private async initialize() {
    try {
      // 使用新的迁移管理器执行迁移
      const migrationManager = new MigrationManager(this.db!);
      await migrationManager.up();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  // 等待数据库初始化完成
  public async waitForInitialization(): Promise<void> {
    return this.initialized;
  }

  getDatabase(): DatabaseInterface {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
  
  // 事务支持
  withTransaction<T>(fn: () => T): T {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const transaction = this.db.transaction(() => {
      return fn();
    });
    
    return transaction();
  }
}

// 创建全局数据库实例（新键 DB_FILE，兼容旧键 DB_URL）
let resolvedDbPath = (process.env.DB_FILE || '').trim();
if (!resolvedDbPath) {
  if (process.env.DB_URL) {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const mm = String(deadline.getMonth() + 1).padStart(2, '0');
    const dd = String(deadline.getDate()).padStart(2, '0');
    console.warn(`⚠️  [Compat] 使用旧键 DB_URL，建议切换到 DB_FILE（将在 ${deadline.getFullYear()}-${mm}-${dd} 后移除）`);
    resolvedDbPath = process.env.DB_URL.trim();
  } else {
    resolvedDbPath = './data/us-backend.db';
  }
}

const dbManager = new DatabaseManager(resolvedDbPath);

// 等待数据库初始化完成
await dbManager.waitForInitialization().catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

export const db = dbManager.getDatabase();
export default dbManager;
