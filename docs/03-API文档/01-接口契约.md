# LiqPass 接口契约 v1.1（收敛版：FE↔US↔JP，最小闭环＋证据）

> 目标：**安全、可审计、可扩展**。本版统一命名、修正布尔/数值类型、移除前端传密钥、明确幂等与可观测字段，并与 v1.1 数据库 Schema 对齐。

---

## 0. 版本与通用约定
- API 前缀：`/api/v1`（前端调用 US 后端）；JP 服务无版本前缀（由 US 代理）。
- 编码：UTF-8；`Content-Type: application/json`。
- 时间：UTC ISO8601（如 `2025-11-04T09:00:00Z`）。
- 金额与价格：**字符串表示的小数**（避免精度丢失），字段名以 `*_usd`/`price` 结尾。
- ID：对外展示使用 `*_uid`（ULID/UUIDv7）；交易所原始 ID 使用 `ordId`/`instId` 原样保存。
- 通用请求头：
  - `Authorization: Bearer <token>`（FE→US）
  - `X-Request-Id`（可选，若未提供由服务生成并回显）
  - `Idempotency-Key`（对写/编排类接口可选，启用时保证重放安全）

- 通用响应头：
  - `X-Request-Id`：贯穿链路（US 透传至 JP 并回显）
  - 速率：`X-RateLimit-Limit|Remaining|Reset`；超限返回 `429` 并含 `Retry-After`

- 错误统一：
```json
{
  "success": false,
  "error": { "code": "400_VALIDATION", "message": "...", "details": {"field": "..."} }
}
```
HTTP 状态码与 `error.code` 对齐（见 §7）。

---

## 1. 前端 ↔ US 后端

### 1.1 保存/更新交易所 API 凭据（前端**不直传**到 JP）
**POST** `/api/v1/api-keys`

**Headers**：`Authorization`、`X-Request-Id?`

**Body**
```json
{
  "exchange": "okx",
  "label": "primary",
  "apiKey": "...",
  "secret": "...",
  "passphrase": "...",
  "uid": "2019..."
}
```
> 仅 US 持久化（加密），JP 不与前端直接交互。

**200**
```json
{"success": true, "data": {"id": "ak_01Hx...", "exchange": "okx", "label": "primary", "lastVerifiedAt": null}}
```

---

### 1.2 订单验证（US 代理到 JP）
**POST** `/api/v1/verify`

**Headers**：`Authorization`、`X-Request-Id?`、`Idempotency-Key?`

**Body**（**不含任何密钥**）
```json
{
  "exchange": "okx",
  "ordId": "2940071038556348417",
  "instId": "BTC-USDT-SWAP",
  "live": true,
  "fresh": true,
  "noCache": true,
  "credentialLabel": "primary"
}
```

**200**
```json
{
  "success": true,
  "data": {
    "meta": {
      "exchange": "okx",
      "ordId": "2940071038556348417",
      "instId": "BTC-USDT-SWAP",
      "verifiedAt": "2025-11-04T09:00:00Z"
    },
    "normalized": {
      "status": "filled",
      "side": "buy",
      "size": "0.64000000",
      "price": "34980.12000000",
      "timestamp": "2025-10-30T12:34:56Z",
      "liquidated": false,
      "liquidationPrice": null,
      "marginRatio": "0.0450",
      "leverage": 50
    },
    "raw": { "okxOrder": { "...": "原始响应" } },
    "evidence": {
      "evidenceUid": "ev_01Hy...",
      "hash": "0xabc...",
      "jpUrl": "https://jp.example/evidence/ev_01Hy..."
    },
    "perf": { "okxLatencyMs": 180, "totalMs": 260 }
  }
}
```

**错误示例** `401_UNAUTHORIZED`
```json
{"success": false, "error": {"code": "401_UNAUTHORIZED", "message": "invalid token"}}
```

> US 行为：根据 `credentialLabel` 取出加密凭据 → 带密钥调用 JP `/api/verify` → 写入 `verification_jobs`、`evidence_bundles`，并**不回显任何密钥**。

