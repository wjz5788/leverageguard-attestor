# LiqPass 极简收钱/发钱闭环（画布草稿）

> 核心只关心：**怎么安全收钱、怎么可追踪地发钱、怎么验证是否该赔付**，其他全部按优先级慢慢挂上去。

---

## 一、目标

> 当前版本的明确边界：**只有强平、没有回撤规则；只有 24h 产品；用户被动触发验证。**

1. 用户能在前端：
   - 用 MetaMask 连接钱包（Base 主网）。
   - 购买单一的「24h 强平保」产品（未来可以扩展其他参数档）。
   - 使用 Base USDC 支付保费，进入你的金库地址。
2. 后端/数据库能：
   - 记住这笔钱是谁、什么时候、付了多少，覆盖的是哪一笔「24h 强平保」。
3. 你作为管理员：
   - 能看到“谁付过钱”。
   - 有一套 **基于 CEX 强平记录的验证结果（不考虑回撤）**，可以辅助你判断是否赔付；
   - 手动在链上转账 USDC；
   - 在系统里把该订单标记为“已赔付”，便于后续审计。

> 验证模式是**被动的**：只有当用户在 24h 内被强平、并且回到页面输入订单号点击「验证」，系统才去 CEX 拉数据做判断。

---

## 二、极简架构

- 前端：沿用现有产品页，只改支付逻辑 + 补充“赔付申请 / 查看验证结果”页面。
- 合约：沿用 CheckoutUSDC（收 USDC 到金库 + PremiumPaid 事件）。
- 后端：新建/精简一个极简 REST 服务：
  - `POST /api/v1/orders` – 创建订单（未支付）。
  - `POST /api/v1/orders/:orderId/submit-tx` – 前端支付成功后上报 txHash，后端做最小校验后标记为已支付。
  - `GET /api/v1/orders/:orderId` – 查询订单详情（你后台用）。
  - `POST /api/v1/admin/orders/:orderId/mark-paid` – 你人工赔付后，填写 payoutTxHash 标记为已赔付。
- 验证服务（核心，不是空气）：
  - 一个独立的 `verify` 模块/服务，对接 OKX/Binance 只读 API，拉取指定用户、指定时间窗口内的强平记录（不做回撤计算）。
  - 24h 产品的窗口规则固定为：`window_start = paid_at`，`window_end = paid_at + 24h`。
  - 按照「窗口内是否存在符合条件的强平」生成一份「是否触发赔付」的判断 + 证据 JSON。
  - 后端通过 `/api/v1/orders/:orderId/request-verification` 或内部任务调用这个服务。

也可以实现成内部队列消费，不一定必须同步返回。

### 4. 查询订单及验证结果

- `GET /api/v1/orders/:orderId`
- 返回该订单完整信息 + 最新一次 `order_verifications` 记录（如果有），供你或前端显示。

### 5. 管理员标记赔付

- `POST /api/v1/admin/orders/:orderId/mark-paid`
- 请求体：
  - `payoutTxHash`
- 逻辑：
  - 通常只允许在 `status = PAID` 的订单上操作。
  -（业务上你可以要求必须有 `ELIGIBLE` 的验证记录）
  - 更新：
    - `payout_tx_hash = payoutTxHash`
    - `payout_status = PAID`
    - （可选）`updated_at = now()`

---

## 五、核心验证功能（不是空气）

这些是你产品差异化的心脏，只是实现顺序排在「收钱 → 记账」之后，但**必须做**：

- CEX API 对接（OKX/Binance 强平校验，当前版本只看强平，不算回撤）。
- 把 CEX 返回的数据存成 `order_verifications.raw_snapshot`，确保未来可审计、可复算。
- 基于这些数据给出一个明确的 `decision` 和 `reason_code`，让你点赔付时不是拍脑袋。
- （下一步）在此基础上再挂 Merkle 证据树、`/check` 端点、公开可验证 JSON。

---

## 六、短期可以晚点做的（真 DLC）

- 完整的 Merkle 证据树、/check 端点对外开放、第三方验证 SDK。
- 自动赔付策略（全自动打钱，而不是你人工点确认）。
- 多渠道 / 多产品动态定价。
- 复杂的 API Key 权限系统、多租户模式。

这些都可以放到「产品跑起来、有数据以后」再迭代。当前阶段只锁两件事：

