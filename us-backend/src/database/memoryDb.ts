// 内存数据库实现 - 替代better-sqlite3
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 简化的数据库接口
export interface MemoryDatabase {
  prepare(sql: string): {
    run(...params: any[]): { changes: number; lastInsertRowid: number };
    all(...params: any[]): any[];
    get(...params: any[]): any;
  };
  exec(sql: string): void;
  close(): void;
}

class MemoryDatabaseManager {
  private tables: Map<string, any[]> = new Map();
  private preparedStatements: Map<string, Function> = new Map();

  constructor() {
    console.log('Memory database initialized');
    this.initialize();
  }

  private initialize() {
    // 扫描 migrations 目录，串联所有 SQL，仅解析 CREATE TABLE
    const dir = join(__dirname, 'migrations');
    const files = ['001_initial_schema.sql', '002_verify_schema.sql', '003_policy_claim_payout.sql', '004_min_loop.sql'];
    try {
      for (const f of files) {
        const p = join(dir, f);
        const sql = readFileSync(p, 'utf-8');
        this.parseAndCreateTables(sql);
      }
      console.log('Memory database initialized successfully');
    } catch (error) {
      console.error('Memory database initialization failed:', error);
      throw error;
    }
  }

  private parseAndCreateTables(sql: string) {
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed.startsWith('CREATE TABLE')) {
        // 提取表名
        const tableMatch = trimmed.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          this.tables.set(tableName, []);
          console.log(`Created memory table: ${tableName}`);
        }
      }
    }
  }

  prepare(sql: string) {
    const normalizedSql = sql.trim().toLowerCase();
    
    return {
      run: (...params: any[]) => {
        if (normalizedSql.startsWith('insert into')) {
          return this.handleInsert(sql, params);
        } else if (normalizedSql.startsWith('select')) {
          // 对于select，我们返回空结果
          return { changes: 0, lastInsertRowid: 0 };
        } else if (normalizedSql.startsWith('update') || normalizedSql.startsWith('delete')) {
          return { changes: 0, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      },
      all: (...params: any[]) => {
        if (normalizedSql.startsWith('select')) {
          // 返回空数组表示没有数据
          return [];
        }
        return [];
      },
      get: (...params: any[]) => {
        if (normalizedSql.startsWith('select')) {
          // 返回null表示没有数据
          return null;
        }
        return null;
      }
    };
  }

  private handleInsert(sql: string, params: any[]) {
    const tableMatch = sql.match(/INSERT INTO (\w+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      const table = this.tables.get(tableName);
      if (table === undefined) {
        console.error(`Memory table not found: ${tableName}`);
        return { changes: 0, lastInsertRowid: 0 };
      }
      
      const record = params[0];
      if (typeof record !== 'object' || record === null) {
        console.error('Insert expects a single object parameter.');
        return { changes: 0, lastInsertRowid: 0 };
      }
      
      table.push(record);
      
      return { changes: 1, lastInsertRowid: table.length };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }

  exec(sql: string) {
    // 对于exec，我们只处理CREATE语句
    const normalizedSql = sql.trim().toLowerCase();
    if (normalizedSql.startsWith('create')) {
      this.parseAndCreateTables(sql);
    }
  }

  close() {
    this.tables.clear();
    this.preparedStatements.clear();
    console.log('Memory database closed');
  }

  getDatabase(): MemoryDatabase {
    return this as unknown as MemoryDatabase;
  }
}

// 创建全局内存数据库实例
const memoryDbManager = new MemoryDatabaseManager();

export const db = memoryDbManager.getDatabase();
export default memoryDbManager;