---

### 1.3 订单列表（标准化只读）
**GET** `/api/v1/orders`

**Query**：`page=1&limit=20&status=verified|pending`（可选）

**200**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "eo_01Hx...",
        "exchange": "okx",
        "orderId": "2940071038556348417",
        "instrumentId": "BTC-USDT-SWAP",
        "status": "verified",
        "createdAt": "2025-10-30T13:00:00Z",
        "liquidated": false
      }
    ],
    "pagination": {"page": 1, "limit": 20, "total": 1, "pages": 1}
  }
}
```

---

## 2. US 后端 ↔ JP Verify（仅服务间）

### 2.1 验证接口
**POST** `http://<JP_HOST>:8082/api/verify`

**Headers**：
- `Content-Type: application/json`
- `X-Service-Key: <service_key>`（或基于 IP 白名单）
- `X-Request-Id?`（US 透传）

**Body**（**仅此处包含密钥**）
```json
{
  "exchange": "okx",
  "ordId": "2940071038556348417",
  "instId": "BTC-USDT-SWAP",
  "live": true,
  "fresh": true,
  "noCache": true,
  "apiKey": "...",
  "secret": "...",
  "passphrase": "...",
  "uid": "2019..."
}
```

**200**（JP 统一返回结构）
```json
{
  "meta": {"exchange": "okx", "ordId": "...", "instId": "...", "verifiedAt": "2025-11-04T09:00:00Z"},
  "normalized": {"status": "filled|canceled|liquidated", "side": "buy|sell", "size": "...", "price": "...", "timestamp": "...", "liquidated": false, "liquidationPrice": null, "marginRatio": "0.0450", "leverage": 50},
  "raw": {"okxOrder": {"...": "原始返回"}},
  "evidence": {"evidenceUid": "ev_01Hy...", "hash": "0x..", "merkle": {"root": "0x..", "index": 123}},
  "perf": {"okxLatencyMs": 180, "totalMs": 260}
}
```

**错误**：`401 Service Key 错误`、`429 限频`、`502 OKX 上游错误`、`504 超时`（见 §7）。

### 2.2 证据只读
**GET** `http://<JP_HOST>:8082/api/evidence/{evidenceUid}`

**200** 返回**不含任何密钥**的证据 JSON；可选签名/哈希。

---

## 3. 数据映射（与 DB Schema 对齐）
- `POST /api/v1/verify` 成功：
  - 写 `verification_jobs(job_uid, exchange, order_id, instrument_id, status, finished_at)`
  - 写/更 `exchange_orders(exchange, order_id, instrument_id, status, liquidated, normalized_json, raw_json, verified_at)`；`UNIQUE(exchange, order_id)`
  - 写 `evidence_bundles(evidence_uid, job_uid, evidence_hash, storage_url, bytes_size)`
- 列表 `/api/v1/orders` 从 `exchange_orders` 读取；分页按 `created_at DESC`。

---

## 4. JSON Schema（片段）

### 4.1 FE→US：Verify Request
```json
{
  "$id": "https://liqpass.io/schemas/fe.us.verify.request.v1.json",
  "type": "object",
  "required": ["exchange", "ordId", "instId", "live", "credentialLabel"],
  "properties": {
    "exchange": {"enum": ["okx", "binance"]},
    "ordId": {"type": "string"},
    "instId": {"type": "string", "pattern": "^[A-Z0-9-]+$"},
    "live": {"type": "boolean"},
    "fresh": {"type": "boolean"},
    "noCache": {"type": "boolean"},
    "credentialLabel": {"type": "string", "minLength": 1}
  }
}
```

### 4.2 US→FE：Verify Response
```json
{
  "$id": "https://liqpass.io/schemas/us.fe.verify.response.v1.json",
  "type": "object",
  "required": ["success"],
  "properties": {
    "success": {"type": "boolean"},
    "data": {"type": "object"},
    "error": {"type": "object"}
  }
}
```