> 1. 钱能稳定、安全地收进去（链上 + DB）。
> 2. 有一条基于 CEX 订单/强平记录的验证链路，帮你决定是否赔付。

---

## 七、强平之后的用户路径（从用户视角）

> 这是你刚说的核心：**“用户强平之后，输入订单号，验证强平结果”**。

从用户视角的完整一步步是：

1. **买保单**
   - 用户在你前端：连接钱包 → 选择产品（比如 24h 爆仓保）→ 支付 USDC。
   - 前端：
     - `POST /api/v1/orders` 创建订单，拿到 `orderId`；
     - 用 CheckoutUSDC 在 Base 上支付；
     - 成功后调用 `POST /api/v1/orders/:orderId/submit-tx`，把 `txHash` 写进系统。
   - 结果：
     - `orders` 表里有一条 `status = PAID` 的记录；
     - 你可以在前端页面上把 `orderId` 给用户看（或邮件/截图），方便他之后输入。

2. **用户在 CEX 上被强平**
   - 用户在 OKX / Binance 上高杠杆交易，被强平（只有这一类事件会触发赔付判定）。
   - 当前版本**不考虑“仅大回撤但未强平”的情况**，只关心是否发生强平事件。
   - 这一段发生在 CEX，你不需要干预，只要后面能查到强平记录即可。

3. **用户回到你的网站，在订单管理页发起验证**
   - 用户再次来到你的产品页：
     - 用同一个钱包登录（SIWE / 签名登录）。
     - 打开「订单管理」页面：这里会列出他买过的所有订单，每一行：
       - 产品：当前就是 24h 强平保；
       - `orderId`（可展示部分或全部）；
       - 倒计时：从 24:00 递减到 00:00（前端你已经实现了）；
       - 状态：`已支付 / 可验证 / 已过期 / 已赔付` 等；
       - 操作按钮：在倒计时 > 0 且 `status = PAID` 的订单上显示「验证强平/申请理赔」。
   - 当用户点击这一行的「验证强平/申请理赔」按钮时，前端无需让他手输订单号，直接用该行的 `orderId` 调用：
     - `POST /api/v1/orders/:orderId/request-verification`。

4. **后端根据订单号跑 CEX 校验**
   - 后端拿到 `orderId` 之后：
     - 从 `orders` 找到该单：确认 `status = PAID`，拿到 `cex_account`、`product_type`、`paid_at` 等信息；
     - 根据产品类型算出验证窗口：
       - 当前只有 24h 产品：`window_start = paid_at`，`window_end = paid_at + 24h`。
     - 调用 verify 服务：
       - 用 `cex_account` + `window_start/window_end` 调 OKX/Binance 只读 API；
       - 拿到这段时间内的强平记录；
       - 不做回撤计算，只判断是否存在符合条件的强平事件；
       - 按规则给出：
         - `decision`：`ELIGIBLE`（24h 窗口内存在有效强平记录） / `NOT_ELIGIBLE`（24h 窗口内没有强平） / `MANUAL_REVIEW`（数据缺失或异常，需要你人工判断）；
         - `reason_code`：`FORCE_LIQUIDATION_FOUND` / `NO_FORCE_LIQUIDATION` / `DATA_INCOMPLETE` 等；
         - `raw_snapshot`：原始返回或压缩后的 JSON。
     - 在 `order_verifications` 表插入一条记录，挂在这个 `orderId` 底下。

5. **把验证结果回给用户**
   - `request-verification` 的响应只需要给一个简化版：
     - `decision`：是否符合赔付条件；
     - `reason_code`：为什么；
     - （可选）一两条关键字段（比如：爆仓时间、爆仓价格、最大回撤）。
   - 前端在「验证结果」区域展示：
     - ✅ 验证通过，可以申请赔付；
     - ❌ 验证不通过（理由：24h 内没有强平事件 / 回撤不足 XX%）；
     - ❓ 需人工复核（你后台看详情）。

6. **你在后台看同一份验证结果，决定是否打钱**
   - 后台或内部工具里，你可以查到：
     - `orders`：这单的保费、时间、用户钱包；
     - `order_verifications`：最新一条验证结果 + `raw_snapshot`（完整 CEX 数据）。
   - 若你决定赔付：
     - 手动在链上从金库给用户转 USDC；
     - 然后调用 `POST /api/v1/admin/orders/:orderId/mark-paid`，填 `payoutTxHash`。

