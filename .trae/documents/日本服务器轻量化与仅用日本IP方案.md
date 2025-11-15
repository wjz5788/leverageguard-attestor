## 结论
* 状态机与交互规则符合业界做法：HTTP 状态区分系统异常；业务字段（`verdict`/`eligible_for_purchase`/`is_liquidated`）驱动 UI；`error` 仅表示传输/服务异常。

## 改造要点
* 统一业务判定（US 端）：
  * `is_liquidated = normalized.data.liq_flag === 'true'`
  * `eligible_for_purchase = ordId/instId 匹配 && 有规范化数据 && 其他校验通过`
  * `verdict = eligible_for_purchase ? 'pass' : 'fail'`
  * 失败写入 `eligibility_reason`（`ORD_ID_MISMATCH`/`NOT_LIQUIDATED`/...）
* 响应给前端：在原有 `responseWithEvidence` 上补充 4 字段；HTTP 200 时保证存在，异常时仅 `error`。
* 入库：继续写 `verify_results`，并将新判定相关数据打包进 `checks_json`（不改表）。

## 实施步骤（P0）
1. 更新 `apps/us-backend/src/routes/okx-verify.ts` 的 `handleVerify`：按上面计算 4 个业务字段，`verdict` 不再依赖 `error`。
2. 入库改造：`checks_json` 写入 `is_liquidated/eligible_for_purchase/eligibility_reason`，`verdict`写新结果。
3. 前端管理页绑定：按状态机使用字段驱动交互，无需新增后端接口。

## 验证用例
* 未爆仓 → `success_fail` + `NOT_LIQUIDATED`
* 爆仓且校验通过 → `success_pass` 点亮“生成购买”
* JP 服务不可用 → `error` 保留旧结果，仅提示异常

确认后我将开始实施并提交改动。