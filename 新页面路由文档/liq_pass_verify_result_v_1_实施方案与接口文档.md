# LiqPass · VerifyResult v1 实施方案与接口文档

> 目标：统一“API 验证 → 订单回显 → 一致性检查 → 清算检测”，前端以卡片+状态机展示；默认不上链，仅理赔时可选批量锚定。本文给出：方案、路由接口、统一字段、SQL 表、代码骨架、AI 开发步骤与测试用例。

---

## 0. 快速结论与默认参数

- 统一返回：**VerifyResult v1**（跨交易所一致）。
- 通过判定：`checks.verdict == "pass"` 且用户完成 `confirm-echo`。
- 阈值：时间偏差 `|timeSkewMs| ≤ 60_000`；算术容差 `≤ 1e-6`。
- 上链策略：`ATTEST_ONCHAIN=false`（默认），仅理赔时批量事件上链。
- 数值规范：十进制字符串，≤ 8 位小数；时间 ISO-8601 UTC；`pair` 规范：`BASE-QUOTE[-PERP|SWAP]`。

---

## 1. 统一数据模型 —— VerifyResult v1

```jsonc
{
  "status": "verified|failed|partial|error",
  "caps": {"orders":true, "fills":true, "positions":true, "liquidations":true},
  "account": {"exchangeUid":"...", "subAccount":"...", "accountType":"futures|spot|swap", "sampleInstruments":["BTC-USDT-PERP"]},
  "order": {
    "orderId":"ABCD1234",
    "pair":"BTC-USDT-PERP",
    "side":"BUY|SELL",
    "type":"MARKET|LIMIT|...",
    "status":"FILLED|PARTIALLY_FILLED|CANCELED|...",
    "executedQty":"581.4",
    "avgPrice":"0.79628507",
    "quoteAmount":"462.96013970",
    "orderTimeIso":"2025-10-27T10:30:00Z",
    "exchangeTimeIso":"2025-10-27T10:30:00Z"
  },
  "checks": {
    "authOk":true, "capsOk":true, "orderFound":true,
    "echoLast4Ok":true, "arithmeticOk":true, "pairOk":true,
    "timeSkewMs":10, "verdict":"pass|fail"
  },
  "proof": {
    "echo": {"firstOrderIdLast4":"1234", "firstFillQty":"581.4", "firstFillTime":"2025-10-27T10:30:00Z"},
    "hash": "keccak256(0x...)"
  },
  "liquidation": {"status":"none|forced_liquidation|adl", "eventTimeIso":"...", "instrument":"..."},
  "evidence": {"merkleRoot":"0x...", "files":["fills.json","order.json"]},
  "verifiedAt":"2025-10-27T00:10:00Z",
  "sessionId":"sess_xxx"
}
```

**UI 显示映射（最终卡片）**

- 证明片段：`proof.echo.*` 与 `proof.hash`
- 订单回显：`order.*`
- 一致性检查：`checks.*`
- 清算状态：`liquidation.*`
- 审计可复制：`verifiedAt`、`sessionId`

---

## 2. 路由与接口

### 2.1 us-backend（对外）

Base URL：`https://api.example.com`

- `GET /exchange-apis` 列表
- `POST /exchange-apis` 创建
- `GET /exchange-apis/supported` 支持与字段
- `GET /exchange-apis/:id` 详情（含掩码与最近验证）
- `PATCH /exchange-apis/:id` 更新（敏感字段更新 → 置 `unverified`）
- `DELETE /exchange-apis/:id` 软删除 + 清空密钥
- `POST /exchange-apis/:id/verify` 触发验证（入参：`{ orderRef, pair }`）
- `POST /exchange-apis/:id/confirm-echo` 用户确认回显
- `POST /exchange-apis/:id/disable` 禁用
- `GET /exchange-apis/:id/logs` 验证日志分页

**触发验证请求体**

```jsonc
{
  "orderRef": "ABCD1234",
  "pair": "BTC-USDT-PERP"
}
```

**失败码（reasons[]）** `INVALID_CREDENTIALS | MISSING_ORDER_REF | MISSING_PAIR | MISSING_SCOPE:* | IP_NOT_WHITELISTED | TIMESTAMP_OUT_OF_RANGE`

### 2.2 jp-verify（内网/受控跨域）

Base URL：`https://verify.internal`

- `POST /verify/:exchange/account`
  ```jsonc
  {
    "apiKey":"...",
    "apiSecret":"...",
    "passphrase":"...",           // OKX 必填
    "environment":"live|testnet",
    "orderRef":"ABCD1234",
    "pair":"BTC-USDT-PERP"
  }
  ```
  返回：`VerifyResult v1`
