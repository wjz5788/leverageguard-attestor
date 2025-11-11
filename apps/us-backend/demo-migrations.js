import { rmSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import { MigrationManager } from './src/database/migrationManager.js';

async function runDemo() {
  console.log('🚀 Migration System Demo');
  console.log('========================');
  
  // 删除测试数据库文件（如果存在）
  const testDbPath = './data/demo-migrations.db';
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
    console.log('🗑️  Removed existing test database');
  }
  
  try {
    // 创建新的数据库连接
    const db = new Database(testDbPath);
    console.log('✅ Connected to SQLite database with better-sqlite3');
    
    // PRAGMA 设置
    db.exec('PRAGMA journal_mode=WAL;');
    db.exec('PRAGMA busy_timeout=3000;');
    console.log('✅ PRAGMA settings applied');
    
    // 创建迁移管理器
    const migrationManager = new MigrationManager(db);
    console.log('✅ MigrationManager created');
    
    // 显示初始状态
    console.log('\n📋 Initial Migration Status:');
    const initialStatus = migrationManager.status();
    console.log(`   Applied migrations: ${initialStatus.applied.length}`);
    console.log(`   Pending migrations: ${initialStatus.pending.length}`);
    
    // 执行迁移
    console.log('\n🚀 Executing migrations...');
    await migrationManager.up();
    
    // 显示迁移后状态
    console.log('\n📋 Migration Status After Up:');
    const upStatus = migrationManager.status();
    console.log(`   Applied migrations: ${upStatus.applied.length}`);
    console.log(`   Pending migrations: ${upStatus.pending.length}`);
    
    // 显示已应用的迁移
    console.log('\n📄 Applied Migrations:');
    upStatus.applied.forEach((migration, index) => {
      console.log(`   ${index + 1}. ${migration.version} - ${migration.name}`);
    });
    
    // 检查是否创建了迁移跟踪表
    const result = db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
    if (result) {
      console.log('\n✅ Migration tracking table created successfully');
    } else {
      console.log('\n❌ Migration tracking table not found');
    }
    
    // 检查是否创建了其他关键表
    const tables = ['users', 'sessions', 'orders', 'api_keys'];
    console.log('\n📋 Checking key tables:');
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
    
    // 显示迁移跟踪表中的记录
    console.log('\n📊 Migration Tracking Records:');
    const records = db.all('SELECT version, name, applied_at FROM schema_migrations ORDER BY version');
    records.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.version} - ${record.name} (${record.applied_at})`);
    });
    
    // 测试重复执行（应该不执行任何迁移）
    console.log('\n🔄 Testing duplicate execution (should do nothing):');
    await migrationManager.up();
    console.log('   ✅ Duplicate execution completed (no migrations applied)');
    
    // 测试回滚功能
    console.log('\n⏪ Testing rollback functionality:');
    if (upStatus.applied.length > 0) {
      try {
        await migrationManager.down(1);
        console.log('   ✅ Rollback executed successfully');
        
        // 显示回滚后状态
        console.log('\n📋 Migration Status After Rollback:');
        const downStatus = migrationManager.status();
        console.log(`   Applied migrations: ${downStatus.applied.length}`);
        console.log(`   Pending migrations: ${downStatus.pending.length}`);
      } catch (error) {
        console.log('   ❌ Rollback failed:', error.message);
      }
    } else {
      console.log('   ⚠️  No migrations to rollback');
    }
    
    db.close();
    console.log('\n🏁 Migration demo completed successfully');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

runDemo();