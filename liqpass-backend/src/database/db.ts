import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = './data/liqpass.db') {
    // 确保数据目录存在
    const path = require('path');
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initialize();
  }

  private initialize() {
    // 运行迁移
    const migrationPath = join(__dirname, 'migrations/001_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    try {
      this.db.exec(migrationSQL);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close() {
    this.db.close();
  }
}

// 创建全局数据库实例
const dbManager = new DatabaseManager(process.env.DB_URL || './data/liqpass.db');

export const db = dbManager.getDatabase();
export default dbManager;