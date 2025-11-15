# 运行烟囱测试

## 目的

验证系统核心功能是否正常工作，确保"USDC→事件→入库→验证"流程完整可用。

## 触发条件

- 新版本部署后
- 系统配置变更后
- 定期健康检查（每日）

## 前置条件

- 所有服务正常运行（us-backend、chain-listener、jp-verify）
- 数据库连接正常
- 区块链RPC节点可访问
- 测试钱包有足够测试USDC和ETH

## 操作步骤

### 1. 准备测试环境

```bash
# 切换到项目根目录
cd /Users/zhaomosheng/Desktop/LiqPass-clean

# 检查服务状态
./scripts/check-services.sh
```

**check-services.sh脚本内容**：
```bash
#!/bin/bash

# 检查us-backend
curl -f http://localhost:3000/healthz || echo "us-backend服务异常"

# 检查chain-listener
curl -f http://localhost:3001/healthz || echo "chain-listener服务异常"

# 检查jp-verify
curl -f http://localhost:8000/healthz || echo "jp-verify服务异常"

# 检查数据库连接
psql $DATABASE_URL -c "SELECT 1;" || echo "数据库连接异常"

echo "服务状态检查完成"
```

### 2. 执行烟囱测试

```bash
# 运行烟囱测试脚本
./scripts/smoke-test.js
```

**smoke-test.js脚本内容**：
```javascript
const { ethers } = require('ethers');
const axios = require('axios');

async function runSmokeTest() {
  console.log('🚀 开始烟囱测试...');
  
  // 1. 创建测试订单
  console.log('1. 创建测试订单...');
  const orderResponse = await axios.post('http://localhost:3000/api/v1/orders', {
    amount: 1000,    // 1000 USDC
    leverage: 3,     // 3倍杠杆
    duration: 1,     // 1天保险期限
    currency: 'USDC'
  }, {
    headers: { 'Authorization': `Bearer ${process.env.TEST_API_KEY}` }
  });
  
  const orderId = orderResponse.data.order_id;
  console.log(`✅ 订单创建成功: ${orderId}`);
  
  // 2. 等待事件处理（最多等待30秒）
  console.log('2. 等待事件处理...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // 3. 验证订单状态
  console.log('3. 验证订单状态...');
  const statusResponse = await axios.get(`http://localhost:3000/api/v1/orders/${orderId}`);
  
  if (statusResponse.data.status === 'active') {
    console.log('✅ 订单状态正确: active');
  } else {
    throw new Error(`订单状态异常: ${statusResponse.data.status}`);
  }
  
  // 4. 检查数据库记录
  console.log('4. 检查数据库记录...');
  const dbCheck = await axios.get('http://localhost:3000/api/v1/debug/orders');
  const latestOrder = dbCheck.data.orders[0];
  
  if (latestOrder.order_id === orderId) {
    console.log('✅ 数据库记录正确');
  } else {
    throw new Error('数据库记录不匹配');
  }
  
  // 5. 验证事件监听
  console.log('5. 验证事件监听...');
  const eventsResponse = await axios.get('http://localhost:3001/api/v1/events/recent');
  const recentEvents = eventsResponse.data.events;
  
  const orderEvent = recentEvents.find(e => e.order_id === orderId);
  if (orderEvent) {
    console.log('✅ 事件监听正常');
  } else {
    throw new Error('未找到对应事件记录');
  }
  
  console.log('🎉 烟囱测试全部通过！');
  return true;
}

runSmokeTest().catch(error => {
  console.error('❌ 烟囱测试失败:', error.message);
  process.exit(1);
});
```

### 3. 验证测试结果

```bash
# 检查测试日志
cat smoke-test.log

# 验证关键指标
./scripts/check-metrics.sh
```

**check-metrics.sh脚本内容**：
```bash
#!/bin/bash

# 检查订单数量
ORDER_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '1 hour';" | tr -d ' ')
echo "最近1小时订单数: $ORDER_COUNT"

# 检查事件数量
EVENT_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM contract_events WHERE created_at > NOW() - INTERVAL '1 hour';" | tr -d ' ')
echo "最近1小时事件数: $EVENT_COUNT"

# 检查服务错误率
ERROR_RATE=$(curl -s http://localhost:3000/metrics | grep 'http_requests_total' | grep 'code=5' | wc -l)
echo "5xx错误数量: $ERROR_RATE"

# 检查区块链同步状态
SYNC_STATUS=$(curl -s http://localhost:3001/status | jq -r '.blockchain.synced')
echo "区块链同步状态: $SYNC_STATUS"
```

## 验证点

### 必须通过的检查点
- [ ] **服务健康**：所有核心服务健康检查通过
- [ ] **订单创建**：能够成功创建保险订单
- [ ] **状态流转**：订单状态正确从pending流转到active
- [ ] **事件监听**：合约事件被正确监听和存储
- [ ] **数据一致性**：数据库记录与链上数据一致

### 可选检查点
- [ ] **性能指标**：API响应时间在可接受范围内
- [ ] **错误率**：服务错误率低于阈值（<1%）
- [ ] **资源使用**：CPU、内存使用率正常
- [ ] **日志输出**：无异常错误日志

## 预期输出

**成功情况**：
```
🚀 开始烟囱测试...
1. 创建测试订单...
✅ 订单创建成功: order_123456
2. 等待事件处理...
3. 验证订单状态...
✅ 订单状态正确: active
4. 检查数据库记录...
✅ 数据库记录正确
5. 验证事件监听...
✅ 事件监听正常
🎉 烟囱测试全部通过！
```

**失败情况**：
```
🚀 开始烟囱测试...
1. 创建测试订单...
❌ 烟囱测试失败: 订单创建失败 - 连接超时
```

## 回滚步骤

如果烟囱测试失败，需要执行回滚：

### 1. 停止测试流程
```bash
# 停止所有测试相关进程
pkill -f smoke-test
```

### 2. 清理测试数据
```bash
# 删除测试订单（避免影响生产数据）
psql $DATABASE_URL -c "DELETE FROM orders WHERE order_id LIKE 'test_%';"
psql $DATABASE_URL -c "DELETE FROM contract_events WHERE order_id LIKE 'test_%';"
```

### 3. 恢复服务状态
```bash
# 重启异常服务
./scripts/restart-services.sh

# 验证服务恢复
./scripts/check-services.sh
```

### 4. 问题排查
根据错误信息进行具体问题排查：
- 检查服务日志：`journalctl -u liqpass-*`
- 检查数据库连接：`psql $DATABASE_URL -c "SELECT 1;"`
- 检查区块链连接：`curl $BASE_RPC_URL`

## 风险与影响

### 风险评估
- **低风险**：测试使用测试网络和测试数据
- **影响范围**：仅影响测试环境，不影响生产数据
- **恢复时间**：通常在5分钟内可完成回滚

### 监控指标
测试期间需要重点关注：
- 服务响应时间
- 数据库连接数
- 区块链Gas费用
- 错误日志频率

## 相关链接

- [快速入门](../01-tutorials/quickstart-local.md)
- [部署指南](./deploy-backend.md)
- [运维监控](../05-ops/probe-and-healthz.md)
- [测试规范](../06-testing/e2e-flow.md)