7. **闭环完成**
   - 从用户视角：
     - 买保单 → 被强平 → 回来输入订单号 → 系统告诉他「你有/没有资格赔付」 → 若有资格，等你打钱。
   - 从系统视角：
     - `orders` 表记录了钱的来；
     - `order_verifications` 表记录了强平/回撤验证；
     - `payout_tx_hash` 记录了钱的去；
     - 整条链路可以事后审计。

---

## 八、后续可以拆成给 AI / Codex 的任务卡

后续可以在这张画布基础上，拆出若干张任务卡：

1. **前端任务卡**：
   - 固定和验证 env 变量。
   - 改造 `payPolicy()` 实现上述支付逻辑。
   - 下单成功后，把新订单加进「订单管理」列表的数据源（或触发重新拉取）。
   - 「订单管理」页：
     - 已有：订单列表 + 从 24:00 → 00:00 的倒计时逻辑；
     - 需要：根据接口返回的 `status` 和 `expiresAt` 去校正倒计时和按钮状态；
     - 在可验证窗口内（倒计时 > 0 且 status = PAID），显示「验证强平/申请理赔」按钮，点击调用 `/orders/:orderId/request-verification`；
     - 展示 `decision` + `reason_code`（可以是行内标签或弹出详情）。

2. **后端任务卡（收钱 + 记账）**：
   - 新建 `orders` 表 migration。
   - 实现 `/orders` 和 `/orders/:id/submit-tx` 路由。
   - 实现 `/admin/orders/:id/mark-paid` 路由。

3. **验证服务任务卡（CEX 核心）**：
   - 新建 `order_verifications` 表 migration。
   - 写一个独立 `verify` 模块/服务，对接 OKX 或 Binance 的只读 API，基于样例数据先跑通一条校验规则（例如：24h 内是否有强平）。
   - 在后端挂上 `/orders/:id/request-verification`，把结果写入 `order_verifications`。

4. **运维任务卡**：
   - 在 US/JP 服务器部署极简后端 + 验证服务。
   - 配置 env（USDC 地址、金库地址、RPC、DB 文件路径、CEX API Key/只读凭据）。

接下来我们可以直接用这里的「强平之后用户路径」当蓝本，给 Codex 写一张非常具体的「实现 `/orders/:id/request-verification`」任务卡。

后续可以在这张画布基础上，拆出若干张任务卡：

1. **前端任务卡**：
   - 固定和验证 env 变量。
   - 改造 `payPolicy()` 实现上述支付逻辑。
   - 挂上后端 `createOrder / submit-tx` 调用。
   - 占个位：用户订单列表 + 简单的“申请赔付”按钮。

2. **后端任务卡（收钱 + 记账）**：
   - 新建 `orders` 表 migration。
   - 实现 `/orders` 和 `/orders/:id/submit-tx` 路由。
   - 实现 `/admin/orders/:id/mark-paid` 路由。

3. **验证服务任务卡（CEX 核心）**：
   - 新建 `order_verifications` 表 migration。
   - 写一个独立 `verify` 模块/服务，对接 OKX 或 Binance 的只读 API，基于样例数据先跑通一条校验规则（例如：24h 内是否有强平）。
   - 在后端挂上 `/orders/:id/request-verification`，把结果写入 `order_verifications`。

4. **运维任务卡**：
   - 在 US/JP 服务器部署极简后端 + 验证服务。
   - 配置 env（USDC 地址、金库地址、RPC、DB 文件路径、CEX API Key/只读凭据）。

接下来我们可以直接围绕「验证服务任务卡」继续细化：具体用 OKX 还是 Binance、要拉哪些接口、规则怎么写，都可以一步步拆出来。


---

## 九、v0 最终结果 & 卡点总结

### 1. v0 产品定义（不再改来改去的版本）

- 只卖 **一个产品**：24 小时强平保（`24h_force_liq`）。
- 只认 **一种事件**：在支付后的 24 小时窗口内，CEX 账户是否发生强平（不看回撤）。
- 验证模式是 **被动触发**：用户被强平后，回到「订单管理页」，在对应订单上点击「验证强平/申请理赔」。

> 一句话：24h 内是否有强平，有就“符合赔付条件”，没有就“不符合”，其余数据异常的归为“待人工复核”。

### 2. v0 必须打通的三条链路

