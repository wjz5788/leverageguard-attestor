# LiqPass 最小上线清单（单页版）

> 目标：**一个页面 + 两个接口 + 两张表 + 一个 JP 验证 IP**，跑通上线最小闭环。把本文直接存为仓库 `reports/LiqPass-上线最小清单.md` 或复制到根 `README` 的“快速开始”区。

---

## 0. 运行平面图

**前端（US）** ⟶ **US 后端**（`/api/*`） ⟶ **JP 验证**（`http://<JP-IP>:8082/api/verify`） ⟶ **交易所（OKX/后续 Binance）**

健康检查：
- US：`GET /healthz` → `{ "status":"ok" }`
- JP：`GET /healthz` → `{ "status":"ok" }`

---

## 1) 环境变量模板

### US 后端（.env.us）
```
PORT=8080
DB_PATH=./liqpass.db
SECRET_KEY=__32_byte_random_hex_or_base64__
JP_BASE_URL=http://<JP-IP>:8082
ALLOW_ORIGIN=https://your-frontend.example   # 开发可填 *
LOG_LEVEL=info
RATE_LIMIT_PER_MIN=60
```

### JP 验证（.env.jp）
```
PORT=8082
ALLOW_SOURCE_IP=<US-Server-Public-IP>   # 仅放行 US 入站
UVICORN_WORKERS=1
UVICORN_TIMEOUT=20
LOG_LEVEL=info
```

> **安全最小要求**：US 端用 `SECRET_KEY` 对 `secret/passphrase` 做 AES-GCM 加密存储；日志永不打印密钥；JP 永不回显密钥。

---

## 2) API 契约（对前端与 US 后端）

### 2.1 保存/管理交易所账户
**POST `/api/accounts`**（创建或更新）
```json
{
  "exchange": "okx",           
  "apiKey": "xxxx",
  "secret": "xxxx",
  "passphrase": "xxxx",        
  "nickname": "OKX-主账户"
}
```
**响应**
```json
{
  "id": "acc_123",
  "exchange": "okx",
  "apiKeyMasked": "xxxx••••",
  "nickname": "OKX-主账户",
  "status": "active",
  "updatedAt": "2025-11-04T12:34:56Z"
}
```

**GET `/api/accounts`**（列表，掩码显示） → `[{ id, exchange, apiKeyMasked, nickname, status, lastVerifiedAt }]`

**DELETE `/api/accounts/:id`** → `204 No Content`

> 规则：密钥仅在 US 后端持久化（加密）；前端不可读明文；删除后不可恢复。

---

### 2.2 订单验证（OKX）
**POST `/api/verify/okx`**
```json
{
  "accountId": "acc_123",
  "orderId": "612345678901234",
  "instrumentId": "BTC-USDT-SWAP",
  "fresh": true
}
```
**响应**（成功）
```json
{
  "success": true,
  "data": {
    "normalized": {
      "orderId": "612345678901234",
      "instrumentId": "BTC-USDT-SWAP",
      "side": "sell",
      "size": 10,
      "price": 65000.5,
      "pnl": -123.45,
      "status": "liquidation",          
      "exchangeTs": "2025-11-03T12:00:00Z"
    },
    "evidence": {
      "merkleRoot": "0xabcde...",
      "url": "https://jp-verify.local/evidence/612345678901234.json"
    },
    "perf": {
      "jpLatencyMs": 120,
      "exchangeLatencyMs": 320
    },
    "verifiedAt": "2025-11-04T12:35:00Z"
  }
}
```
**响应**（失败）
```json
{
  "success": false,
  "error": {
    "code": "exchange_error|jp_unreachable|timeout|bad_request",
    "message": "human readable"
  }
}
```

> US 将 `accountId` 解密出密钥 → 代理请求到 JP → JP 直连交易所或缓存 → 生成 `normalized + evidence` → US 落库后回前端。

---

## 3) US → JP 代理契约

