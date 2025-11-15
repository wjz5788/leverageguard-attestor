## 总览

* 前端已有页面：`ApiSettings.tsx`（录入密钥、触发验证）、`OrderVerifier.tsx`（订单验证）、`Payment.tsx`（支付与验证UI）、`ClaimsPage.tsx`（理赔流程）。

* 后端已有路由：

  * API密钥：`POST/GET/DELETE /api/api-keys` 与 `POST /api/api-keys/verify`（apps/us-backend/src/routes/apiKeys.ts）

  * OKX订单验证代理：`POST /api/v1/verify/okx`（apps/us-backend/src/routes/okx-verify.ts:183）转发到 `jp-verify`

  * 理赔流程：`POST /api/v1/claims/prepare`、`POST /api/v1/claims/verify`（apps/us-backend/src/routes/claims.ts:320, 369）

* 现状：API密钥服务与数据库迁移存在字段不一致，验证结果未落库；前端部分使用模拟数据，支付页未强制购买前验证。

## 目标

* 用户在首次购买前，必须完成“交易所订单验证”（输入订单号+交易对），后端成功拉取订单信息并返回回显；通过后才能下单。

* 密钥后端加密入库，使用时解密；验证与理赔调用同一验证模块（jp-verify），生成可审计证据并落库。

## 后端实现

* API密钥保管

  * 统一使用 `better-sqlite3` 的 `dbManager`（apps/us-backend/src/database/db.ts）

  * 修正 `ApiKeyService` 与 `api_keys` 表结构不一致问题：采取直接去新建数据库，数据表的方式。，保存加密后的 `{apiKey,secretKey,passphrase,uid}` JSON；保留 `012_api_key_secret_fragment.sql` 的 `key_id/secret_fragment_hash/secret_prefix` 字段用于审计与脱敏展示。

  * 加密：沿用 `AES-256-GCM`（apps/us-backend/src/utils/crypto.ts），从 `KMS_KEY` 派生密钥；严禁日志中打印明文。

* 订单验证模块

  * 继续使用薄代理 `POST /api/v1/verify/okx`（apps/us-backend/src/routes/okx-verify.ts），将前端入参或服务端保存的别名密钥转发至 `jp-verify`（`JP_VERIFY_BASE_URL`）；证据用 `EvidenceStorage` 文件落地（apps/us-backend/src/utils/evidenceStorage.ts）。

  * 增强：在代理成功后，将规范化回显、检查结果、证据、性能等，写入 `verify_results` 表（apps/us-backend/src/database/migrations/005\_verify\_results.sql），以 `exchange+ord_id` 唯一。

  * 若前端选择 keyAlias 模式，则从 `api_keys` 解密出密钥后转发；默认保留 `inline` 模式。

* 购买前强制校验

  * 扩展下单逻辑：创建订单前检查用户最近一次验证是否“通过且匹配交易对”，或在下单请求中携带已验证的 `ordId/instId` 并进行快速二次校验；不满足则返回 `PRE_PURCHASE_VERIFICATION_REQUIRED`。

  * 位置：`apps/us-backend/src/routes/orders.ts` 的 `POST /orders`（或最小创建流的入口）调用校验服务。

* 理赔验证

  * 在 `ClaimsService.verifyClaim`（apps/us-backend/src/services/claimsService.ts:251）内接入 `jp-verify`：用保存的密钥或别名，按订单号与交易对查询是否强平；根据 `normalized.position.liquidated` 与原因生成 `eligible/payout/evidence`；结果与证据落库或附加到已有理赔记录。

## 前端改造

* ApiSettings

  * 改为真实调用后端：`GET /api/api-keys` 拉取脱敏密钥；`POST /api/api-keys` 保存；`DELETE /api/api-keys/:exchange` 删除；`POST /api/api-keys/verify` 做账户连通性验证。

  * 回显展示采用后端返回的 `masked` 与最近验证时间；移除临时模拟数据与不匹配的删除路径。

* OrderVerifier

  * 保留 `POST /api/v1/verify/okx`；提交 `ordId/instId` 与密钥（或 alias）；展示订单回显（订单号后4位、数量、均价、时间）与一致性检查；增加“写入验证历史”提示。

* Payment

  * 在“支付操作”前置一个“订单验证”步骤：只有当 `POST /api/v1/verify/okx` 返回 `checks.verdict === 'pass'`（或 `status=verified`）时，启用支付按钮；否则按钮禁用并提示“需先完成验证”。

  * 若用户携带已保存密钥，可从后端以 alias 模式发起验证以减少重复输入。

* ClaimsPage

  * 调用现有 `POST /api/v1/claims/prepare`、`POST /api/v1/claims/verify`；其内部改为真实 `jp-verify` 校验并返回证据与强平结论；前端继续按现有UI展示并支持下载证据。

## 配置与安全

* 必填环境变量：`KMS_KEY`（加密密钥）、`JP_VERIFY_BASE_URL`（默认 `http://127.0.0.1:8082`）、`ADMIN_API_KEY`、`DB_FILE`。

* 日志与审计：不记录明文密钥；仅记录 `key_id`、掩码与证据根哈希；证据落地时用 `EvidenceStorage.sanitizeEvidence` 去敏。

## 验收标准

* 保存/拉取API密钥全流程可用，数据加密且脱敏展示。

* `POST /api/v1/verify/okx` 返回订单回显与检查，通过时写入 `verify_results`。

* `Payment` 页未通过验证时不可下单，通过后可支付并成功创建订单。

* 理赔流程可根据强平结论返回 `eligible=true` 与证据；支持下载证据。

## 关联代码

* API密钥路由：apps/us-backend/src/routes/apiKeys.ts:25

* 交易所验证代理：apps/us-backend/src/routes/okx-verify.ts:183

* 加密工具：apps/us-backend/src/utils/crypto.ts:7

* 验证结果表：apps/us-backend/src/database/migrations/005\_verify\_results.sql:6

* 前端页面：apps/us-frontend/src/pages/ApiSettings.tsx、OrderVerifier.tsx、Payment.tsx、ClaimsPage.tsx

请确认以上方案。我将按此计划分阶段落地实现，并保持变更以Git提交记录更新文档。