1. **收钱链路（钱包 → 合约 → 订单）**
   - 用户用 MetaMask 在 Base 上用 USDC 调用 CheckoutUSDC 支付保费。
   - 后端在 `orders` 表记录：wallet、product_type=24h_force_liq、premium_usdc_6d、paid_at、expires_at=paid_at+24h、status=PAID、tx_hash。

2. **验证链路（订单 → CEX 强平 → 验证结果）**
   - 用户在 24h 期间被 CEX 强平。
   - 回到「订单管理页」，在该订单上点「验证强平/申请理赔」，前端调用 `/api/v1/orders/:orderId/request-verification`。
   - 后端：
     - 确认订单属于当前钱包、状态为 PAID、当前时间未超过 expires_at；
     - 用 `paid_at ~ paid_at+24h` + `cex_account` 调 OKX/Binance 只读 API；
     - 判断窗口内是否存在有效强平事件；
     - 在 `order_verifications` 写入：`decision`（ELIGIBLE/NOT_ELIGIBLE/MANUAL_REVIEW）、`reason_code`、`raw_snapshot`；
     - 把 `decision + reason_code + forceLiquidations[]` 返回给前端展示。

3. **发钱链路（你人工 → 链上转账 → 系统记账）**
   - 你在后台看到订单详情 + 最新验证结果，决定是否赔付。
   - 在链上手工从金库钱包向用户钱包转 USDC。
   - 调用 `/api/v1/admin/orders/:orderId/mark-paid`，写入 `payout_tx_hash`、`payout_status=PAID_OUT`。

> 这三条链路打通，你就完成了「收钱 → 记账 → 验证 → 赔付」的最小闭环，项目即可对真实用户开放。

### 3. 导致项目停滞的关键问题（针对 LiqPass 本身）

1. **规格不够窄，v0 目标一直在飘**
   - 一开始同时想做：强平 + 回撤、多产品、自动赔付、Merkle 证据、/check 对外验证等。
   - 导致任何一条链路都没有被推到“够用上线”的完成度。
   - 现在我们已经收敛到：**只做 24h 强平险 + 被动验证**，这就是 v0。

2. **太多“未来功能”抢了现在的资源**
   - SIWE/Email/多种登录方式、API Key 中间件、监听器、Merkle、回撤产品、复杂风控……
   - 这些长期是有价值的，但在 v0 阶段与「用户今天能不能付钱、你明天能不能看到强平并赔付」相比，都应该靠后。

3. **任务颗粒度过大，每一步都像在“重写系统”**
   - 频繁讨论“重写后端”、“新仓库 vs 老仓库”、“大范围架构重构”。
   - 真实需要的，其实只是：
     - 两张表：`orders`、`order_verifications`；
     - 四个接口：`/orders`、`/orders/:id/submit-tx`、`/orders/:id/request-verification`、`/admin/orders/:id/mark-paid`。
   - 没有把工作限制在这几个明确的小块上，导致每次开工都很重，很难收尾。

4. **工具/流程复杂度太高，增加了每次改动的摩擦**
   - main 分支保护、PR 规则、Codex 分支、CI、envCheck、一堆服务器环境。
   - 这些本身没错，但在 v0 阶段会明显拖慢业务闭环的速度，让“改一行业务逻辑”也变成高成本操作。

### 4. v0 阶段唯一要守住的技术 TODO（清单版）

> 假设前端已完成订单页 + 倒计时 + 按钮，v0 只需要后端完成这几件事：

1. **订单表 & 收钱记账**
   - 建立 `orders` 表（或补足字段）：
     - `id`, `wallet_address`, `cex_account`, `product_type=24h_force_liq`, `premium_usdc_6d`, `status`, `tx_hash`, `paid_at`, `expires_at`, `payout_tx_hash`, `payout_status`。
   - 实现：
     - `POST /api/v1/orders`（创建订单，返回 orderId）。
     - `POST /api/v1/orders/:orderId/submit-tx`（写入 tx_hash，标记 PAID，计算 expires_at=paid_at+24h）。

2. **订单列表（喂给已有的订单管理页）**
   - 实现 `GET /api/v1/orders/my`：根据当前钱包返回用户自己的订单列表，字段至少包括：`orderId`、`status`、`paidAt`、`expiresAt`、最近一次验证结果（可选）。