**JP 入参（/api/verify）**
```json
{
  "exchange": "okx",
  "apiKey": "xxxx",
  "secret": "xxxx",
  "passphrase": "xxxx",
  "orderId": "612345678901234",
  "instrumentId": "BTC-USDT-SWAP",
  "fresh": true
}
```
**JP 出参**（供 US 直接转存）
```json
{
  "normalized": { /* 同上 */ },
  "evidence": { "merkleRoot": "0x...", "url": "https://.../evidence/...json" },
  "perf": { "jpLatencyMs": 120, "exchangeLatencyMs": 320 }
}
```
> 要求：JP 绝不回显密钥；`/healthz` 可用；UFW 仅放行 US 源 IP 访问 `:8082`。

---

## 4) 数据库（SQLite 最小模型）

```sql
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  exchange TEXT NOT NULL CHECK(exchange IN ('okx','binance')),
  api_key TEXT NOT NULL,
  secret_enc BLOB NOT NULL,
  passphrase_enc BLOB,
  nickname TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_exchange_accounts_updated
AFTER UPDATE ON exchange_accounts
FOR EACH ROW BEGIN
  UPDATE exchange_accounts SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  order_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  side TEXT,
  size REAL,
  price REAL,
  pnl REAL,
  is_liquidation INTEGER NOT NULL DEFAULT 0,
  jp_latency_ms INTEGER,
  exchange_latency_ms INTEGER,
  merkle_root TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('success','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(account_id) REFERENCES exchange_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_verifications_order ON verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_verifications_created ON verifications(created_at);
```

---

## 5) cURL 自测（复制即用）

> 将 `JP_IP` 与 `US_IP` 替换为你的地址；第一步先测 JP，再测 US。

```bash
# 5.1 JP 健康
curl -sS http://JP_IP:8082/healthz | jq .

# 5.2 US 健康
curl -sS http://US_IP:8080/healthz | jq .

# 5.3 创建账户（US）
curl -sS -X POST http://US_IP:8080/api/accounts \
  -H 'Content-Type: application/json' \
  -d '{
    "exchange":"okx",
    "apiKey":"YOUR_OKX_KEY",
    "secret":"YOUR_OKX_SECRET",
    "passphrase":"YOUR_OKX_PASSPHRASE",
    "nickname":"OKX-主账户"
  }' | jq .

# 5.4 发起验证（US）
# 将 acc_123 替换成上一步返回的 id，将订单号与交易对换成真实值
curl -sS -X POST http://US_IP:8080/api/verify/okx \
  -H 'Content-Type: application/json' \
  -d '{
    "accountId":"acc_123",
    "orderId":"612345678901234",
    "instrumentId":"BTC-USDT-SWAP",
    "fresh":true
  }' | jq .
```

---

## 6) 错误码约定

| code              | 含义                             | 排查顺序 |
|-------------------|----------------------------------|---------|
| `bad_request`     | 参数缺失/格式错                  | 前端表单/请求体 |
| `unauthorized`    | 账户不存在/已禁用                | 账户状态 |
| `rate_limited`    | 触发 US 速率限制                 | 降频/白名单 |
| `jp_unreachable`  | US 打 JP 失败                    | JP `/healthz`、UFW、端口|
| `exchange_error`  | 交易所返回业务错误               | 订单号/权限 |
| `timeout`         | JP/交易所超时                    | 提高超时/重试 |
| `internal_error`  | 未分类异常                        | US/JP 日志 |

---

## 7) 安全基线（必须做到）

- **密钥仅在 US 端加密存储**（AES-GCM, `SECRET_KEY` 来自环境）；从不落盘明文。
- **JP 不回显密钥**；不记录含密钥的头与体；仅保留 `normalized/evidence/perf`。
- **UFW**：JP `:8082` 只允许 US 出口 IP；其余拒绝。
- **HTTPS**：US 对外域名启用 HTTPS；JP 保留裸 IP（仅 US 可达）。
- **日志脱敏**：所有 `apiKey` 打印为 `xxxx••••`；绝不出现 `secret/passphrase`。

---

## 8) 一页式前端字段定义

**上半区：账户**
- `exchange`（枚举：okx|binance）
- `apiKey`（输入，保存后掩码）
- `secret`（输入，保存后不回显）
- `passphrase`（OKX 可选）
- `nickname`（可选）
- 操作：保存 / 删除

**下半区：订单验证**
- `accountId`（下拉：已保存账户）
- `orderId`（字符串）
- `instrumentId`（例如 `BTC-USDT-SWAP`）
- `fresh`（布尔，默认 `true`）
- 结果：normalized（核心 8 项）、evidence（merkleRoot, url）、perf（延迟）、verifiedAt
- 历史表：最近 20 条（orderId / instrumentId / status / merkleRoot / created_at）

---

## 9) 三步上线

1. **D1**：配置 `.env.us` 与 `.env.jp`；建库迁移（上面的 SQL）；启动 US 与 JP；`/healthz` 均 OK。
2. **D2**：保存一个 OKX 账户；用真实订单跑一次验证；确认 `verifications` 入库。
3. **D3**：JP 防火墙仅放行 US；US 开启 HTTPS 与速率限制；打开“透明度小卡”（24h 成功率/平均延迟）。

---

## 10) 备注

- **链上阶段**：只上链 `merkleRoot`，证据 JSON 留在 JP（受控访问）。
- **Binance 接入**：在现有契约下仅更换 `exchange=binance` 与字段名映射；不改数据库结构。
- **扩展空间**：后续再加 `policies/claims` 表，与前端“购买/赔付”页。

---

# 附：即插即用文件

> 复制以下两段内容分别保存为：
> - `db/db_init.sql`
> - `scripts/liqpass-selfcheck.sh`（记得 `chmod +x scripts/liqpass-selfcheck.sh`）

## 文件 1：SQLite 初始化脚本（db/db_init.sql）
```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  exchange TEXT NOT NULL CHECK(exchange IN ('okx','binance')),
  api_key TEXT NOT NULL,
  secret_enc BLOB NOT NULL,
  passphrase_enc BLOB,
  nickname TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_exchange_accounts_updated
AFTER UPDATE ON exchange_accounts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE exchange_accounts SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  order_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  side TEXT,
  size REAL,
  price REAL,
  pnl REAL,
  is_liquidation INTEGER NOT NULL DEFAULT 0,
  jp_latency_ms INTEGER,
  exchange_latency_ms INTEGER,
  merkle_root TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('success','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(account_id) REFERENCES exchange_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_verifications_order ON verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_verifications_created ON verifications(created_at);
```

**用法：**
```bash
# 在 US 后端根目录执行（或设置 DB_PATH 指向该文件）
mkdir -p db && sqlite3 db/liqpass.db < db/db_init.sql
```

---