- `GET /healthz`

---

## 3. OpenAPI 3.1（节选）

```yaml
openapi: 3.1.0
info: { title: LiqPass Verify API, version: 1.0.0 }
servers: [{ url: https://api.example.com }]
paths:
  /exchange-apis/{id}/verify:
    post:
      summary: Trigger verification
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [orderRef, pair]
              properties:
                orderRef: { type: string }
                pair: { type: string }
      responses:
        '200':
          description: VerifyResult v1
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VerifyResult'
components:
  schemas:
    VerifyResult:
      type: object
      required: [status, caps, account, verifiedAt]
      properties:
        status: { type: string, enum: [verified, failed, partial, error] }
        caps: { type: object }
        account: { type: object }
        order: { type: object }
        checks: { type: object }
        proof: { type: object }
        liquidation: { type: object }
        evidence: { type: object }
        verifiedAt: { type: string, format: date-time }
        sessionId: { type: string }
```

---

## 4. 数据库与表（Postgres/SQLite）

### 4.1 表结构（DDL）

```sql
-- 1) 账户表
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  label TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'live',
  status TEXT NOT NULL,
  last_verified_at TIMESTAMP NULL,
  exchange_uid TEXT NULL,
  sub_account TEXT NULL,
  account_type TEXT NULL,
  caps_json JSON NOT NULL DEFAULT '{}',
  masked_api_key_last4 TEXT NULL,
  secret_ref TEXT NULL REFERENCES api_secrets(id) ON DELETE SET NULL,
  user_confirmed_echo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_ea_user ON exchange_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ea_status ON exchange_accounts(status);

-- 2) 密钥表（加密区）
CREATE TABLE IF NOT EXISTS api_secrets (
  id TEXT PRIMARY KEY,
  enc_api_key BLOB NOT NULL,
  enc_api_secret BLOB NOT NULL,
  enc_passphrase BLOB NULL,
  enc_extra_json BLOB NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3) 验证记录（不可变快照）
CREATE TABLE IF NOT EXISTS exchange_account_verifications (
  id TEXT PRIMARY KEY,
  exchange_account_id TEXT NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  caps_json JSON NOT NULL,
  order_json JSON NULL,
  checks_json JSON NULL,
  liquidation_json JSON NULL,
  proof_echo_json JSON NULL,
  proof_hash TEXT NULL,
  reasons_json JSON NULL,
  session_id TEXT NOT NULL,
  latency_ms INT NULL,
  verifier_version TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eav_eacc ON exchange_account_verifications(exchange_account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_eav_session ON exchange_account_verifications(session_id);

-- 4) 运行日志
CREATE TABLE IF NOT EXISTS exchange_account_logs (
  id TEXT PRIMARY KEY,
  exchange_account_id TEXT NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_sample_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

> 注：Postgres 将 `BLOB` 换为 `BYTEA`，`JSON` 换为 `JSONB` 亦可。

### 4.2 列约束与策略

- 软删除：设置 `deleted_at`，同时断开 `secret_ref` 并删除 secrets。
- 审计：每次 `/verify` 写入一条快照（`exchange_account_verifications`）。

---

## 5. 业务状态机与错误码

- 状态：`draft → unverified → verifying → verified(pendingConfirm) → verified(confirmed)`；失败：`failed`；禁用：`disabled`；删除：`deleted`。
- 错误码：
  - `INVALID_CREDENTIALS`
  - `MISSING_ORDER_REF`, `MISSING_PAIR`
  - `MISSING_SCOPE: orders|positions|...`
  - `IP_NOT_WHITELISTED`
  - `TIMESTAMP_OUT_OF_RANGE`

---

## 6. 代码骨架（TypeScript/Express）

### 6.1 类型与工具

```ts
// types.ts
export type Caps = { orders:boolean; fills:boolean; positions:boolean; liquidations:boolean };
export type VerifyChecks = {
  authOk:boolean; capsOk:boolean; orderFound:boolean;
  echoLast4Ok:boolean; arithmeticOk:boolean; pairOk:boolean;
  timeSkewMs:number; verdict:'pass'|'fail';
};
export type VerifyResult = {
  status:'verified'|'failed'|'partial'|'error';
  caps: Caps;
  account: { exchangeUid?:string; subAccount?:string; accountType?:string; sampleInstruments?:string[] };
  order?: { orderId:string; pair:string; side?:string; type?:string; status?:string; executedQty?:string; avgPrice?:string; quoteAmount?:string; orderTimeIso?:string; exchangeTimeIso?:string };
  checks?: VerifyChecks;
  proof?: { echo?:{ firstOrderIdLast4?:string; firstFillQty?:string; firstFillTime?:string }; hash?:string };
  liquidation?: { status:'none'|'forced_liquidation'|'adl'; eventTimeIso?:string; instrument?:string; positionSizeBefore?:string; positionSizeAfter?:string; pnlAbs?:string };
  evidence?: { merkleRoot?:string; files?:string[] };
  verifiedAt?: string; sessionId?: string;
};

export const PRECISION = 1e-6;
export const MAX_SKEW_MS = 60_000;
export function arithmeticOk(qty:string, px:string, quote:string) {
  const q = parseFloat(qty||'0'), p = parseFloat(px||'0'), a = parseFloat(quote||'0');
  return Math.abs(q*p - a) <= PRECISION;
}
```

### 6.2 us-backend：验证入口

```ts
// routes/exchange-apis.ts
import express from 'express';
import { callVerify } from '../services/jpClient';
import { saveVerificationSnapshot, getAccountById, updateAccountAfterVerify } from '../repo';
import { MAX_SKEW_MS } from '../types';

export const router = express.Router();

router.post('/exchange-apis/:id/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderRef, pair } = req.body || {};
    if (!orderRef || !pair) return res.status(400).json({ status:'failed', reasons:['MISSING_ORDER_REF','MISSING_PAIR'] });

    const acc = await getAccountById(id, req.user.id);
    if (!acc) return res.status(404).end();

    // 解密密钥（KMS），省略实现
    const secrets = await loadSecrets(acc.secret_ref);

    const ver = await callVerify(acc.exchange, {
      ...secrets,
      environment: acc.environment,
      orderRef, pair,
    });

    // 复核判定
    if (ver.checks) {
      const pass = ver.checks.verdict === 'pass' && Math.abs(ver.checks.timeSkewMs) <= MAX_SKEW_MS;
      ver.status = pass ? 'verified' : 'failed';
    }

    await saveVerificationSnapshot(id, ver, req.user.id);
    await updateAccountAfterVerify(id, ver);

    res.json(ver);
  } catch (e) { next(e); }
});

router.post('/exchange-apis/:id/confirm-echo', async (req, res, next) => {
  try {
    await setUserConfirmedEcho(req.params.id, req.user.id, true);
    res.status(204).end();
  } catch (e) { next(e); }
});
```

### 6.3 jp-verify：适配与统一

```ts
// adapters/okx.ts
import { VerifyResult } from '../types';

export function mapOkx(rawOrder:any, rawFills:any[]): VerifyResult['order'] {
  return {
    orderId: String(rawOrder.ordId),
    pair: rawOrder.instId,
    side: rawOrder.side?.toUpperCase(),
    type: rawOrder.ordType?.toUpperCase(),
    status: mapState(rawOrder.state),
    executedQty: toStr(sum(rawFills.map(f=>f.fillSz))),
    avgPrice: toStr(avg(rawFills.map(f=>f.fillPx))),
    quoteAmount: toStr(sum(rawFills.map(f=>Number(f.fillPx)*Number(f.fillSz)))),
    orderTimeIso: new Date(Number(rawOrder.cTime||rawOrder.uTime)).toISOString(),
    exchangeTimeIso: new Date(Number(rawOrder.uTime||rawOrder.cTime)).toISOString(),
  };
}
function mapState(s:string){
  const m:Record<string,string>={'canceled':'CANCELED','partially_filled':'PARTIALLY_FILLED','filled':'FILLED'}; return m[s]||s?.toUpperCase();
}
function sum(a:number[]){return a.reduce((x,y)=>x+y,0);} function avg(a:number[]){return a.length?sum(a)/a.length:0;} function toStr(n:any){return String(Number(n).toFixed(8));}
```

```ts
// verify/verifyAccount.ts
import { arithmeticOk, VerifyResult } from '../types';

