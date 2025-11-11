# 数据库Schema文档 v1.1

## 概述

本文档定义LiqPass系统v1.1版本的数据库表结构、字段定义、索引和关系。所有金额字段统一使用`premiumUSDC_6d`（微USDC整数）格式。

## 1. 金额字段标准化

### 字段命名规范
- 金额字段统一命名：`*_6d`（6位小数精度，微单位）
- 字符串存储：避免浮点数精度问题
- 示例：0.01 USDC = `"10000"`（0.01 × 1,000,000 = 10,000）

### 金额范围验证
- **最小金额**：0.01 USDC（10,000 micro-USDC）
- **最大金额**：100 USDC（100,000,000 micro-USDC）
- **步长要求**：1 micro-USDC

## 2. 表结构定义

### 2.1 用户表 (users)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL, -- ULID/UUID
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, suspended
  role TEXT NOT NULL DEFAULT 'user', -- user, admin, super_admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- 索引
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

### 2.2 会话表 (sessions)

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  ip_address TEXT,
  user_agent TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### 2.3 订单表 (orders)

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL, -- 交易所原始订单ID
  policy_id TEXT NOT NULL, -- 保险单ID
  user_id TEXT NOT NULL,
  api_key_id INTEGER NOT NULL,
  
  -- 交易信息
  wallet_address TEXT NOT NULL,
  leverage TEXT NOT NULL, -- 杠杆倍数
  principal_usd_6d TEXT NOT NULL, -- 本金（微USDC）
  premiumUSDC_6d TEXT NOT NULL, -- 保费（微USDC）
  
  -- 订单状态
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, filled, completed, failed
  confirmation_status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, timeout
  verification_status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, completed, failed
  
  -- 交易对信息
  exchange TEXT NOT NULL, -- okx, binance
  instrument_id TEXT NOT NULL,
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME,
  filled_at DATETIME,
  verified_at DATETIME,
  expires_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- 索引
CREATE UNIQUE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_policy_id ON orders(policy_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_exchange ON orders(exchange);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### 2.4 API密钥表 (api_keys)

```sql
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL, -- 密钥别名
  api_key_encrypted TEXT NOT NULL, -- 加密存储
  secret_encrypted TEXT NOT NULL, -- 加密存储
  passphrase_encrypted TEXT, -- OKX需要，可选
  exchange TEXT NOT NULL DEFAULT 'okx', -- 交易所
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_label ON api_keys(label);
CREATE INDEX idx_api_keys_exchange ON api_keys(exchange);
CREATE UNIQUE INDEX idx_api_keys_user_label ON api_keys(user_id, label);
```

### 2.5 事件游标表 (event_cursors)

```sql
CREATE TABLE event_cursors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cursor_key TEXT UNIQUE NOT NULL, -- 游标标识
  block_number INTEGER, -- 区块链高度
  transaction_hash TEXT, -- 交易哈希
  log_index INTEGER, -- 日志索引
  event_type TEXT NOT NULL, -- 事件类型
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

-- 索引
CREATE UNIQUE INDEX idx_event_cursors_key ON event_cursors(cursor_key);
CREATE INDEX idx_event_cursors_type ON event_cursors(event_type);
CREATE INDEX idx_event_cursors_processed ON event_cursors(processed);
```

### 2.6 验证作业表 (verification_jobs)

```sql
CREATE TABLE verification_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_uid TEXT UNIQUE NOT NULL, -- ULID
  order_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT,
  
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- 索引
CREATE UNIQUE INDEX idx_verification_jobs_uid ON verification_jobs(job_uid);
CREATE INDEX idx_verification_jobs_order_id ON verification_jobs(order_id);
CREATE INDEX idx_verification_jobs_status ON verification_jobs(status);
```

### 2.7 证据包表 (evidence_bundles)

```sql
CREATE TABLE evidence_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_uid TEXT UNIQUE NOT NULL, -- ULID
  job_uid TEXT NOT NULL,
  evidence_hash TEXT NOT NULL, -- 证据哈希
  storage_url TEXT, -- 存储URL
  bytes_size INTEGER, -- 文件大小
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_uid) REFERENCES verification_jobs(job_uid)
);

-- 索引
CREATE UNIQUE INDEX idx_evidence_bundles_uid ON evidence_bundles(evidence_uid);
CREATE INDEX idx_evidence_bundles_job_uid ON evidence_bundles(job_uid);
```

### 2.8 审计日志表 (audit_events)

```sql
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, -- 关联用户ID，匿名请求为NULL
  action TEXT NOT NULL, -- 操作类型
  resource_type TEXT NOT NULL, -- 资源类型
  resource_id TEXT, -- 资源ID
  
  -- 请求信息
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  request_headers TEXT, -- JSON
  request_body TEXT, -- JSON，脱敏后
  
  -- 响应信息
  response_status INTEGER,
  response_time_ms INTEGER,
  error_code TEXT,
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_action ON audit_events(action);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
```

### 2.9 幂等性存储表 (idempotency_store)

```sql
CREATE TABLE idempotency_store (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, -- 请求内容哈希
  response_data TEXT, -- JSON响应数据
  status_code INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE UNIQUE INDEX idx_idempotency_store_key ON idempotency_store(idempotency_key);
CREATE INDEX idx_idempotency_store_user_id ON idempotency_store(user_id);
CREATE INDEX idx_idempotency_store_expires ON idempotency_store(expires_at);
```

## 3. 关系图

```
users (1) ←→ (N) sessions
users (1) ←→ (N) orders
users (1) ←→ (N) api_keys
users (1) ←→ (N) audit_events
users (1) ←→ (N) idempotency_store

orders (1) ←→ (1) verification_jobs
orders (1) ←→ (N) evidence_bundles

api_keys (1) ←→ (N) orders

verification_jobs (1) ←→ (N) evidence_bundles
```

## 4. 数据完整性约束

### 4.1 外键约束
```sql
-- 订单表外键
FOREIGN KEY (user_id) REFERENCES users(user_id)
FOREIGN KEY (api_key_id) REFERENCES api_keys(id)

-- 验证作业外键
FOREIGN KEY (order_id) REFERENCES orders(order_id)

-- 证据包外键
FOREIGN KEY (job_uid) REFERENCES verification_jobs(job_uid)
```

### 4.2 唯一约束
```sql
-- 订单ID唯一（交易所层面）
CREATE UNIQUE INDEX idx_orders_order_id ON orders(order_id);

-- 用户+标签组合唯一（API密钥）
CREATE UNIQUE INDEX idx_api_keys_user_label ON api_keys(user_id, label);

-- 事件游标唯一
CREATE UNIQUE INDEX idx_event_cursors_key ON event_cursors(cursor_key);
```

## 5. 索引优化

### 5.1 查询性能索引
```sql
-- 常用查询优化
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
CREATE INDEX idx_api_keys_user_active ON api_keys(user_id, is_active);
```

### 5.2 分区策略
```sql
-- 按时间分区（建议用于大量数据场景）
-- 审计日志按月分区
CREATE TABLE audit_events_y2024m12 PARTITION OF audit_events
FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
```

## 6. 数据迁移规范

### 6.1 迁移文件命名
```
{timestamp}_{description}.sql
示例：20241219_001_add_premium_usdc_6d.sql
```

### 6.2 迁移模板
```sql
-- UP操作
BEGIN;

-- 添加字段
ALTER TABLE orders ADD COLUMN premiumUSDC_6d TEXT NOT NULL DEFAULT '0';

-- 创建索引
CREATE INDEX idx_orders_premium_6d ON orders(premiumUSDC_6d);

-- 数据迁移
UPDATE orders SET premiumUSDC_6d = CAST(premium_usd * 1000000 AS TEXT);

-- DOWN操作
DROP INDEX IF EXISTS idx_orders_premium_6d;
ALTER TABLE orders DROP COLUMN IF EXISTS premiumUSDC_6d;

COMMIT;
```

## 7. 数据安全

### 7.1 敏感数据加密
```sql
-- API密钥加密存储
api_key_encrypted TEXT NOT NULL,
secret_encrypted TEXT NOT NULL,
passphrase_encrypted TEXT,
```

### 7.2 审计追踪
- 所有用户操作记录到audit_events表
- 敏感操作需要额外权限验证
- 定期清理过期会话和临时数据

---

**文档版本**: v1.1  
**最后更新**: 2024-12-19  
**维护者**: LiqPass开发团队