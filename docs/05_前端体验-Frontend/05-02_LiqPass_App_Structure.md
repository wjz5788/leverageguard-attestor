# LiqPass Next.js App 结构与校验清单

本页整理「爆仓保 / LiqPass」前端（Next.js `app` 目录）与日本节点被动验证服务的统一约束，确保上线版本的交互、校验与后端风控一致。

---

## 1. Next.js 路由与职责

```
app/
├─ layout.tsx            # 全局布局：导航、语言切换、暗色模式
├─ page.tsx              # 首页：产品介绍 + 最新存证/统计卡片
├─ trade/page.tsx        # 交易验证 & 下单：输入订单、生成 proof
├─ appeal/page.tsx       # 申诉：上传/查看索赔证据、状态追踪
├─ onchain/page.tsx      # 链上存证：Merkle Root、Attest 记录展示
└─ help/page.mdx         # 帮助中心：FAQ、支持范围、提交流程
```

### 页面要点

- **layout.tsx**：注入 `ExchangeSelect`, `PairSelect`, `OrderIdInput` 等共享表单组件；集中引入 Toast、Modal、国际化。
- **page.tsx（首页）**：展示四块卡片 —— 最新批次 `batchId`、最近一次 `merkleRoot`、待处理申诉数、支持的交易对说明（直指下拉标准名）。
- **trade/page.tsx**：
  1. Stepper：`选择交易所 → 选择交易对 → 填订单号 → 上传证据`
  2. 解析证据原文后显示「系统识别到的交易所/交易对」，与用户所选不一致时阻止提交。
  3. 提交时调用 `/api/verify`；参数始终为 `{ exchange, instId, orderId, evidenceBlob }`，无其他自由输入。
- **appeal/page.tsx**：列出历史索赔，强调“仅支持 BTC-USDT / BTC-USDC 永续”；辅助上传新的证据包。
- **onchain/page.tsx**：展示根链（`root → parentRoot`）、`Attested`/`Revoked` 事件、`attest_receipt.json` 下载。
- **help/page.mdx**：文案需注明下拉支持的四个交易对、证据格式、拒绝场景（现货/交割合约/币本位等）。

组件命名建议存放于 `app/(components)/forms/`，以便复用和 Storybook 演示。

---

## 2. 固定下拉（Exchange & Pair）

| 交易所   | 交易对（展示名 = 标准名） |
| -------- | ------------------------ |
| OKX      | BTC-USDT-SWAP            |
| OKX      | BTC-USDC-SWAP            |
| Binance  | BTCUSDT                  |
| Binance  | BTCUSDC                  |

实现建议：

```tsx
const EXCHANGE_OPTIONS = ["OKX", "Binance"] as const;
const PAIR_WHITELIST: Record<typeof EXCHANGE_OPTIONS[number], string[]> = {
  OKX: ["BTC-USDT-SWAP", "BTC-USDC-SWAP"],
  Binance: ["BTCUSDT", "BTCUSDC"],
};
```

- 先选择交易所，再渲染对应 pair 下拉；无默认值，必须人工选择。
- 表单内禁止手动输入交易对或自动猜测；所有验证依赖下拉标准值。

---

## 3. `/api/verify` 请求与白名单

### 请求体（统一格式）

```jsonc
POST /api/verify
{
  "exchange": "OKX",
  "instId": "BTC-USDT-SWAP",
  "orderId": "1234567890123456789",
  "evidence": "<base64 or multipart blob>"
}
```

### 服务端（日本节点）校验流程

1. **白名单检查**：`exchange` ∈ {OKX, Binance}，`instId` 必须命中对应映射；否则 `400` + `"Unsupported trading pair"`.
2. **证据解析**：
   - OKX：验证 `instType === "SWAP"`，`instId` 精确等于标准名；
   - Binance：确认 `contractType === "PERPETUAL"`，`symbol` 等于标准名；
   - 解析出的 `instId_parsed` 与提交的 `instId` 不相等时直接拒绝。
3. **Order ID 哈希**：`order_id_hash = sha256(orderId + instId)`, 使用 UTF-8 拼接，无分隔符；保留在审计日志与 proof 中。
4. **Proof 生成**：`proof.json.inputs.instId` 填写标准名之一，严禁写别名（如 `BTC-USDT`、`btcusdt`）。
5. **日志**：记录 `exchange`, `instId_selected`, `instId_parsed`, `order_id_hash`, `status`, `reject_reason`。

后端配置文件需增加：

```yaml
verification:
  allowed_pairs:
    OKX:
      - BTC-USDT-SWAP
      - BTC-USDC-SWAP
    Binance:
      - BTCUSDT
      - BTCUSDC
```

---

## 4. 前端交互校验细则

1. **选择交易所** → 动态加载 pair 下拉（禁用状态直到用户选交易所）。
2. **输入订单号**：仅允许数字字符串；前端可提示“OKX/Binance 永续订单号”。
3. **上传证据**：
   - 解析 JSON/Text 后展示 `detectedExchange` / `detectedInstId`。
   - 若 `detectedInstId !== form.instId`，在 UI 上标红并阻止提交。
   - 解析失败返回统一文案：“证据内容无法识别交易对，请使用支持的四个永续合约。”
4. **提交按钮**：需同时满足 `exchangeSelected && instIdSelected && orderId && evidenceOk`。
5. **错误反馈**：统一使用 Toast/Alert，突出“仅支持 BTC-USDT / BTC-USDC 永续”。

---

## 5. 证据落盘与审计

- `proof.json`: `inputs.instId` 固定标准名；`order_id_hash` 字段使用上述公式；保留 `evidenceParsed.instId` 供比对。
- 日志追加字段：
  ```json
  {
    "exchange": "Binance",
    "instId_selected": "BTCUSDC",
    "instId_parsed": "BTCUSDC",
    "match": true,
    "order_id_hash": "…",
    "mode": "passive-jp",
    "timestamp": "..."
  }
  ```
- 拒绝案例 (`match: false`) 需包含 `reason`，便于后续申诉/复查。
- 服务器风控开关：拦截现货、交割合约（delivery/futures）、币本位/反向合约、非 USDT/USDC 保证金。

---

## 6. 帮助页与文案要求

### `help/page.mdx` 需明确：

- **支持范围**：仅 BTC-USDT-SWAP / BTC-USDC-SWAP / BTCUSDT / BTCUSDC 永续合约。
- **拒绝情形**：现货、定期交割合约、币本位、名称带杠杠（`BTC-USDT`、`BTCUSD_PERP` 等）。
- **提交格式**：订单号 + 下拉交易对 + 原文证据；文件必须包含交易所/交易对字段。
- **申诉流程**：若被拒，需更换证据或确认订单属于上述永续合约。

建议在表单旁展示帮助链接与「受支持交易对」提示，减少错投。

---

## 7. 开发验收清单

- [ ] 下拉组件仅渲染四个标准交易对，无法输入自定义值。
- [ ] 解析模块能从证据原文正确抽取交易所/交易对，并校验 `instType`/`contractType`。
- [ ] `/api/verify` 返回对不在白名单内的请求统一 400。
- [ ] `proof.json.inputs.instId` 与 `order_id_hash` 均基于标准名。
- [ ] 日志/Audit 记录包含选取值与解析值对比。
- [ ] Help/FAQ 文案已更新并强调“永续 Only”。

履行以上条目，即可满足“固定交易对 + 可复算哈希 + 被动验证一致性”的上线要求。
