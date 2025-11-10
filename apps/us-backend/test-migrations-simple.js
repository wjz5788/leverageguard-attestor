import { rmSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import { MigrationManager } from './src/database/migrationManager.js';

async function runTests() {
  console.log('🧪 Testing migration system...');
  
  // 删除测试数据库文件（如果存在）
  const testDbPath = './data/test-migrations-simple.db';
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
    console.log('🗑️  Removed existing test database');
  }
  
  try {
    // 创建新的数据库连接
    const db = new Database(testDbPath, { 
      // verbose: console.log // 可选：启用详细日志
    });
    
    console.log('Connected to SQLite database with better-sqlite3');
    
    // PRAGMA 设置：WAL 模式 + busy 超时
    db.exec('PRAGMA journal_mode=WAL;');
    db.exec('PRAGMA busy_timeout=3000;');
    
    // 创建迁移管理器
    const migrationManager = new MigrationManager(db);
    
    // 执行迁移
    console.log('🚀 Executing migrations...');
    await migrationManager.up();
    
    // 检查是否创建了迁移跟踪表
    const result = db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
    if (result) {
      console.log('✅ Migration tracking table created successfully');
    } else {
      console.log('❌ Migration tracking table not found');
    }
    
    // 显示迁移状态
    console.log('📊 Migration status:');
    const status = migrationManager.status();
    console.log(`   Applied migrations: ${status.applied.length}`);
    console.log(`   Pending migrations: ${status.pending.length}`);
    
    // 检查是否创建了其他关键表
    const tables = ['users', 'sessions', 'orders', 'api_keys'];
    console.log('📋 Checking key tables:');
    for (const table of tables) {
      try {
        const tableResult = db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table);
        if (tableResult) {
          console.log(`   ✅ Table ${table} exists`);
        } else {
          console.log(`   ❌ Table ${table} not found`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking table ${table}:`, error.message);
      }
    }
    
    // 测试回滚功能
    console.log('🔄 Testing rollback functionality...');
    if (status.applied.length > 0) {
      try {
        await migrationManager.down(1);
        console.log('   ✅ Rollback executed successfully');
      } catch (error) {
        console.log('   ❌ Rollback failed:', error.message);
      }
    } else {
      console.log('   ⚠️  No migrations to rollback');
    }
    
    db.close();
    console.log('🏁 Migration tests completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests();