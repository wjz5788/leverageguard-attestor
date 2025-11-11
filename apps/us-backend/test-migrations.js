import { DatabaseManager } from './src/database/db.js';
import { MigrationManager } from './src/database/migrationManager.js';
import { rmSync, existsSync } from 'fs';

async function runTests() {
  // 测试新环境一键建表
  console.log('🧪 Testing new environment setup...');

  // 删除测试数据库文件（如果存在）
  const testDbPath = './data/test-migrations.db';
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
    console.log('🗑️  Removed existing test database');
  }

  try {
    // 创建新的数据库管理器
    const dbManager = new DatabaseManager(testDbPath);
    // 等待初始化完成
    await dbManager.waitForInitialization();
    
    const db = dbManager.getDatabase();

    // 检查是否创建了迁移跟踪表
    const result = db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
    if (result) {
      console.log('✅ Migration tracking table created successfully');
    } else {
      console.log('❌ Migration tracking table not found');
    }
    
    // 检查是否创建了其他关键表
    const tables = ['users', 'sessions', 'orders', 'api_keys'];
    for (const table of tables) {
      try {
        const tableResult = db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table);
        if (tableResult) {
          console.log(`✅ Table ${table} created successfully`);
        } else {
          console.log(`❌ Table ${table} not found`);
        }
      } catch (error) {
        console.log(`❌ Error checking table ${table}:`, error.message);
      }
    }
    
    dbManager.close();
    console.log('🏁 Migration tests completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests();