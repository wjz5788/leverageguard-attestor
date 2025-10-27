明白。这页不是“后端 Base URL”，而是“用户的交易所 API 可用性校验”。下面给你**零代码、可执行**架构文档，直接对你的仓库（leverageguard-attestor）与双机架构（US 前端/后端 + JP 验证微服务）对齐。你项目承诺“**只读，不写、不托管**”，以下设计严格遵守并复用“仅绑定一家 CEX、只读风控”的约定。([GitHub][1])

# 「API 设置 · 交易所只读校验」架构规范

## 0. 定义

* 本页目标：让用户录入 **Binance/OKX** 的只读 API 凭据，进行**格式校验 + 连通校验 + 权限校验**，产出“**可用会话句柄**”供后续“订单取证/理赔验证”使用。
* 只读边界：**不存私钥到服务端**，不申请交易或提币权限。仅用于读取订单、持仓、余额、账户标识等。([GitHub][1])

---

## 1. 路由与页面

* 路由：`/settings/exchange-api`
* 页面名：**SettingsExchangeApiPage**
* 访问：已连接钱包的用户均可访问（无需管理员）

---

## 2. 支持的交易所与字段

### Binance（Global）

* 必填：`apiKey`，`apiSecret`
* 可选：`uid`（若你绑定 UID 作为账户唯一性，建议要求用户填）
* 可选：`ipWhitelist Tip`（仅提示用户自行在交易所后台限制 IP）

### OKX

* 必填：`apiKey`，`apiSecret`，`passphrase`
* 可选：`uid` / `accountId`（如你用此作账户指纹匹配）

> 解释：Binance 需要 Key+Secret；OKX 额外要 Passphrase。UID/AccountId 用来做“**账户指纹**”，便于后续订单匹配和风控审计。

---

## 3. 交互流程（三步，逐条可测）

### A. 本地格式校验

* 校验点：

  * Key/Secret/Passphrase 非空；长度与字符集基础校验（不做过度推断）
  * 禁止含空格和换行
* 失败反馈：`KEY_FORMAT_INVALID` / `SECRET_FORMAT_INVALID` / `PASSPHRASE_FORMAT_INVALID`

### B. 连通 + 权限校验（服务端代测）

* 入口按钮：**“连接测试”**
* 行为：前端将凭据**只发送到 JP-verify** 微服务，经由 **US-backend 反向代理**（避免浏览器直连跨域，也能集中限流）。
* JP-verify 校验顺序：

  1. **时间偏移**：拉取交易所服务器时间，判定 `serverTimeDiffMs`，>5s 给出警告 `CLOCK_SKEW`。
  2. **签名有效**：调用最小私有只读端点：

     * Binance：`/api/v3/account`（或等价只读）
     * OKX：`/api/v5/account/balance`
  3. **权限集合**（scopes）：能否读余额、订单、成交、持仓。
  4. **速率与风控**：解析返回的限频头或权重，生成 `rateLimitHint`。
* 典型失败码：

  * `INVALID_SIGNATURE`（签名/密钥错误）
  * `INSUFFICIENT_SCOPE`（开了只读 Key 但未勾选“读取现货/合约”权限）
  * `IP_NOT_ALLOWED`（交易所后台做了 IP 白名单）
  * `ACCOUNT_LOCKED` / `KEY_EXPIRED`（密钥被禁用或过期）
  * `NETWORK_ERROR`（网络/CORS/代理失败）

### C. 生成“会话句柄”（不落盘密钥）

* 通过即在 **JP-verify 内存**登记一条**临时会话**，返回 `verifyKey`（例如 `vk_****`），**默认有效期 30 分钟**。
* 后续所有“订单验证/证据拉取”接口**只带 verifyKey**，不再重复传密钥。
* 用户可点击“**立即废弃会话**”→ JP-verify 立刻清除。

> 解释：句柄模式满足“**只读、最小暴露、可撤销**”。US-backend 仅做透传，不存密钥，不写日志。

---

## 4. 前端页面元素

* 交易所选择：`Binance | OKX`
* 字段区：根据所选交易所动态展示必填项
* 操作区：

  * **连接测试**（触发 B 步）
  * **保存于本机**（可选，将 *加密后* 的凭据仅存 localStorage，默认关闭）
  * **清空**（清当前表单）
  * **废弃会话**（如已获取 verifyKey）
* 提示区：

  * “**只读，不写、不提币**。本服务**不保存私钥**。建议在交易所后台开启 **IP 白名单** 并仅勾选读取权限。”
  * “通过后会生成临时 **verifyKey**，用于后续取证/理赔。”

---

## 5. 前后端契约（**给 AI 落地的最小接口**）

> 说明：用“**US-backend → JP-verify**”模式；US-backend 不落盘、不打日志；JP-verify 仅内存持有会话。

### 5.1 支持查询

* `GET /verify/exchanges`

  * 返回支持的交易所及所需字段、占位提示、校验规则摘要。

### 5.2 连接测试 + 生成会话

* `POST /verify/exchange/test`（经 US-backend 代理到 JP-verify）

  * 请求体字段：

    * `exchange`: `binance | okx`
    * `apiKey`, `apiSecret`, `passphrase?`, `uid?`
  * 成功返回：

    * `ok: true`
    * `verifyKey`（临时句柄）
    * `scopes`：`{ balance:boolean, orders:boolean, fills:boolean, positions?:boolean }`
    * `accountFingerprint`：如 `binance:uid:12345` / `okx:uid:xyz`
    * `serverTimeDiffMs`，`rateLimitHint`
  * 失败返回：`ok:false, code:<上文失败码>, reasons:[…]`

