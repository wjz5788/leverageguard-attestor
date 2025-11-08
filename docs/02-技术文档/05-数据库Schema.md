# LiqPass 数据库Schema文档

## 概述

本文档定义了LiqPass系统的数据库表结构、字段定义、索引和关系。

## 1. 数据库设计原则

- **数据完整性**: 使用约束确保数据一致性
- **性能优化**: 合理设计索引和查询优化
- **可扩展性**: 支持未来功能扩展
- **安全性**: 敏感数据加密存储

## 2. 表结构定义

### 2.1 用户表 (users)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
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

### 2.2 API密钥表 (api_keys)

```sql
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alias TEXT, -- 密钥别名
  api_key TEXT NOT NULL,
  secret TEXT NOT NULL,
  passphrase TEXT, -- OKX需要的passphrase
  exchange TEXT NOT NULL DEFAULT 'okx', -- 交易所名称
  key_mode TEXT NOT NULL DEFAULT 'inline', -- inline, alias
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_alias ON api_keys(alias);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE UNIQUE INDEX idx_api_keys_user_alias ON api_keys(user_id, alias);
```

### 2.3 订单表 (orders)

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL, -- OKX订单ID
  instrument_id TEXT NOT NULL, -- 交易对
  user_id TEXT NOT NULL,
  api_key_id INTEGER NOT NULL,
  
  -- 标准化数据
  side TEXT NOT NULL, -- buy, sell
  size DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  timestamp DATETIME NOT NULL,
  liquidated BOOLEAN NOT NULL DEFAULT FALSE,
  liquidation_price DECIMAL(18,8),
  margin_ratio DECIMAL(10,4),
  leverage INTEGER,
  
  -- 状态管理
  status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, failed
  verification_status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, completed, failed
  
  -- 证据信息
  evidence_id TEXT NOT NULL,
  normalized_data TEXT NOT NULL, -- JSON格式的标准化数据
  raw_data TEXT NOT NULL, -- JSON格式的原始数据
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- 索引
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_instrument_id ON orders(instrument_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_liquidated ON orders(liquidated);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

### 2.4 赔付表 (claims)

```sql
CREATE TABLE claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  
  -- 赔付信息
  amount DECIMAL(18,8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, paid
  reason TEXT, -- 赔付原因或拒绝原因
  
  -- 风控信息
  risk_level TEXT NOT NULL DEFAULT 'low', -- low, medium, high
  risk_score DECIMAL(5,2) DEFAULT 0.0,
  
  -- 证据信息
  evidence_id TEXT NOT NULL,
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  paid_at DATETIME,
  
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_claims_order_id ON claims(order_id);
CREATE INDEX idx_claims_user_id ON claims(user_id);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_created_at ON claims(created_at);
```

### 2.5 审计日志表 (audit_logs)

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 操作类型
  resource_type TEXT NOT NULL, -- 资源类型
  resource_id TEXT, -- 资源ID
  
  -- 请求信息
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  
  -- 操作详情
  details TEXT, -- JSON格式的详细操作信息
  status_code INTEGER,
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### 2.6 系统配置表 (system_configs)

```sql
CREATE TABLE system_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_type TEXT NOT NULL DEFAULT 'string', -- string, number, boolean, json
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_system_configs_key ON system_configs(config_key);
```

### 2.7 黑名单表 (blacklist)

```sql
CREATE TABLE blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- ip, user, api_key, order
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  expires_at DATETIME, -- 过期时间，NULL表示永久
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  
  FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- 索引
CREATE INDEX idx_blacklist_type_value ON blacklist(type, value);
CREATE INDEX idx_blacklist_expires ON blacklist(expires_at);
```

## 3. 初始数据

### 3.1 系统配置初始数据

```sql
INSERT INTO system_configs (config_key, config_value, config_type, description, is_public) VALUES
('risk_control_enabled', 'true', 'boolean', '风控开关', true),
('max_leverage', '100', 'number', '最大杠杆倍数', true),
('min_claim_amount', '10', 'number', '最小赔付金额', true),
('claim_waiting_period', '24', 'number', '赔付等待期（小时）', true),
('api_rate_limit', '100', 'number', 'API调用频率限制', false),
('evidence_retention_days', '365', 'number', '证据保留天数', false);
```

## 4. 数据关系图

```
users (1) ←→ (N) api_keys
users (1) ←→ (N) orders
users (1) ←→ (N) claims
users (1) ←→ (N) audit_logs
users (1) ←→ (N) blacklist

orders (1) ←→ (1) claims
api_keys (1) ←→ (N) orders
```

## 5. 数据迁移策略

### 5.1 版本管理

- 使用迁移文件管理数据库变更
- 每个迁移文件包含up和down操作
- 迁移文件命名: `{timestamp}_{description}.sql`

### 5.2 备份策略

- 每日自动备份数据库
- 保留最近30天的备份
- 备份文件加密存储

## 6. 性能优化建议

### 6.1 索引优化

- 为常用查询字段创建索引
- 避免过度索引影响写入性能
- 定期分析索引使用情况

### 6.2 查询优化

- 使用EXPLAIN分析查询计划
- 避免SELECT * 查询
- 合理使用分页查询

## 7. 安全考虑

### 7.1 数据加密

- 敏感字段（密码、API密钥）使用加密存储
- 使用安全的哈希算法
- 定期轮换加密密钥

### 7.2 访问控制

- 数据库用户权限最小化
- 使用连接池管理数据库连接
- 实现SQL注入防护

---

**文档版本**: v1.0  
**最后更新**: 2024-12-19  
**维护者**: LiqPass开发团队