3. **验证表 & 强平验证接口**
   - 创建 `order_verifications` 表：
     - `order_id`, `cex`, `window_start`, `window_end`, `decision`, `reason_code`, `raw_snapshot`, `created_at`。
   - 实现 `POST /api/v1/orders/:orderId/request-verification`：
     - 校验订单归属/状态/是否过期；
     - 计算 24h 时间窗；
     - 调 OKX/Binance 只读 API 查强平；
     - 生成 `decision + reason_code + forceLiquidations[]`；
     - 写入 `order_verifications` 并把简化结果返回前端。

4. **管理员标记赔付**
   - 实现 `POST /api/v1/admin/orders/:orderId/mark-paid`：
     - 要求订单 status=PAID 且（可选）已存在 `ELIGIBLE` 的验证；
     - 写入 `payout_tx_hash`，更新 `payout_status=PAID_OUT`。

完成这四块，就达成 v0 的终局定义：

> 你有一个真实可用的 24 小时强平险：
> - 用户能用 Base USDC 付钱；
> - 订单能出现在管理页并倒计时；
> - 被强平后点击按钮，系统能从 CEX 拉到强平记录并给出清晰结论；
> - 你能据此在链上打钱，并在系统里留下“钱从哪里来、到哪里去”的可审计记录。

---

## 十、项目现状与文档差异及最小化落地方案（代码实况版）

> 这一节对应「当前仓库真实状态 vs v0 标准」，方便 AI / 开发者直接对照代码路径动手。

### 1. 现状概览（基于当前仓库）

- 前端支付已经走 **路线 A**：
  - `payPolicy` 走的是「直连钱包 → 切换 Base → USDC approve → 合约 buyPolicy」，
  - 优先使用 `VITE_CHECKOUT_QUOTE_HASH`（参考：`apps/us-frontend/src/lib/payPolicy.ts:69-112`）。
- 后端已存在的订单相关接口：
  - `POST /api/v1/orders`
  - `POST /api/v1/orders/preview`
  - `GET /api/v1/orders`
  - `GET /api/v1/orders/:orderId`
  - 参考：`apps/us-backend/src/routes/orders.ts:45-49, 111-161, 163-226`。
- 持久化方式：
  - 使用 JSON 文件账本，由 `DB_FILE` 推导出目录路径，
  - 实现在 `apps/us-backend/src/database/fileLedger.ts`。
- 目前**缺失的关键接口**：
  - `POST /api/v1/orders/:orderId/submit-tx`
  - `GET /api/v1/orders/my`
  - `POST /api/v1/orders/:orderId/request-verification`
  - `POST /api/v1/admin/orders/:orderId/mark-paid`

### 2. 与 v0 标准的差异清单

- 支付后未提交链上交易详情：
  - 当前没有在订单上写入 `tx_hash`、`paid_at`、`expires_at`，
  - 导致 24h 窗口无法在后端被准确计算和使用。
- 缺少「我的订单」视角：
  - 目前订单列表主要按 API Key 维度列出全部订单，
  - 缺少基于「当前登录钱包地址」的 `GET /api/v1/orders/my`，
  - 前端订单管理页无法直接用一个「我的订单」接口驱动。
- 缺少验证链路：
  - 尚未实现 `request-verification` 接口，
  - 没有 `order_verifications` 数据结构，
  - 无法记录 CEX 强平验证结果及原始快照。
- 缺少发钱链路：
  - 未实现管理员端 `mark-paid`，
  - 订单结构中缺少或未使用 `payout_tx_hash`、`payout_status` 字段，
  - 赔付完成后，无法在系统层面形成对账闭环。

### 3. 最小化开发建议（在现有实现基础上补齐 v0）

> 思路：不强行改用 SQLite，**先维持 JSON 账本**，只在现有 types + services 上补字段和路由。

#### 3.1 后端：按 v0 接口清单补齐

- 新增 `POST /api/v1/orders/:orderId/submit-tx`（`apps/us-backend/src/routes/orders.ts`）：
  - 请求体包含：`txHash`（和必要的安全校验信息）。
  - 行为：
    - 在对应订单上保存 `tx_hash`；
    - 更新 `status = PAID`；
    - 设置 `paid_at` 为当前时间；
    - 设置 `expires_at = paid_at + 24h`（以 UTC 为准）。

- 新增 `GET /api/v1/orders/my`（`apps/us-backend/src/routes/orders.ts`）：
  - 根据当前登录钱包地址（从会话或签名中获取）返回该地址的订单列表；
  - 字段至少包括：`orderId`、`status`、`paidAt`、`expiresAt`、最近一次验证结果（若有）。

