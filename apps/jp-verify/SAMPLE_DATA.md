# 样例输入输出数据

## 输入请求示例

### 1. 正常验证请求
```json
{
  "exchange": "okx",
  "ordId": "1234567890",
  "instId": "BTC-USDT-SWAP",
  "live": true,
  "fresh": true,
  "keyMode": "inline",
  "apiKey": "your-api-key-here",
  "secretKey": "your-secret-key-here",
  "passphrase": "your-passphrase-here",
  "uid": "user123"
}
```

### 2. 错误场景请求（无效订单）
```json
{
  "exchange": "okx",
  "ordId": "invalid-order-id",
  "instId": "BTC-USDT-SWAP",
  "live": true,
  "fresh": true,
  "keyMode": "inline",
  "apiKey": "your-api-key-here",
  "secretKey": "your-secret-key-here",
  "passphrase": "your-passphrase-here"
}
```

## 成功响应示例

### 完整成功响应
```json
{
  "meta": {
    "exchange": "okx",
    "instId": "BTC-USDT-SWAP",
    "ordId": "1234567890",
    "verifiedAt": "2025-11-03T22:31:45.123Z",
    "live": true,
    "fresh": true,
    "requestId": "req_abc123def456",
    "version": "jp-verify@1.0.0"
  },
  "normalized": {
    "data": {
      "exchange": "okx",
      "account_id": "user123",
      "symbol": "BTC-USDT-SWAP",
      "order_id": "1234567890",
      "side": "buy",
      "leverage": "50",
      "margin_mode": "isolated",
      "liq_flag": "false",
      "timestamp_sec": "1699045905",
      "filled_sz": "1.0",
      "avg_px": "65010.2",
      "liq_px": "64010.0",
      "reason": ""
    },
    "canonical_json": "{\"account_id\":\"user123\",\"avg_px\":\"65010.2\",\"exchange\":\"okx\",\"filled_sz\":\"1.0\",\"leverage\":\"50\",\"liq_flag\":\"false\",\"liq_px\":\"64010.0\",\"margin_mode\":\"isolated\",\"order_id\":\"1234567890\",\"reason\":\"\",\"side\":\"buy\",\"symbol\":\"BTC-USDT-SWAP\",\"timestamp_sec\":\"1699045905\"}",
    "evidence_root": "0x7f8a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2"
  },
  "raw": {
    "trade/order": {
      "code": "0",
      "msg": "",
      "data": [{
        "instType": "SWAP",
        "instId": "BTC-USDT-SWAP",
        "ordId": "1234567890",
        "clOrdId": "client-order-id",
        "tag": "",
        "px": "65000.5",
        "sz": "1.0",
        "pnl": "10.2",
        "ordType": "limit",
        "side": "buy",
        "posSide": "long",
        "tdMode": "isolated",
        "tgtCcy": "",
        "state": "filled",
        "lever": "50",
        "feeCcy": "USDT",
        "fee": "-1.23",
        "category": "normal",
        "uTime": "1699045905123",
        "cTime": "1699045900123",
        "fillTime": "1699045905123",
        "tradeId": "1234567",
        "accFillSz": "1.0",
        "fillPx": "65010.2",
        "fillSz": "1.0",
        "fillFee": "-1.23",
        "fillFeeCcy": "USDT",
        "execType": "T",
        "fillPnl": "10.2",
        "avgPx": "65010.2",
        "uid": "user123"
      }]
    },
    "account/positions": {
      "code": "0",
      "msg": "",
      "data": [{
        "instType": "SWAP",
        "instId": "BTC-USDT-SWAP",
        "posSide": "long",
        "pos": "1.0",
        "baseBal": "",
        "quoteBal": "",
        "posCcy": "BTC",
        "avgPx": "65010.2",
        "upl": "10.2",
        "uplRatio": "0.0015",
        "instType": "SWAP",
        "mgnMode": "isolated",
        "mgnRatio": "0.15",
        "mmr": "100.5",
        "imr": "200.3",
        "lever": "50",
        "liqPx": "64010.0",
        "markPx": "65020.1",
        "posId": "1234567",
        "uTime": "1699045905123",
        "cTime": "1699045900123",
        "bePx": "65000.0",
        "interest": "0",
        "tradeId": "1234567",
        "autoCcy": "",
        "ccy": "USDT",
        "maxLoan": "",
        "loan": "",
        "loanCost": "",
        "spotInUse": false,
        "uplLast": "10.2",
        "cTime": "1699045900123"
      }]
    },
    "public/instruments": {
      "code": "0",
      "msg": "",
      "data": [{
        "instType": "SWAP",
        "instId": "BTC-USDT-SWAP",
        "uly": "BTC-USDT",
        "category": "1",
        "baseCcy": "BTC",
        "quoteCcy": "USDT",
        "settleCcy": "USDT",
        "ctVal": "0.01",
        "ctMult": "1",
        "ctValCcy": "BTC",
        "optType": "",
        "stk": "",
        "listTime": "1609430400000",
        "expTime": "",
        "lever": "125",
        "tickSz": "0.1",
        "lotSz": "1",
        "minSz": "1",
        "ctType": "inverse",
        "alias": "",
        "state": "live"
      }]
    }
  },
  "evidence": {
    "schemaVersion": "1.0.0",
    "hashAlgo": "keccak256",
    "serialization": "jcs-canonical-json",
    "leaves": [
      {
        "path": "raw.trade/order",
        "hash": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2"
      },
      {
        "path": "raw.account/positions",
        "hash": "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3"
      },
      {
        "path": "normalized.evidence",
        "hash": "0x7f8a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2"
      }
    ],
    "root": "0x7f8a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2",
    "rootAlgo": "keccak256-evidence-root-v1",
    "bundleHash": "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4",
    "evidenceId": "evi_20251103_223145_abc123de",
    "parentRoot": null
  },
  "perf": {
    "okxRttMs": 850,
    "totalMs": 950,
    "cache": false,
    "rateLimit": {
      "remaining": 98,
      "resetSec": 1
    }
  },
  "error": null
}
```

