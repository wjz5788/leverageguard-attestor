# 证据服务端到端复核步骤

## 概述
本文档描述了 jp-verify 证据服务的端到端复核步骤，确保三件套（原始快照、规范化 JSON、evidence_root）的正确性。

## 三件套说明

### 1. 原始快照 (Raw Snapshot)
- **trade/order**: OKX 订单 API 原始响应数据
- **account/positions**: OKX 持仓 API 原始响应数据  
- **public/instruments**: OKX 交易品种 API 原始响应数据

### 2. 规范化 JSON (Canonical JSON)
- 使用 JCS (RFC 8785) 规范进行序列化
- 字段映射最小集：exchange/account_id/symbol/order_id/side/leverage/margin_mode/liq_flag/timestamp_sec/filled_sz/avg_px/liq_px/reason
- 数值以字符串承载
- 剔除空字段

### 3. evidence_root
- 计算方式：evidence_root = keccak256(UTF8(CanonicalJSON))
- 作为证据的根哈希值

## 复核步骤

### 步骤 1: 环境准备
```bash
# 安装依赖
cd /Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 OKX API 密钥信息
```

### 步骤 2: 启动服务
```bash
# 启动服务
python main.py

# 或使用 start.sh
./start.sh
```

### 步骤 3: 发送验证请求
```bash
# 测试请求
curl -X POST http://localhost:8082/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "okx",
    "ordId": "test-order-id",
    "instId": "BTC-USDT-SWAP",
    "live": true,
    "fresh": true,
    "keyMode": "inline",
    "apiKey": "your-api-key",
    "secretKey": "your-secret-key",
    "passphrase": "your-passphrase"
  }'
```

### 步骤 4: 验证三件套

#### 4.1 验证原始快照
检查响应中的 `raw` 字段：
```json
{
  "raw": {
    "trade/order": { /* OKX 订单 API 原始数据 */ },
    "account/positions": { /* OKX 持仓 API 原始数据 */ },
    "public/instruments": { /* OKX 交易品种 API 原始数据 */ }
  }
}
```

验证要点：
- 数据结构与 OKX API 文档一致
- 包含必要的订单、持仓、品种信息
- 时间戳格式正确

#### 4.2 验证规范化 JSON
检查响应中的 `normalized` 字段：
```json
{
  "normalized": {
    "data": { /* 规范化后的字段 */ },
    "canonical_json": "{\"exchange\":\"okx\",...}",
    "evidence_root": "0x..."
  }
}
```

验证要点：
- 字段映射正确（9个必填字段）
- 数值以字符串形式存储
- 空字段已被剔除
- JCS 序列化格式正确

#### 4.3 验证 evidence_root
手动计算验证：
```python
import hashlib
from rfc8785 import dumps as jcs_dumps

# 获取 canonical_json
canonical_json = response["normalized"]["canonical_json"]

# 计算 evidence_root
expected_root = "0x" + hashlib.sha3_256(canonical_json.encode()).hexdigest()

# 验证
assert expected_root == response["normalized"]["evidence_root"]
```

### 步骤 5: 复算验证

#### 5.1 随机选择 3 笔订单
选择不同的订单 ID 进行测试，确保每笔订单都能产生一致的结果。

#### 5.2 重复计算验证
对同一笔订单重复调用验证接口，确保：
- evidence_root 保持一致
- canonical_json 保持一致（相同输入）
- 原始快照数据一致（相同时间窗口）

### 步骤 6: 失败路径测试

#### 6.1 API 错误处理
模拟以下错误场景：
- 无效 API 密钥
- 订单不存在
- 网络超时
- 交易所限流

验证：
- 错误信息准确
- 生成 pending_evidence 记录
- 待补全数据保存正确

#### 6.2 检查待补全证据
```bash
# 查看待补全证据目录
ls -la reports/pending_evidence/$(date +%Y-%m-%d)/

# 检查待补全证据内容
cat reports/pending_evidence/$(date +%Y-%m-%d)/pending_*.json
```

验证要点：
- 包含请求参数
- 记录错误信息
- 状态标记为 "pending"

### 步骤 7: 证据文件验证

#### 7.1 检查证据保存
```bash
# 查看证据目录
ls -la reports/evidence/$(date +%Y-%m-%d)/

# 证据文件格式
{evidence_id}.json    # 完整证据数据
{evidence_id}.root    # 根哈希值
```

#### 7.2 验证证据完整性
```bash
# 检查 JSON 文件格式
jq . reports/evidence/$(date +%Y-%m-%d)/*.json

# 验证根哈希文件内容
cat reports/evidence/$(date +%Y-%m-%d)/*.root
```

## 自动化测试

### 运行测试脚本
```bash
# 运行现有测试
cd tests
python test-python-okx.py

# 或运行 Node.js 测试
node test-okx-local.js
```

### 验证测试覆盖
确保测试覆盖：
- ✅ 正常验证流程
- ✅ 错误处理流程
- ✅ 三件套数据完整性
- ✅ evidence_root 计算正确性
- ✅ pending_evidence 生成

## 性能验证

### 响应时间检查
监控接口响应时间：
```bash
# 使用 curl 测试响应时间
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8082/api/verify
```

### 并发测试
```bash
# 使用 ab 进行并发测试
ab -n 100 -c 10 -p test-data.json -T application/json http://localhost:8082/api/verify/
```

## 安全验证

### 数据脱敏检查
确保日志中不包含：
- API 密钥
- 密钥信息
- 用户敏感数据

### 访问控制
验证：
- CORS 配置正确
- 速率限制生效
- 错误信息不泄露敏感信息

## 问题排查

### 常见问题
1. **evidence_root 不匹配**
   - 检查 JCS 序列化是否正确
   - 验证字段映射是否完整
   - 确认哈希算法使用 keccak256

2. **API 调用失败**
   - 检查 API 密钥配置
   - 验证网络连接
   - 查看 OKX API 状态

3. **证据保存失败**
   - 检查目录权限
   - 验证磁盘空间
   - 查看错误日志

### 调试工具
```bash
# 查看服务日志
tail -f /var/log/jp-verify.log

# 检查环境变量
python -c "import os; print(os.environ)"

# 测试 API 连通性
curl -H "OK-ACCESS-KEY: your-key" ...
```

## 验收标准

✅ **功能验证**
- 三件套数据完整生成
- 字段映射准确（9个必填字段）
- JCS 规范化正确
- evidence_root 计算准确

✅ **一致性验证**
- 随机 3 笔订单复算结果一致
- 重复调用结果一致

✅ **错误处理**
- 失败路径进入待补全
- pending_evidence 正确生成

✅ **文档完整性**
- 端到端复核步骤文档完整
- 接口 diff 说明清晰
- 样例输入输出完整

## 附录

### 相关文件
- <mcfile name="main.py" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/main.py"></mcfile>
- <mcfile name="requirements.txt" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/requirements.txt"></mcfile>
- <mcfile name="VERIFICATION_STEPS.md" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/VERIFICATION_STEPS.md"></mcfile>

### 参考链接
- [JCS Canonical JSON (RFC 8785)](https://tools.ietf.org/html/rfc8785)
- [OKX API 文档](https://www.okx.com/docs-v5/)
- [keccak256 算法](https://keccak.team/keccak.html)