- 新增 `POST /api/v1/orders/:orderId/request-verification`：
  - 在 `apps/us-backend/src/services/verifyService.ts` 新建一个服务模块，
  - 路由文件中调用该服务：
    - 可先接入 OKX 的只读 API，或者暂时返回 `decision = MANUAL_REVIEW` 占位；
    - 写入 `order_verifications`（结构与前文 v0 规范一致）。

- 新增 `POST /api/v1/admin/orders/:orderId/mark-paid`（`apps/us-backend/src/routes/orders.ts`）：
  - 请求体包含：`payout_tx_hash`；
  - 行为：
    - 更新订单的 `payout_tx_hash`；
    - 更新 `payout_status = PAID_OUT`；
    - 可选：限制只在 `status = PAID` 且验证结果为 `ELIGIBLE` 时允许调用。

- 数据结构补齐（不改存储方式，只补字段）：
  - 在订单类型定义中增加字段（`apps/us-backend/src/types/orders.ts`）：
    - `txHash`、`paidAt`、`expiresAt`、`payoutTxHash`、`payoutStatus`；
  - 在 JSON 账本实现中补齐读写逻辑（`apps/us-backend/src/database/fileLedger.ts`、`src/services/orderService.ts`）。

- 鉴权与环境：
  - 管理员端接口（尤其是 `mark-paid`）沿用现有 `X-API-Key` 方案，
  - 使用 `ADMIN_API_KEY` 作为后台操作凭证；
  - 前端或内部工具可通过 `localStorage.setItem('api_key', '<ADMIN_API_KEY>')` 临时注入调用权限（仅限你自己运维使用）。

#### 3.2 前端：把现有支付流和订单页接到新接口上

- 在 `apps/us-frontend/src/lib/payPolicy.ts`：
  - 保留现有「直连钱包 → Base → USDC approve → buyPolicy」流程；
  - 在链上交易成功后：
    1. 调用 `POST /api/v1/orders` 创建或幂等创建订单，获取 `orderId`；
    2. 调用 `POST /api/v1/orders/:orderId/submit-tx` 把 `txHash` 写入后端并设置 24h 窗口；
    3. 导航至订单管理页，让用户能立即看到这条新订单和倒计时。

- 在订单管理页（例如 `apps/us-frontend/src/pages/AccountOrders.tsx` 或等价文件）：
  - 将当前数据源改为调用 `GET /api/v1/orders/my`；
  - 在钱包账户切换时，重新拉取列表；
  - 为每条订单的「验证强平」按钮调用 `POST /api/v1/orders/:orderId/request-verification`，
  - 根据接口返回的 `decision + reasonCode` 刷新该行的展示状态。

- 钱包流程统一：
  - 复用 `payPolicy.ts` 中的 `connectAndEnsureBase` + USDC `allowance/approve` 逻辑；
  - 必要时抽成公共 helper 或挂到 `WalletContext`，
  - 确保用户在支付/订单页之间切换时不需要重复多次无意义点击。

#### 3.3 链上 quoteHash：一次性配置

- 使用合约 owner 在 Base 主网调用 `registerQuoteHash(bytes32,uint256)`，预注册 `VITE_CHECKOUT_QUOTE_HASH`，并设置合理的过期时间；
- 前端长期稳定使用该 `VITE_CHECKOUT_QUOTE_HASH`，避免每次部署/测试都要临时改 env。

---

## 十一、当前目标与阶段性落地计划（支付闭环优先）

### 当前目标

1. 支付闭环可用：前端连接钱包 → USDC approve → 合约 `buyPolicy` 成功上链。
2. 未登录也能报价：产品页匿名生成并展示价格。
3. 订单回写最小化：交易哈希入账，订单页可见支付结果。

### 关键差距

- 链上 `quoteHash` 未由合约 owner 注册或已过期，导致支付校验失败。
- 钱包连接/切链流程不稳，重复点击与用户拒绝后缺少重试与提示。
- 缺少后端 `submit-tx` 与 `orders/my`，支付后无法落账。
- 前后端环境变量可能不一致（合约地址/USDC/chainId）。

### 阶段一：打通链上支付

1. 注册静态报价哈希：
   - 用合约 owner 在 Base 主网调用 `registerQuoteHash(bytes32,uint256)`，
   - `expiryTime` 设为未来时间，与前端 `VITE_CHECKOUT_QUOTE_HASH` 保持一致。