export async function verifyAccount(params:any): Promise<VerifyResult> {
  // 1) 鉴权 + 拉取订单/成交（因交易所而异）
  const raw = await vendorFetch(params);
  const order = mapVendorToUnified(raw);

  // 2) 生成 checks
  const checks = {
    authOk: !!raw.authOk,
    capsOk: true,
    orderFound: !!order?.orderId,
    echoLast4Ok: String(params.orderRef).slice(-4) === String(order?.orderId||'').slice(-4),
    arithmeticOk: arithmeticOk(order.executedQty!, order.avgPrice!, order.quoteAmount!),
    pairOk: params.pair?.toUpperCase() === order.pair?.toUpperCase(),
    timeSkewMs: Math.abs(Date.now() - Date.parse(order.orderTimeIso||new Date().toISOString())),
    verdict: 'pass' as const,
  };
  if (!checks.authOk || !checks.orderFound || !checks.echoLast4Ok || !checks.arithmeticOk || !checks.pairOk) checks.verdict = 'fail';

  // 3) 生成 proof 与汇总
  const ver: VerifyResult = {
    status: checks.verdict === 'pass' ? 'verified' : 'failed',
    caps: { orders:true, fills:true, positions:true, liquidations:true },
    account: { exchangeUid: raw.uid, subAccount: raw.sub },
    order,
    checks,
    proof: { echo: { firstOrderIdLast4: String(order.orderId).slice(-4), firstFillQty: order.executedQty, firstFillTime: order.orderTimeIso }, hash: raw.echoHash },
    liquidation: raw.liq || { status:'none' },
    verifiedAt: new Date().toISOString(),
    sessionId: `sess_${Date.now()}`,
  };
  return ver;
}
```

---

## 7. cURL 示例

```bash
# 触发验证
curl -X POST https://api.example.com/exchange-apis/eacc_123/verify \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"orderRef":"ABCD1234","pair":"BTC-USDT-PERP"}'

# 用户确认回显
curl -X POST https://api.example.com/exchange-apis/eacc_123/confirm-echo \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"userConfirmedEcho":true}'
```

---

## 8. AI 开发步骤（可直接交给 AI Coding Agent）

1. **建库与迁移**：执行本文 DDL，创建四张表；接入 KMS。
2. **定义类型**：落地 `types.ts` 与 `VerifyResult`、`VerifyChecks`。
3. **适配器**：按 OKX → Binance → Hyperliquid 顺序实现 `mapVendor→Unified`。
4. **校验器**：实现 `arithmeticOk`、时间偏差检查，生成 `checks.verdict`。
5. **路由**：按第 2 节实现 `/verify`、`/confirm-echo`、列表与详情。
6. **日志与审计**：入库 `exchange_account_verifications` 与 `exchange_account_logs`。
7. **前端联调**：使用现有 React 画布页面；填 `orderRef` 与 `pair` 验证；点击“确认无误”。
8. **测试**：按第 9 节用例写 Jest/Vitest。
9. **灰度与限流**：对单用户与单交易所加速/退避；失败码回传。
10. **（可选）锚定**：开启 `ATTEST_ONCHAIN=true` 后接入批量事件上链。

**示例提示词（给 AI）**

> 实现 Node.js(Express)+TypeScript 的 `/exchange-apis/:id/verify` 与 `/confirm-echo`， 使用本文 VerifyResult v1。写仓储层与内存存根，保证 Jest 测试通过：
>
> 1. 没有 orderRef/pair 返回 `failed`+`reasons`；2) 成功路径 `verdict=pass`；
> 2. echo 后 4 位不匹配 `verdict=fail`。

---

## 9. 测试用例（最小集）

- 市价全成：`FILLED`，`verdict=pass`，乘法闭合；
- 限价部分成交：`PARTIALLY_FILLED`，`verdict=pass`；
- 撤单：`CANCELED`，`verdict=fail`；
- 后四位不匹配：`echoLast4Ok=false`，`verdict=fail`；
- 币对不匹配：`pairOk=false`，`verdict=fail`；
- 时间偏差边界：`timeSkewMs=60000` 通过，`60001` 失败；
- 强平：`liquidation.status in {forced_liquidation, adl}` 返回事件时间。

---

## 10. 环境变量与配置

```ini
# us-backend
PORT=8080
DB_URL=postgres://...
KMS_KEY_ID=...
VERIFY_SERVICE_BASE=https://verify.internal
ATTEST_ONCHAIN=false
MAX_SKEW_MS=60000
ARITH_EPS=0.000001

# jp-verify
OKX_KEY=...
OKX_SECRET=...
OKX_PASSPHRASE=...
BINANCE_KEY=...
BINANCE_SECRET=...
```

---

## 11. 安全与合规

- 密钥只以加密态入库；验证时短暂解密于内存；软删立即清空关联。
- 审计保真：记录 `verifier_version`、`adapter_version`；原始样本仅在日志表保存哈希/摘要。
- 只回传最小必要字段；敏感原始回执不下发前端。

---

## 12. 任务清单（执行顺序）

1. 建库迁移 → 2) types 与适配器 → 3) `/verify` 联调 → 4) `/confirm-echo` → 5) 日志/分页 → 6) 测试覆盖 → 7) 灰度限流 → 8) （可选）批量锚定模块。

> 文档与画布页面保持一致，直接据此开发与评审。

