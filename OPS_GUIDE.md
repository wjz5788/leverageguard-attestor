# LiqPass 运维管理指南

## 概述

本文档提供LiqPass系统的运维管理指南，包括合约控制、监控告警、进程守护等功能的使用说明。

## 1. 运维控制脚本

### 1.1 合约控制脚本 (`ops-control.js`)

**功能**: 提供合约的运维管理功能，包括暂停/恢复、状态检查、紧急提款等。

**使用方法**:
```bash
cd contracts

# 检查合约状态
node ops-control.js status

# 暂停合约（紧急止损）
node ops-control.js pause

# 恢复合约运行
node ops-control.js unpause

# 更新金库地址
node ops-control.js update-treasury 0xNewTreasuryAddress

# 紧急提款（仅限非USDC代币）
node ops-control.js emergency-withdraw 0xTokenAddress 0xToAddress 1000000

# 启动实时监控
node ops-control.js monitor --interval 30
```

**环境变量配置**:
```bash
export OPS_WALLET_PRIVATE_KEY=你的运维钱包私钥
export SLACK_WEBHOOK_URL=你的Slack Webhook URL
export TELEGRAM_BOT_TOKEN=你的Telegram Bot Token
export TELEGRAM_CHAT_ID=你的Telegram Chat ID
```

### 1.2 系统监控脚本 (`monitor.js`)

**功能**: 监控系统健康状态，包括RPC连接、合约状态、后端服务等。

**使用方法**:
```bash
cd contracts

# 启动系统监控
node monitor.js
```

**监控指标**:
- RPC连接状态和响应时间
- 合约暂停状态
- 后端服务健康检查
- 区块同步状态

## 2. 后端告警服务

### 2.1 告警服务配置

后端系统集成了告警服务，支持多种通知方式：

**环境变量配置**:
```bash
# Slack配置
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# Telegram配置
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ
TELEGRAM_CHAT_ID=-1001234567890

# 邮件配置（JSON格式）
EMAIL_CONFIG={"host":"smtp.gmail.com","port":587,"secure":false,"auth":{"user":"your-email@gmail.com","pass":"your-password"},"from":"your-email@gmail.com","to":["admin@example.com"]}
```

### 2.2 告警类型

系统支持以下类型的告警：

1. **合约事件告警**
   - PremiumPaid事件监听
   - 自动发送通知到配置的渠道

2. **系统异常告警**
   - RPC连接异常
   - 数据库连接失败
   - 服务健康检查失败

3. **合约状态变更告警**
   - 合约暂停/恢复操作
   - 金库地址变更

## 3. 进程守护配置

### 3.1 PM2配置 (`ecosystem.config.js`)

**功能**: 使用PM2进行进程守护和监控。

**启动服务**:
```bash
cd us-backend

# 开发环境
pm2 start ecosystem.config.js --env development

# 生产环境
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs liqpass-backend
pm2 logs contract-listener

# 重启服务
pm2 restart liqpass-backend
pm2 restart contract-listener

# 停止服务
pm2 stop all
```

**服务配置**:
- `liqpass-backend`: 主后端API服务
- `contract-listener`: 合约事件监听服务

### 3.2 健康检查

后端服务提供健康检查端点：
```bash
curl http://localhost:3000/health
```

响应示例：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "contract": "listening",
    "rpc": "connected"
  }
}
```

## 4. 风控管理

### 4.1 合约暂停机制

**紧急止损流程**:
1. 检测到异常情况（如安全漏洞、市场异常等）
2. 执行暂停操作：`node ops-control.js pause`
3. 系统自动发送告警通知
4. 调查并修复问题
5. 执行恢复操作：`node ops-control.js unpause`

### 4.2 多签钱包迁移

**建议操作**:
1. 将合约owner权限迁移到多签钱包（如Gnosis Safe）
2. 配置多签阈值（如2/3）
3. 敏感操作（pause/unpause/updateTreasury）需要多签确认

### 4.3 监控告警阈值

**配置建议**:
- RPC响应时间: >5秒触发警告
- 区块同步滞后: >10个区块触发警告
- 服务连续失败: 3次触发严重告警

## 5. 事件归档

### 5.1 数据库表结构

系统自动归档所有合约事件到数据库：

```sql
-- 合约事件表
CREATE TABLE contract_events (
  id SERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) NOT NULL,
  log_index INTEGER NOT NULL,
  event_name VARCHAR(50) NOT NULL,
  order_id VARCHAR(66),
  buyer VARCHAR(42),
  amount VARCHAR(100),
  quote_hash VARCHAR(66),
  block_number INTEGER NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tx_hash, log_index)
);

-- 订单表
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(66) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  amount VARCHAR(100),
  payer VARCHAR(42),
  tx_hash VARCHAR(66),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 数据保留策略

**建议配置**:
- 合约事件: 保留6个月
- 订单数据: 保留12个月
- 定期备份到冷存储

## 6. 紧急响应流程

### 6.1 安全事件响应

1. **立即暂停合约**: `node ops-control.js pause`
2. **通知相关人员**: 通过配置的告警渠道
3. **调查原因**: 分析日志和事件数据
4. **修复问题**: 部署修复或更新
5. **恢复服务**: `node ops-control.js unpause`

### 6.2 系统故障响应

1. **检查服务状态**: `pm2 status`
2. **查看日志**: `pm2 logs`
3. **重启服务**: `pm2 restart [service-name]`
4. **如无法恢复**: 回滚到上一个稳定版本

## 7. 最佳实践

### 7.1 安全实践

- 定期轮换私钥和访问令牌
- 使用多签钱包管理敏感操作
- 限制运维脚本的访问权限
- 定期审计合约和系统代码

### 7.2 监控实践

- 设置合理的告警阈值
- 定期测试告警系统
- 保留足够的日志数据
- 建立值班响应机制

### 7.3 备份实践

- 定期备份数据库
- 备份配置文件和环境变量
- 测试恢复流程
- 保留多个时间点的备份

## 8. 故障排除

### 8.1 常见问题

**RPC连接失败**:
- 检查网络连接
- 验证RPC URL配置
- 检查防火墙设置

**合约事件监听失败**:
- 验证合约地址和ABI
- 检查事件过滤器
- 查看RPC节点状态

**告警通知失败**:
- 验证Webhook URL和令牌
- 检查网络连接
- 查看服务商限制

### 8.2 日志分析

关键日志文件：
- `logs/error.log`: 错误日志
- `logs/out.log`: 标准输出
- `logs/combined.log`: 合并日志
- 合约监听器专用日志

## 9. 联系方式

**运维团队**: ops@liqpass.com  
**紧急响应**: +1-555-0123 (24/7)  
**文档更新**: 定期检查此文档的最新版本

---

*最后更新: 2024年1月*  
*版本: v1.0*