### 5.3 废弃会话

* `POST /verify/exchange/dispose`

  * 入参：`verifyKey`
  * 出参：`{ ok:true }`

> 注：**不提供“读取密钥”的接口**。一切后续读写只收 `verifyKey`。

---

## 6. 安全与合规

* **不落盘**：US-backend 与 JP-verify 均不将密钥写入磁盘/DB。
* **不打敏感日志**：过滤头与体，**敏感字段写 `***`**。
* **最小权限**：页面文案强提示“只勾选读取权限，不勾交易/提现”。
* **IP 白名单**：提示用户可选开启并回显可能的 `IP_NOT_ALLOWED`。
* **会话超时**：默认 30 分钟；理赔验证期间可自动续期，其他时刻不续。

---

## 7. 错误码与文案（前端直接展示）

| code                      | 解释              | 建议给用户看的文案            |
| ------------------------- | --------------- | -------------------- |
| KEY_FORMAT_INVALID        | Key 格式不对        | “API Key 格式无效”       |
| SECRET_FORMAT_INVALID     | Secret 格式不对     | “Secret 格式无效”        |
| PASSPHRASE_FORMAT_INVALID | Passphrase 格式不对 | “Passphrase 格式无效”    |
| INVALID_SIGNATURE         | 签名失败            | “密钥或签名错误”            |
| INSUFFICIENT_SCOPE        | 权限不足            | “未勾选读取权限（余额/订单/持仓）”  |
| IP_NOT_ALLOWED            | IP 未在白名单        | “请在交易所后台加入白名单或关闭限制”  |
| ACCOUNT_LOCKED            | 账户/密钥被锁         | “账户或 API Key 已冻结/禁用” |
| KEY_EXPIRED               | 密钥过期            | “API Key 已过期”        |
| CLOCK_SKEW                | 时钟偏移过大          | “本机或交易所时间不同步（>5s）”   |
| NETWORK_ERROR             | 网络/代理问题         | “网络或代理错误，稍后重试”       |

---

## 8. 数据最小化与留痕

* **前端**：默认不持久化。若用户勾选“保存于本机”，则使用**口令加密**后写 localStorage，并提示“仅此浏览器可见”。
* **US-backend**：只转发到 JP-verify；请求日志中对 `apiKey/secret/passphrase` 做掩码。
* **JP-verify**：仅在内存保存 `{ verifyKey → exchangeClient }` 映射；进程重启即失效。
* **审计**：仅记录 `verifyKey`、`exchange`、`accountFingerprint`、`scopes`、`createdAt/expiredAt`，**不含密钥**。

---

## 9. 与“订单验证/理赔”的衔接

* 后续“输入订单号 → 拉证据 → 判定赔付”接口**统一要求**：`verifyKey + orderRef`。
* 这样用户完成一轮“API 只读校验”后，无需再次输入密钥，即可在 30 分钟有效期内进行取证与理赔流程。

---

## 10. 页面元素 ID（给自动化/测试）

* 选择交易所：`#sel-exchange`
* Binance：`#in-binance-apikey`，`#in-binance-secret`，`#in-binance-uid`
* OKX：`#in-okx-apikey`，`#in-okx-secret`，`#in-okx-passphrase`，`#in-okx-uid`
* 按钮：`#btn-test-connection`，`#btn-save-local`，`#btn-clear`，`#btn-dispose-session`
* 结果区：`#out-test-result`（显示 ok/失败码、scopes、version、timeDiff）

---

## 11. BDD 场景（按此人工点测）

1. **成功路径**：填入 OKX 正确只读密钥 → 点连接测试 → 返回 `ok=true`、`verifyKey`、`scopes.balance=true` → 显示“连接正常”，生成句柄。
2. **权限不足**：Binance 只开了现货读取，没开合约读取 → 返回 `INSUFFICIENT_SCOPE`。
3. **IP 限制**：用户后台开了 IP 白名单 → 返回 `IP_NOT_ALLOWED` 并引导设置白名单。
4. **密钥错**：返回 `INVALID_SIGNATURE`。
5. **时间偏移**：返回 `CLOCK_SKEW` 警告但 `ok=true`（允许通过，提示风险）。
6. **废弃会话**：点“废弃会话”→ `ok=true`，后续用该 `verifyKey` 的接口全部 401（句柄失效）。
7. **本机存储**：勾选“保存于本机”，刷新页面后字段自动回填；点击“清空本机”后不再回填。

---

## 12. 给 AI 的落地任务单（无代码指令）

* 建页面 `/settings/exchange-api`，按第 4 节元素与 ID 命名。
* 实现本地**格式校验**与禁用态，错误码用第 7 节。
* 在 US-backend 暴露 `POST /verify/exchange/test`、`POST /verify/exchange/dispose`，**只做透传**到 JP-verify。
* 在 JP-verify 实现连通+权限校验、会话内存表与过期清理，并按第 5 节返回结构与错误码。
* 前端拿到 `verifyKey` 后，保存到内存状态；若用户勾选“保存于本机”，再加密写 localStorage。
* 与“订单验证/理赔”页对齐：这些页调用后端时只带 `verifyKey`。
* 按第 11 节 BDD 出一份点测记录（通过/失败）。

---

## 13. 关联仓库定位

* 本规范用于你的仓库 **leverageguard-attestor**，与“只读、不写、被动理赔”的产品承诺一致；页面属于“前端体验/验证端”，后端属于“JP 验证微服务”通道。([GitHub][1])

需要我把以上转成 PR 的任务清单或 Notion 模板，说明。

[1]: https://github.com/wjz5788/leverageguard-attestor "GitHub - wjz5788/leverageguard-attestor"
