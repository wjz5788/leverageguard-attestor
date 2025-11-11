import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseInterface } from './db.js';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export class MigrationManager {
  private db: DatabaseInterface;
  private migrationsDir: string;

  constructor(db: DatabaseInterface) {
    this.db = db;
    this.migrationsDir = join(__dirname, 'migrations');
    
    // 确保迁移跟踪表存在
    this.ensureMigrationsTable();
  }

  /**
   * 确保迁移跟踪表存在
   */
  private ensureMigrationsTable(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
    `;
    
    this.db.run(createTableSQL);
    console.log('Ensured schema_migrations table exists');
  }

  /**
   * 计算SQL文件的校验和
   */
  private calculateChecksum(sql: string): string {
    return createHash('sha256').update(sql).digest('hex');
  }

  /**
   * 获取所有迁移文件
   */
  private getAllMigrations(): Migration[] {
    // 读取所有迁移文件
    const migrationFiles = [
      '001_initial_schema.sql',
      '001_create_contract_events.sql',
      '002_org_structure.sql',
      '002_verify_schema.sql',
      '003_policy_claim_payout.sql',
      '003_purchase_orders.sql',
      '004_min_loop.sql',
      '004_order_payments.sql',
      '005_auth_sessions.sql',
      '005_verify_results.sql',
      '006_claims.sql',
      '006_payment_proofs.sql',
      '007_payout_txs.sql',
      '007_products_quotes.sql',
      '008_api_keys.sql',
      '008_audit_events.sql',
      '009_listener_checkpoint.sql',
      '009_order_quotes.sql',
      '010_idempotency_store.sql',
      '010_persist_memory_tables.sql',
      '011_wallet_login_challenges.sql',
      '202412120000__create_migrations_tracker.sql'
    ];

    const migrations: Migration[] = [];
    
    for (const file of migrationFiles) {
      const filePath = join(this.migrationsDir, file);
      if (existsSync(filePath)) {
        const sql = readFileSync(filePath, 'utf-8');
        const checksum = this.calculateChecksum(sql);
        
        // 从文件名提取版本和名称
        const [version, ...nameParts] = file.replace('.sql', '').split('__');
        const name = nameParts.join('__') || file;
        
        migrations.push({
          version,
          name,
          filename: file,
          sql,
          checksum
        });
      }
    }
    
    // 按版本排序
    return migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * 获取已应用的迁移
   */
  private getAppliedMigrations(): Migration[] {
    const rows = this.db.all('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
    
    return rows.map(row => ({
      version: row.version,
      name: row.name,
      filename: `${row.version}__${row.name}.sql`,
      sql: '',
      checksum: row.checksum
    }));
  }

  /**
   * 记录已应用的迁移
   */
  private recordMigration(migration: Migration): void {
    this.db.run(
      'INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
      migration.version,
      migration.name,
      migration.checksum
    );
  }

  /**
   * 移除迁移记录（用于回滚）
   */
  private removeMigrationRecord(version: string): void {
    this.db.run('DELETE FROM schema_migrations WHERE version = ?', version);
  }

  /**
   * 执行向上迁移
   */
  public async up(): Promise<void> {
    console.log('Starting database migrations...');
    
    try {
      const allMigrations = this.getAllMigrations();
      const appliedMigrations = this.getAppliedMigrations();
      
      // 创建一个已应用迁移的映射，便于快速查找
      const appliedVersions = new Set(appliedMigrations.map(m => m.version));
      
      // 执行未应用的迁移
      for (const migration of allMigrations) {
        if (!appliedVersions.has(migration.version)) {
          console.log(`Applying migration ${migration.filename}...`);
          
          try {
            // 开始事务
            this.db.run('BEGIN TRANSACTION');
            
            // 执行迁移SQL
            this.db.run(migration.sql);
            
            // 记录迁移
            this.recordMigration(migration);
            
            // 提交事务
            this.db.run('COMMIT');
            
            console.log(`✅ Migration ${migration.filename} applied successfully`);
          } catch (error) {
            // 回滚事务
            this.db.run('ROLLBACK');
            
            console.error(`❌ Failed to apply migration ${migration.filename}:`, error);
            // 提供更详细的错误信息
            const errorMessage = `Migration failed: ${migration.filename} - ${error.message}\nSQL: ${migration.sql.substring(0, 200)}...`;
            throw new Error(errorMessage);
          }
        } else {
          // 验证校验和
          const appliedMigration = appliedMigrations.find(m => m.version === migration.version);
          if (appliedMigration && appliedMigration.checksum !== migration.checksum) {
            const errorMessage = `Checksum mismatch for migration ${migration.filename}. Expected: ${migration.checksum}, Actual: ${appliedMigration.checksum}`;
            console.error(`❌ ${errorMessage}`);
            throw new Error(errorMessage);
          }
        }
      }
      
      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration process failed:', error.message);
      throw error;
    }
  }

  /**
   * 执行向下迁移（回滚）
   */
  public async down(steps: number = 1): Promise<void> {
    console.log(`Rolling back ${steps} migration(s)...`);
    
    try {
      const appliedMigrations = this.getAppliedMigrations();
      
      // 按版本降序排列（最新的在前）
      const sortedMigrations = appliedMigrations.sort((a, b) => b.version.localeCompare(a.version));
      
      // 获取要回滚的迁移
      const migrationsToRollback = sortedMigrations.slice(0, steps);
      
      if (migrationsToRollback.length === 0) {
        console.log('ℹ️  No migrations to rollback');
        return;
      }
      
      // 为了实现真正的回滚，我们需要对应的down脚本
      // 这里我们假设每个迁移文件都有对应的down脚本，命名为 {original_name}.down.sql
      for (const migration of migrationsToRollback) {
        console.log(` Rolling back migration ${migration.filename}...`);
        
        // 查找对应的down脚本
        const downScriptName = migration.filename.replace('.sql', '.down.sql');
        const downScriptPath = join(this.migrationsDir, downScriptName);
        
        if (existsSync(downScriptPath)) {
          try {
            const downSql = readFileSync(downScriptPath, 'utf-8');
            
            // 开始事务
            this.db.run('BEGIN TRANSACTION');
            
            // 执行回滚SQL
            this.db.run(downSql);
            
            // 移除迁移记录
            this.removeMigrationRecord(migration.version);
            
            // 提交事务
            this.db.run('COMMIT');
            
            console.log(`✅ Migration ${migration.filename} rolled back successfully`);
          } catch (error) {
            // 回滚事务
            this.db.run('ROLLBACK');
            
            console.error(`❌ Failed to roll back migration ${migration.filename}:`, error);
            const errorMessage = `Rollback failed: ${migration.filename} - ${error.message}`;
            throw new Error(errorMessage);
          }
        } else {
          // 如果没有找到down脚本，则只移除迁移记录
          console.log(`⚠️  No down script found for ${migration.filename}, removing migration record only`);
          this.removeMigrationRecord(migration.version);
          console.log(`✅ Migration ${migration.filename} record removed successfully`);
        }
      }
      
      console.log(`✅ Rolled back ${migrationsToRollback.length} migration(s) successfully`);
    } catch (error) {
      console.error('❌ Rollback process failed:', error.message);
      throw error;
    }
  }

  /**
   * 获取迁移状态
   */
  public status(): { applied: Migration[], pending: Migration[] } {
    const allMigrations = this.getAllMigrations();
    const appliedMigrations = this.getAppliedMigrations();
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    const applied = allMigrations.filter(m => appliedVersions.has(m.version));
    const pending = allMigrations.filter(m => !appliedVersions.has(m.version));
    
    return { applied, pending };
  }
}