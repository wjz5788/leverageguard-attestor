-- LiqPass 验证结果数据库迁移
-- 创建验证结果表，对应前端 OrderVerifier 与 ApiSettings 回显

-- 验证结果表（verify_results）
-- 避免与 002 的 orders 冲突，命名为 verify_results
CREATE TABLE IF NOT EXISTS verify_results (
  id TEXT PRIMARY KEY,                   -- vrf_xxx
  order_id TEXT NULL,                    -- 可为空：有时先验证再下单
  user_id TEXT NOT NULL,
  exchange TEXT NOT NULL,
  ord_id TEXT NOT NULL,
  inst_id TEXT NOT NULL,
  normalized_json TEXT NULL,             -- 统一映射 {order,position}
  checks_json TEXT NULL,
  evidence_id TEXT NULL,
  evidence_json TEXT NULL,               -- {leaves,root,algo,bundleHash,...}
  perf_json TEXT NULL,
  verdict TEXT NULL,                     -- pass/fail
  error_json TEXT NULL,                  -- 验证失败详情
  verified_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vr_ord ON verify_results(exchange, ord_id);
CREATE INDEX IF NOT EXISTS idx_vr_user ON verify_results(user_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_vr_order ON verify_results(order_id);
CREATE INDEX IF NOT EXISTS idx_vr_verdict ON verify_results(verdict, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_vr_verified ON verify_results(verified_at DESC);

-- 添加注释说明
-- 对应前端 OrderVerifier 与 ApiSettings 回显
-- 必要时通过 ord_id/inst_id 与 purchase_orders 绑定