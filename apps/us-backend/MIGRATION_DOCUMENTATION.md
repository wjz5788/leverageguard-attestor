# 数据库迁移系统文档

## 概述

本项目实现了现代化的数据库迁移系统，具有以下特性：
- 自动迁移执行
- 迁移跟踪和版本控制
- 失败快速失败机制
- 回滚支持
- 校验和验证

## 迁移脚本清单

以下是在 `src/database/migrations` 目录中的所有迁移脚本：

1. `001_initial_schema.sql` - 初始数据库结构，包含核心表
2. `001_create_contract_events.sql` - 合约事件表
3. `002_org_structure.sql` - 组织结构相关表
4. `002_verify_schema.sql` - 验证模式表
5. `003_policy_claim_payout.sql` - 策略声明和支付表
6. `003_purchase_orders.sql` - 购买订单表
7. `004_min_loop.sql` - 最小循环表
8. `004_order_payments.sql` - 订单支付表
9. `005_auth_sessions.sql` - 认证会话表
10. `005_verify_results.sql` - 验证结果表
11. `006_claims.sql` - 声明表
12. `006_payment_proofs.sql` - 支付证明表
13. `007_payout_txs.sql` - 支付交易表
14. `007_products_quotes.sql` - 产品报价表
15. `008_api_keys.sql` - API密钥表
16. `008_audit_events.sql` - 审计事件表
17. `009_listener_checkpoint.sql` - 监听器检查点表
18. `009_order_quotes.sql` - 订单报价表
19. `010_idempotency_store.sql` - 幂等性存储表
20. `010_persist_memory_tables.sql` - 持久化内存表
21. `202412120000__create_migrations_tracker.sql` - 迁移跟踪表（新添加）

## 回滚命令

系统支持通过 `down` 命令回滚迁移。每个迁移脚本可以有对应的 `.down.sql` 回滚脚本。

示例回滚脚本：
- `202412120000__create_migrations_tracker.down.sql` - 删除迁移跟踪表

使用方法：
```javascript
const migrationManager = new MigrationManager(db);
await migrationManager.down(1); // 回滚最近的1个迁移
```

## 关键表结构

### schema_migrations (迁移跟踪表)
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum TEXT NOT NULL
);
```

### users (用户表)
```sql
-- 用户表结构在多个迁移中逐步完善
```

### sessions (会话表)
```sql
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  login_type TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### orders (订单表)
```sql
-- 订单表结构在多个迁移中逐步完善
```

## 使用说明

### 新环境一键建表
在新环境中，系统会自动执行所有迁移脚本，创建所需的表结构。

### 老环境不重复执行
系统通过 `schema_migrations` 表跟踪已执行的迁移，避免重复执行。

### 失败快速失败
如果迁移失败，系统会立即退出并提供详细的错误信息，包括：
- 失败的迁移文件名
- 错误信息
- 部分SQL内容（前200字符）

### 回滚能力
系统支持通过 `down` 命令回滚已应用的迁移。

## 演示日志

运行 `demo-migrations.js` 脚本的示例输出：

```
🚀 Migration System Demo
========================
🗑️  Removed existing test database
✅ Connected to SQLite database with better-sqlite3
✅ PRAGMA settings applied
✅ MigrationManager created

📋 Initial Migration Status:
   Applied migrations: 0
   Pending migrations: 21

🚀 Executing migrations...

✅ All migrations completed successfully

📋 Migration Status After Up:
   Applied migrations: 21
   Pending migrations: 0

📄 Applied Migrations:
   1. 001 - initial_schema
   2. 001 - create_contract_events
   3. 002 - org_structure
   4. 002 - verify_schema
   5. 003 - policy_claim_payout
   6. 003 - purchase_orders
   7. 004 - min_loop
   8. 004 - order_payments
   9. 005 - auth_sessions
   10. 005 - verify_results
   11. 006 - claims
   12. 006 - payment_proofs
   13. 007 - payout_txs
   14. 007 - products_quotes
   15. 008 - api_keys
   16. 008 - audit_events
   17. 009 - listener_checkpoint
   18. 009 - order_quotes
   19. 010 - idempotency_store
   20. 010 - persist_memory_tables
   21. 202412120000 - create_migrations_tracker

✅ Migration tracking table created successfully

📋 Checking key tables:
   ✅ Table users exists
   ✅ Table sessions exists
   ✅ Table orders exists
   ✅ Table api_keys exists

📊 Migration Tracking Records:
   1. 001 - initial_schema (2024-12-12 10:30:45)
   2. 001 - create_contract_events (2024-12-12 10:30:45)
   ...

🔄 Testing duplicate execution (should do nothing):
   ✅ Duplicate execution completed (no migrations applied)

⏪ Testing rollback functionality:
   ✅ Rollback executed successfully

📋 Migration Status After Rollback:
   Applied migrations: 20
   Pending migrations: 1

🏁 Migration demo completed successfully
```

## 系统架构

### MigrationManager 类

负责管理迁移的执行、跟踪和回滚。

主要方法：
- `up()` - 执行向上迁移
- `down(steps)` - 执行向下迁移（回滚）
- `status()` - 获取迁移状态

### DatabaseManager 类

负责数据库连接和初始化。

主要功能：
- 创建数据库连接
- 执行迁移
- 提供数据库访问接口

## 最佳实践

1. 迁移脚本应具有明确的版本号和描述性名称
2. 每个迁移应是原子操作，使用事务确保一致性
3. 为重要迁移提供回滚脚本
4. 在生产环境中执行迁移前进行充分测试
5. 定期备份数据库