### 4.3 US→JP：Verify Request
```json
{
  "$id": "https://liqpass.io/schemas/us.jp.verify.request.v1.json",
  "type": "object",
  "required": ["exchange", "ordId", "instId", "live", "apiKey", "secret"],
  "properties": {
    "exchange": {"enum": ["okx", "binance"]},
    "ordId": {"type": "string"},
    "instId": {"type": "string"},
    "live": {"type": "boolean"},
    "fresh": {"type": "boolean"},
    "noCache": {"type": "boolean"},
    "apiKey": {"type": "string"},
    "secret": {"type": "string"},
    "passphrase": {"type": "string"},
    "uid": {"type": "string"}
  }
}
```

---

## 5. 枚举与命名收敛
- 交易所：`okx|binance`
- 方向：`buy|sell`
- 订单状态（normalized.status）：`filled|partially_filled|canceled|rejected|open|liquidated`

**字段统一**：
- `orderId/instrumentId` → **`ordId/instId`**
- 布尔值使用 JSON `true/false`，不使用字符串
- 数值型金额/价格以字符串传输：`"34980.12000000"`

---

## 6. 性能与 SLO
- FE→US：P95 < 5s
- US→JP：P95 < 10s，超时返回 `504_UPSTREAM_TIMEOUT`
- DB 查询：P95 < 1s

---

## 7. 错误码与 HTTP 状态

| code                  | http | 说明                          |
|-----------------------|------|-------------------------------|
| 400_VALIDATION        | 400  | 参数校验失败                  |
| 401_UNAUTHORIZED      | 401  | 认证失败/令牌无效             |
| 403_FORBIDDEN         | 403  | 权限不足/来源不允许           |
| 404_NOT_FOUND         | 404  | 资源不存在                    |
| 409_CONFLICT          | 409  | 幂等冲突/重复请求             |
| 422_SEMANTIC          | 422  | 业务校验不通过                |
| 429_RATE_LIMIT        | 429  | 触发限流                      |
| 500_INTERNAL          | 500  | 服务内部错误                  |
| 502_UPSTREAM          | 502  | 上游（交易所/JP）错误         |
| 504_UPSTREAM_TIMEOUT  | 504  | 上游超时                      |

示例：JP 向 OKX 返回 401 → US 统一转译为 `502_UPSTREAM` 并在 `details.upstream` 写明。

---

## 8. 安全与合规
- 前端**禁止**直传密钥到 JP；仅向 US 提交并由 US 加密存储与取用。
- JP `/api/*` 仅允许 US IP 或 `X-Service-Key`；`/healthz` 可独立白名单。
- 日志脱敏：屏蔽 `apiKey/secret/passphrase/uid`；仅记录哈希指纹。
- 审计：FE→US、US→JP 请求均落 `audit_logs`，绑定 `user_id` 与 `X-Request-Id`。

---

## 9. 示例端到端（OKX 实单）
1) FE 调用 US `/api/v1/verify`（credentialLabel="primary"）
2) US 取密钥→调用 JP `/api/verify`→收敛响应
3) US 写 `verification_jobs`/`exchange_orders`/`evidence_bundles` 并回 FE

---

## 10. 兼容你 v1.0 文档的关键修正
- **布尔与数值类型修正**：`"boolean"` → `true/false`；价格/金额改**字符串**。
- **接口路径统一**：推荐 `/api/v1/verify`（Body 带 `exchange`），不再拆 `/verify/okx`。
- **数据库契约修正**：`orders` 中**不要存 `api_key`**；证据从订单中剥离到 `evidence_bundles`；新增 `verification_jobs`。
- **错误码完善**：加入 `409/422/429/502/504` 与限流/重试头。

---

> 本契约与《LiqPass 数据库 Schema v1.1》一一对应，可直接作为前后端/JP 的 OpenAPI/JSON Schema 来源。后续若引入 Binance，仅需在 JP 的 `normalized` 适配层补充映射即可。

