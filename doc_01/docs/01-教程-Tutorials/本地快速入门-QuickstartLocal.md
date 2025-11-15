# 30分钟本地快速入门

## 目标

在30分钟内完成本地环境搭建，跑通"支付→事件→入库→验证"完整流程。

## 前置条件

### 系统要求
- **Node.js**：20.x 或更高版本
- **Python**：3.10.x 或更高版本
- **pnpm**：8.x 或更高版本
- **Git**：2.x 或更高版本

### 区块链环境
- **Base测试网RPC**：可访问的Base测试网节点
- **测试USDC**：Base测试网上的USDC测试代币
- **测试ETH**：用于支付Gas费用的测试ETH

## 步骤

### 1. 克隆与安装

```bash
# 克隆项目
git clone https://github.com/your-org/leverageguard-attestor.git
cd leverageguard-attestor

# 安装依赖
pnpm -w install
```

**验证点**：
- [ ] 项目成功克隆
- [ ] 所有依赖安装完成
- [ ] 无错误信息输出

### 2. 环境配置

```bash
# 复制环境变量模板
cp apps/us-backend/.env.sample apps/us-backend/.env
cp apps/chain-listener/.env.sample apps/chain-listener/.env
cp apps/jp-verify/.env.sample apps/jp-verify/.env

# 编辑环境变量（根据实际情况修改）
# us-backend/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/liqpass"
BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/your-api-key"
PRIVATE_KEY="your-test-private-key"

# chain-listener/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/liqpass"
BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/your-api-key"

# jp-verify/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/liqpass"
EXCHANGE_API_KEY="your-exchange-api-key"
```

**验证点**：
- [ ] 环境变量文件创建成功
- [ ] 所有必要配置项已填写
- [ ] 数据库连接可正常建立

### 3. 启动数据库

```bash
# 使用Docker启动PostgreSQL
docker run -d --name liqpass-db \
  -e POSTGRES_DB=liqpass \
  -e POSTGRES_USER=liqpass \
  -e POSTGRES_PASSWORD=liqpass123 \
  -p 5432:5432 \
  postgres:15

# 等待数据库启动
sleep 10

# 验证数据库连接
psql postgresql://liqpass:liqpass123@localhost:5432/liqpass -c "SELECT version();"
```

**验证点**：
- [ ] 数据库容器成功启动
- [ ] 数据库连接正常
- [ ] 版本查询返回正确结果

### 4. 启动服务

打开三个终端窗口，分别启动三个核心服务：

**终端1 - us-backend**
```bash
cd apps/us-backend
pnpm dev
```

**终端2 - chain-listener**
```bash
cd apps/chain-listener
pnpm start
```

**终端3 - jp-verify**
```bash
cd apps/jp-verify
python main.py
```

**验证点**：
- [ ] us-backend服务启动，监听3000端口
- [ ] chain-listener服务启动，开始监听事件
- [ ] jp-verify服务启动，API服务就绪

### 5. 健康检查

```bash
# 检查us-backend健康状态
curl http://localhost:3000/healthz

# 检查chain-listener状态
curl http://localhost:3001/healthz

# 检查jp-verify状态
curl http://localhost:8000/healthz
```

**预期响应**：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

**验证点**：
- [ ] 所有服务健康检查通过
- [ ] 返回正确的状态信息
- [ ] 服务版本信息正确

### 6. 触发最小支付流程

使用提供的测试脚本创建保险订单：

```bash
# 运行测试脚本
cd scripts
./create-test-order.js
```

**脚本内容示例**：
```javascript
// create-test-order.js
const { ethers } = require('ethers');

async function createTestOrder() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  // 调用合约创建订单
  const tx = await contract.createOrder(1000, 3, 7); // 1000 USDC, 3倍杠杆, 7天
  await tx.wait();
  
  console.log('订单创建成功，交易哈希:', tx.hash);
}

createTestOrder().catch(console.error);
```

**验证点**：
- [ ] 交易成功提交到区块链
- [ ] 交易哈希正确返回
- [ ] 订单状态在数据库中正确记录

### 7. 验证完整流程

检查各个环节的数据状态：

```bash
# 检查数据库订单记录
psql postgresql://liqpass:liqpass123@localhost:5432/liqpass -c "SELECT * FROM orders ORDER BY created_at DESC LIMIT 1;"

# 检查事件监听记录
psql postgresql://liqpass:liqpass123@localhost:5432/liqpass -c "SELECT * FROM contract_events ORDER BY block_number DESC LIMIT 5;"

# 检查API订单查询
curl http://localhost:3000/api/v1/orders/latest
```

**验证点**：
- [ ] 数据库中有新创建的订单记录
- [ ] 合约事件被正确监听和存储
- [ ] API返回正确的订单信息

## 预期结果

完成以上步骤后，你应该看到以下5个验证点全部通过：

- [ ] **事件监听**：chain-listener成功监听到合约事件
- [ ] **数据入库**：订单和事件数据正确存入数据库
- [ ] **状态流转**：订单状态从pending正确流转到active
- [ ] **验证服务**：jp-verify服务正常运行
- [ ] **健康探针**：所有服务健康检查通过

## 故障排查

### RPC不可达
**症状**：服务启动失败，连接区块链超时
**解决**：检查RPC URL配置，确认网络连接

### 密钥缺失
**症状**：交易提交失败，权限错误
**解决**：检查私钥配置，确认钱包有足够测试ETH

### 数据库连接失败
**症状**：服务启动失败，数据库连接错误
**解决**：检查数据库服务状态，确认连接字符串正确

### 回放高度错误
**症状**：chain-listener启动时区块高度错误
**解决**：检查起始区块配置，可能需要重置监听器

## 下一步

完成本地快速入门后，你可以：
- [查看操作指南](../02-how-to/) 解决具体问题
- [参考API文档](../03-reference/api/) 了解技术细节
- [阅读架构说明](../00-overview/architecture.md) 理解系统原理

## 相关链接

- [系统架构](../00-overview/architecture.md)
- [API参考](../03-reference/api/)
- [运维指南](../05-ops/)
- [测试规范](../06-testing/)