## 文件 2：一键自测脚本（scripts/liqpass-selfcheck.sh）
```bash
#!/usr/bin/env bash
set -euo pipefail

# === 配置（可用环境变量覆盖） ===
US_BASE="${US_BASE:-http://127.0.0.1:8080}"
JP_BASE="${JP_BASE:-http://127.0.0.1:8082}"
EXCHANGE="${EXCHANGE:-okx}"
NICKNAME="${ACC_NICK:-OKX-自测}" # 账户备注
FRESH="${FRESH:-true}"

# OKX 凭证（必填）
OKX_API_KEY="${OKX_API_KEY:-}"
OKX_SECRET="${OKX_SECRET:-}"
OKX_PASSPHRASE="${OKX_PASSPHRASE:-}"

# 真实订单信息（必填）
ORDER_ID="${ORDER_ID:-}"
INSTRUMENT_ID="${INSTRUMENT_ID:-}"

ACCOUNT_ID="${ACCOUNT_ID:-}" # 如已有账户，设置此变量可跳过创建

# === 依赖检查 ===
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少依赖：$1"; exit 127; }; }
need curl; need jq;

mask() { local s="$1"; [ ${#s} -le 6 ] && { echo "***"; return; }; echo "${s:0:4}****${s: -2}"; }

step() { echo -e "\n▶ $1"; }
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

step "JP 健康检查: $JP_BASE/healthz"
JP_STATUS=$(curl -sS "$JP_BASE/healthz" | jq -r .status || true)
[ "$JP_STATUS" = "ok" ] && pass "JP 正常" || fail "JP 不可达或返回异常（status=$JP_STATUS）"

step "US 健康检查: $US_BASE/healthz"
US_STATUS=$(curl -sS "$US_BASE/healthz" | jq -r .status || true)
[ "$US_STATUS" = "ok" ] && pass "US 正常" || fail "US 不可达或返回异常（status=$US_STATUS）"

# 检查必填变量
[ -z "$ORDER_ID" ] && fail "请 export ORDER_ID=真实订单号"
[ -z "$INSTRUMENT_ID" ] && fail "请 export INSTRUMENT_ID=如 BTC-USDT-SWAP"

if [ -z "$ACCOUNT_ID" ]; then
  [ -z "$OKX_API_KEY" ] && fail "请 export OKX_API_KEY=..."
  [ -z "$OKX_SECRET" ] && fail "请 export OKX_SECRET=..."
  [ -z "$OKX_PASSPHRASE" ] && fail "请 export OKX_PASSPHRASE=..."

  step "创建/更新账户: $US_BASE/api/accounts"
  ACC_RES=$(curl -sS -X POST "$US_BASE/api/accounts" \
    -H 'Content-Type: application/json' \
    -d "{\n  \"exchange\": \"$EXCHANGE\",\n  \"apiKey\": \"$OKX_API_KEY\",\n  \"secret\": \"$OKX_SECRET\",\n  \"passphrase\": \"$OKX_PASSPHRASE\",\n  \"nickname\": \"$NICKNAME\"\n}" )
  echo "$ACC_RES" | jq . >/dev/null || fail "账户接口返回非 JSON"
  ACCOUNT_ID=$(echo "$ACC_RES" | jq -r .id)
  [ "$ACCOUNT_ID" = "null" -o -z "$ACCOUNT_ID" ] && fail "未拿到账户 id：$(echo "$ACC_RES" | jq -c .)"
  pass "账户就绪 id=$ACCOUNT_ID apiKey=$(mask "$OKX_API_KEY")"
else
  step "复用已有账户: $ACCOUNT_ID"
fi

step "发起订单验证: $US_BASE/api/verify/okx"
REQ_BODY=$(jq -n --arg acc "$ACCOUNT_ID" --arg oid "$ORDER_ID" --arg inst "$INSTRUMENT_ID" --argjson fresh $FRESH '{accountId: $acc, orderId: $oid, instrumentId: $inst, fresh: $fresh}')
VER_RES=$(curl -sS -X POST "$US_BASE/api/verify/okx" -H 'Content-Type: application/json' -d "$REQ_BODY")

echo "$VER_RES" | jq . >/dev/null || fail "验证接口返回非 JSON"
SUCCESS=$(echo "$VER_RES" | jq -r .success)

if [ "$SUCCESS" = "true" ]; then
  MR=$(echo "$VER_RES" | jq -r .data.evidence.merkleRoot)
  OID=$(echo "$VER_RES" | jq -r .data.normalized.orderId)
  STAT=$(echo "$VER_RES" | jq -r .data.normalized.status)
  JP_MS=$(echo "$VER_RES" | jq -r .data.perf.jpLatencyMs)
  EX_MS=$(echo "$VER_RES" | jq -r .data.perf.exchangeLatencyMs)
  OUT="/tmp/liqpass-verify-$(date +%s).json"
  echo "$VER_RES" | jq . > "$OUT"
  pass "验证成功：orderId=$OID status=$STAT merkleRoot=${MR:-N/A} (jp=${JP_MS}ms exch=${EX_MS}ms)"
  echo "完整响应已保存：$OUT"
  exit 0
else
  CODE=$(echo "$VER_RES" | jq -r .error.code)
  MSG=$(echo "$VER_RES" | jq -r .error.message)
  fail "验证失败 code=$CODE msg=$MSG"
fi
```

**用法：**
```bash
# 1) 填好环境
export US_BASE=http://US_IP:8080
export JP_BASE=http://JP_IP:8082
export OKX_API_KEY=你的OKXKey
export OKX_SECRET=你的OKXSecret
export OKX_PASSPHRASE=你的Passphrase
export ORDER_ID=真实订单号
export INSTRUMENT_ID=BTC-USDT-SWAP

# 如已存在账户，直接指定 ACCOUNT_ID 以跳过创建
# export ACCOUNT_ID=acc_xxx

# 2) 运行
bash scripts/liqpass-selfcheck.sh
```

