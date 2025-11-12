# PR: 订单服务内存存储改造 - 实现数据持久化

## 概述
本PR将订单服务从内存存储迁移到SQLite数据库，解决服务重启导致订单数据丢失、无法回填链上事件等关键问题。

## 问题背景
当前 <mcsymbol name="OrderService" filename="orderService.ts" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/us-backend/src/services/orderService.ts" startline="38" type="class">OrderService</mcsymbol> 使用内存Map存储订单数据，存在以下严重问题：
- **重启丢失**：服务重启后所有订单、报价、幂等性数据丢失
- **无法回填**：链上事件无法匹配重启前的pending订单
- **数据不一致**：与数据库中的`contract_events`表数据脱节

## 解决方案
### 1. 复用现有DB封装
- 复用已存在的 <mcsymbol name="OrderServiceDb" filename="orderServiceDb.ts" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/us-backend/src/services/orderServiceDb.ts" startline="65" type="class">OrderServiceDb</mcsymbol> 类
- 将 `createOrder`、`update/markPaid*`、`getById` 改为直连SQLite
- 启动时加载历史订单到只读缓存

### 2. 新增数据库迁移
- 创建 <mcfile name="011_enhance_orders_table.sql" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/us-backend/src/database/migrations/011_enhance_orders_table.sql"></mcfile>
- 补全orders表必要字段和唯一索引
- 添加数据完整性约束和性能索引

### 3. 集成测试验证
- 创建 <mcfile name="orderPersistence.test.ts" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/us-backend/src/tests/integration/orderPersistence.test.ts"></mcfile>
- 验证创建订单→重启服务→查询订单的完整流程
- 测试幂等性控制和链上回填功能

## 技术实现

### 内存存储现状分析
**当前仅在内存保存的数据结构：**
```typescript
// orderService.ts 中的内存存储
private readonly quotes = new Map<string, QuoteStorageRecord>();
private readonly orders = new Map<string, OrderRecord>();
private readonly idempotencyIndex = new Map<string, string>();
private readonly orderRefIndex = new Map<string, string>();
```

**关键副作用：**
- 所有订单数据仅存在于内存，重启即丢失
- 链上事件回填依赖内存中的pending订单
- 无法支持分布式部署

### 改造方案
1. **数据库优先设计**：所有订单操作直接写入SQLite
2. **只读缓存**：启动时加载历史订单到内存缓存，提升读取性能
3. **向后兼容**：保持现有API接口不变

### 新增迁移文件
```sql
-- 补全关键字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'permit2';

-- 添加唯一索引支持幂等性
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency 
ON orders(wallet_address, payment_proof_id) 
WHERE payment_proof_id IS NOT NULL;
```

## 风险分析

### 高风险项
1. **并发写入冲突**
   - **风险**：多线程同时写入可能导致数据不一致
   - **缓解**：使用SQLite事务和行级锁
   - **监控**：添加并发冲突检测和重试机制

2. **幂等性控制失效**
   - **风险**：数据库唯一约束可能被绕过
   - **缓解**：强化数据库约束，添加应用层校验
   - **测试**：全面测试幂等性场景

3. **WAL模式兼容性**
   - **风险**：Write-Ahead Logging模式下的性能问题
   - **缓解**：配置合适的WAL检查点间隔
   - **监控**：监控WAL文件大小和检查点频率

### 中风险项
1. **数据库性能瓶颈**
   - 大量订单查询可能影响响应时间
   - 解决方案：添加合适索引，使用只读缓存

2. **数据迁移完整性**
   - 迁移过程中可能丢失部分数据
   - 解决方案：实施双重验证和回滚机制

## 回滚方案

### 紧急回滚步骤
1. **代码回滚**：恢复使用内存存储的OrderService版本
2. **数据迁移回退**：执行回滚迁移脚本
3. **服务重启**：重启服务加载内存数据

### 回滚迁移脚本
```sql
-- 回滚脚本：011_enhance_orders_table_rollback.sql
DROP INDEX IF EXISTS idx_orders_idempotency;
DROP INDEX IF EXISTS idx_orders_external_ref;
-- 保留数据字段，仅禁用新功能
```

### 回滚验证
1. 验证订单API返回数据与内存存储一致
2. 确认链上回填功能正常工作
3. 检查服务监控指标恢复正常

## 测试计划

### 单元测试
- [ ] OrderServiceDb 数据库操作测试
- [ ] 幂等性控制测试
- [ ] 链上回填逻辑测试

### 集成测试
- [ ] 创建订单→重启服务→查询验证
- [ ] 并发订单创建测试
- [ ] 链上事件匹配测试

### 性能测试
- [ ] 数据库连接池性能
- [ ] 高并发订单创建
- [ ] 大数据量查询性能

## 部署策略

### 阶段一：预发布环境
1. 执行数据库迁移
2. 部署新版本服务
3. 运行集成测试套件
4. 监控性能指标

### 阶段二：生产环境灰度
1. 10%流量切换到新版本
2. 监控错误率和性能
3. 逐步增加流量比例

### 阶段三：全量部署
1. 100%流量切换
2. 持续监控48小时
3. 确认无异常后关闭回滚预案

## SQL验收示例

### 基础验收
```sql
-- 查看最新3个订单
SELECT id, status, created_at FROM orders ORDER BY created_at DESC LIMIT 3;
```

### 业务链路验证
```sql
-- 订单与合约事件关联查询
SELECT o.id, o.status, ce.event_name, ce.amount_usdc 
FROM orders o LEFT JOIN contract_events ce ON o.id = ce.order_id
WHERE o.status IN ('pending', 'paid') LIMIT 10;
```

## 成功标准

### 功能标准
- [ ] 订单数据在服务重启后持久化
- [ ] 链上事件能够正确回填历史订单
- [ ] 幂等性控制正常工作
- [ ] API响应时间保持在可接受范围内

### 性能标准
- [ ] 订单创建延迟 < 100ms
- [ ] 订单查询延迟 < 50ms
- [ ] 数据库连接池利用率 < 80%
- [ ] 内存使用量稳定

### 监控标准
- [ ] 错误率 < 0.1%
- [ ] 99%请求延迟 < 200ms
- [ ] 数据库锁等待时间 < 10ms

## 责任矩阵

| 任务 | 负责人 | 时间点 | 完成标准 |
|------|--------|--------|----------|
| 代码开发 | 开发团队 | D+1 | PR通过评审 |
| 数据库迁移 | DBA | D+2 | 迁移脚本验证通过 |
| 集成测试 | QA团队 | D+3 | 测试用例全部通过 |
| 生产部署 | DevOps | D+5 | 监控指标正常 |

## 沟通计划

### 内部沟通
- **技术评审**：开发团队内部评审设计方案
- **风险同步**：向产品经理同步风险点和缓解措施
- **进度更新**：每日站会同步开发进度

### 外部沟通
- **用户通知**：部署前通知用户可能的服务中断
- **监控告警**：设置关键指标告警阈值
- **应急响应**：建立7x24小时应急响应机制

## 总结
本PR通过将订单服务从内存存储迁移到数据库，解决了服务重启数据丢失的核心问题，提升了系统可靠性和可维护性。方案采用渐进式部署和完备的回滚机制，确保平滑过渡和业务连续性。