2. 统一环境变量配置：
   - 前端 `.env`：
     - `VITE_CHECKOUT_QUOTE_HASH`
     - `VITE_CHECKOUT_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
     - `VITE_CHECKOUT_CONTRACT_ADDRESS=<合约地址>`
   - 后端 `.env.production`：
     - `USDC_ADDRESS`
     - `CHECKOUT_CONTRACT_ADDRESS`
     - `PAYMENT_CHAIN_ID=8453`
3. 校验金额精度：
   - 统一以 USDC 6 位整数（如 1 USDC → `1_000_000`）。
4. Gas 保障：
   - 用户地址与 owner 均有足够 Base ETH 支付 gas。

### 阶段二：钱包连接稳定性

1. 连接状态机：
   - `idle → connecting → connected`；
   - 按钮 `loading` 态防止并发点击。
2. 切链流程：
   - 优先调用 `wallet_switchEthereumChain`，
   - 若报错代码 `4902`，则自动调用 `wallet_addEthereumChain`（Base 主网参数完整）。
3. 错误与重试策略：
   - 识别 `userRejectedRequest` / Provider Busy / RPC 超时；
   - 提供一次快速重试按钮与明确错误提示；
   - 超时 30–60 秒时给出提示，避免用户无反馈等待。
4. 成功提示与日志：
   - 连接/切链/批准/支付各步骤分级提示；
   - 将关键错误打点到日志（便于排查问题）。

### 阶段三：匿名报价（未登录）

1. 后端：
   - 保留 `POST /api/v1/orders/preview` 作为匿名端点，返回价格与展示必要信息。
2. 前端：
   - 请求拦截器白名单中包含 `/api/v1/orders/preview`，
   - 产品页在未登录状态直接调用该端点并展示价格。
3. CORS：
   - 确保前端 Origin 被后端 CORS 白名单允许访问该端点。

### 阶段四：订单闭环与回写

1. 后端新增接口：
   - `POST /api/v1/orders/:orderId/submit-tx`：
     - 写入 `txHash`、`paidAt`、状态（如 `PAID` 或 `PENDING_CONFIRM`），
     - 继续使用 JSON 账本持久化。
   - `GET /api/v1/orders/my`：
     - 按用户钱包地址返回订单列表。
2. 前端逻辑：
   - 在 `buyPolicy` 获得交易对象后提取 `hash` 调用 `submit-tx`；
   - 成功后跳转订单页或弹出成功提示。
3. 数据字段统一：
   - 订单包含：`orderId`、`address`、`amountUSDC6d`、`txHash`、`status`、`paidAt`、`expiresAt`。

### 验证与验收口径

- 正常路径：
  - 连接并切到 Base；
  - `approve` 交易上链可查；
  - `buyPolicy` 返回 `txHash`；
  - `submit-tx` 调用成功；
  - 订单页显示为「已支付」，倒计时正确显示剩余时间。
- 匿名报价路径：
  - 未登录用户在产品页点击「生成价格」，能成功返回并展示报价。
- 失败演练：
  - 用户拒绝签名/交易；
  - 切链失败；
  - allowance 不足；
  - RPC 慢/超时；
  - UI 能给出清晰提示并允许合理重试。

### 风险与前置条件

- `quoteHash` 未注册或已过期 → 合约拒绝交易：
  - 必须先完成合约层 `registerQuoteHash` 注册。
- 合约地址/USDC 地址/`chainId` 任一不一致 → 支付失败：
  - 需要统一前后端 env 配置。
- RPC 限流或钱包扩展异常 → 连接不稳：
  - 需要在前端层提供重试机制与清晰错误提示。

### 时间线建议

- 当天：
  - 完成 `quoteHash` 注册；
  - 统一前后端环境变量；
  - 加固连接/切链流程；
  - 打通链上支付与匿名报价展示。
- 次日：
  - 完成后端 `submit-tx` 与 `orders/my`；
  - 完成前端回写与订单列表接入；
  - 达成「最小订单闭环」。

### 交付与记录

- 提交信息按模块拆分：
  - 前端连接与支付；
  - 后端订单端点；
  - 文档差异说明。
- 更新现有 `doc_01/对.md` 的「建议/最小化实现」段落以标注变更与对齐，
  - 不额外新建文档，减少文档分散。