## 错误响应示例

### API 认证错误
```json
{
  "meta": {
    "exchange": "okx",
    "instId": "BTC-USDT-SWAP",
    "ordId": "invalid-order-id",
    "verifiedAt": "2025-11-03T22:31:45.123Z",
    "live": true,
    "fresh": true,
    "requestId": "req_def456ghi789",
    "version": "jp-verify@1.0.0"
  },
  "normalized": null,
  "raw": null,
  "evidence": null,
  "perf": {
    "totalMs": 120,
    "cache": false
  },
  "error": {
    "code": "OKX_AUTH_401",
    "msg": "API 密钥无效或签名错误",
    "hint": "请检查 API 密钥配置和网络连接"
  }
}
```

### 内部服务器错误
```json
{
  "meta": {
    "exchange": "okx",
    "instId": "BTC-USDT-SWAP",
    "ordId": "test-order-id",
    "verifiedAt": "2025-11-03T22:31:45.123Z",
    "live": true,
    "fresh": true,
    "requestId": "req_ghi789jkl012",
    "version": "jp-verify@1.0.0"
  },
  "normalized": null,
  "raw": null,
  "evidence": null,
  "perf": {
    "totalMs": 50,
    "cache": false
  },
  "error": {
    "code": "INTERNAL_ERROR",
    "msg": "网络连接超时",
    "hint": "内部服务器错误，请联系技术支持"
  }
}
```

## 待补全证据示例

### 待补全证据文件内容
```json
{
  "pendingId": "pending_20251103_223145_abc123de",
  "request": {
    "exchange": "okx",
    "ordId": "invalid-order-id",
    "instId": "BTC-USDT-SWAP",
    "uid": "user123"
  },
  "error": {
    "code": "OKX_AUTH_401",
    "msg": "API 密钥无效或签名错误",
    "hint": "请检查 API 密钥配置和网络连接"
  },
  "createdAt": "2025-11-03T22:31:45.123Z",
  "status": "pending"
}
```

## 验证测试用例

### 用例 1: 手动验证 evidence_root
```python
import hashlib
import json
from rfc8785 import dumps as jcs_dumps

# 获取响应中的 normalized data
normalized_data = response["normalized"]["data"]

# 手动创建 JCS Canonical JSON
canonical_json = jcs_dumps(normalized_data).decode('utf-8')

# 手动计算 evidence_root
manual_root = "0x" + hashlib.sha3_256(canonical_json.encode()).hexdigest()

# 验证
assert manual_root == response["normalized"]["evidence_root"]
print("✅ evidence_root 验证通过")
```

### 用例 2: 重复性验证
```python
# 同一订单多次验证，evidence_root 应该一致
response1 = requests.post(url, json=request_data)
response2 = requests.post(url, json=request_data)

root1 = response1.json()["normalized"]["evidence_root"]
root2 = response2.json()["normalized"]["evidence_root"]

assert root1 == root2
print("✅ 重复性验证通过")
```

### 用例 3: 字段完整性验证
```python
# 验证必填字段都存在
normalized_data = response["normalized"]["data"]
required_fields = [
    "exchange", "account_id", "symbol", "order_id", "side",
    "leverage", "margin_mode", "liq_flag", "timestamp_sec",
    "filled_sz", "avg_px", "liq_px", "reason"
]

for field in required_fields:
    assert field in normalized_data, f"缺少必填字段: {field}"

print("✅ 字段完整性验证通过")
```

## 文件路径
- 输入示例：<mcfile name="sample-input.json" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/samples/sample-input.json"></mcfile>
- 输出示例：<mcfile name="sample-output.json" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/samples/sample-output.json"></mcfile>
- 错误示例：<mcfile name="sample-error.json" path="/Users/zhaomosheng/Desktop/LiqPass-clean/apps/jp-verify/samples/sample-error.json"></mcfile>