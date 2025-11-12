-- LiqPass 订单持久化验收SQL查询
-- 用于验证订单数据迁移和持久化效果

-- 1. 基础验收查询：查看最新3个订单
SELECT 
    id,
    status,
    payment_status,
    wallet_address,
    principal_usdc / 1000000.0 as principal_usd,
    premium_usdc / 1000000.0 as premium_usd,
    created_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 3;

-- 2. 订单与合约事件关联查询（链上回填验证）
SELECT 
    o.id as order_id,
    o.wallet_address,
    o.principal_usdc / 1000000.0 as principal_usd,
    o.premium_usdc / 1000000.0 as premium_usd,
    o.status as order_status,
    o.payment_status,
    ce.event_name,
    ce.amount_usdc / 1000000.0 as event_amount_usd,
    ce.block_number,
    ce.transaction_hash,
    ce.created_at as event_created_at
FROM orders o
LEFT JOIN contract_events ce ON o.id = ce.order_id
WHERE o.status IN ('pending', 'paid')
ORDER BY o.created_at DESC, ce.block_number DESC
LIMIT 10;

-- 3. 钱包维度订单统计
SELECT 
    wallet_address,
    COUNT(*) as total_orders,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_orders,
    COUNT(CASE WHEN status = 'claimed' THEN 1 END) as claimed_orders,
    SUM(principal_usdc) / 1000000.0 as total_principal_usd,
    SUM(premium_usdc) / 1000000.0 as total_premium_usd,
    MAX(created_at) as last_order_date
FROM orders
GROUP BY wallet_address
ORDER BY total_orders DESC, last_order_date DESC
LIMIT 20;

-- 4. 订单状态分布统计
SELECT 
    status,
    payment_status,
    COUNT(*) as order_count,
    AVG(principal_usdc) / 1000000.0 as avg_principal_usd,
    AVG(premium_usdc) / 1000000.0 as avg_premium_usd,
    MIN(created_at) as first_order,
    MAX(created_at) as last_order
FROM orders
GROUP BY status, payment_status
ORDER BY status, payment_status;

-- 5. 幂等性控制验证查询
SELECT 
    o.id as order_id,
    o.wallet_address,
    o.payment_proof_id,
    o.order_ref,
    q.id as quote_id,
    q.consumed,
    q.consumed_by_order_id,
    o.created_at
FROM orders o
LEFT JOIN quotes q ON o.id = q.consumed_by_order_id
WHERE o.payment_proof_id IS NOT NULL OR o.order_ref IS NOT NULL
ORDER BY o.created_at DESC
LIMIT 15;

-- 6. 时间窗口分析：24小时内创建的订单
SELECT 
    strftime('%Y-%m-%d %H:00', created_at) as hour_bucket,
    COUNT(*) as orders_created,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
    AVG(principal_usdc) / 1000000.0 as avg_principal_usd
FROM orders
WHERE created_at >= datetime('now', '-24 hours')
GROUP BY hour_bucket
ORDER BY hour_bucket DESC;

-- 7. 订单与理赔关联查询（完整业务链路）
SELECT 
    o.id as order_id,
    o.wallet_address,
    o.status as order_status,
    o.principal_usdc / 1000000.0 as principal_usd,
    o.payout_usdc / 1000000.0 as payout_usd,
    c.id as claim_id,
    c.status as claim_status,
    c.amount_usdc / 1000000.0 as claim_amount_usd,
    c.submitted_at,
    c.reviewed_at,
    c.payout_at
FROM orders o
LEFT JOIN claims c ON o.id = c.order_id
WHERE o.status IN ('active', 'claimed')
ORDER BY o.created_at DESC, c.submitted_at DESC
LIMIT 10;

-- 8. 数据库性能验证：索引使用情况
EXPLAIN QUERY PLAN
SELECT * FROM orders 
WHERE wallet_address = '0x742d35cc6634c0532925a3b8dc5d8c5b5b6b5b5b' 
AND status = 'pending'
ORDER BY created_at DESC;

-- 9. 数据完整性验证：检查缺失字段
SELECT 
    COUNT(*) as total_orders,
    COUNT(payment_status) as has_payment_status,
    COUNT(payment_method) as has_payment_method,
    COUNT(exchange) as has_exchange,
    COUNT(pair) as has_pair,
    COUNT(fee_ratio) as has_fee_ratio,
    COUNT(payout_ratio) as has_payout_ratio
FROM orders;

-- 10. 迁移前后数据对比验证
-- 假设有迁移前的内存数据备份表 orders_memory_backup
SELECT 
    '内存数据' as source,
    COUNT(*) as order_count,
    AVG(principal) as avg_principal,
    AVG(leverage) as avg_leverage
FROM orders_memory_backup
UNION ALL
SELECT 
    '数据库数据' as source,
    COUNT(*) as order_count,
    AVG(principal_usdc / 1000000.0) as avg_principal,
    AVG(leverage) as avg_leverage
FROM orders;

-- 11. 链上事件匹配成功率统计
SELECT 
    COUNT(*) as total_contract_events,
    COUNT(ce.order_id) as matched_events,
    COUNT(ce.order_id) * 100.0 / COUNT(*) as match_rate_percent,
    AVG(CASE WHEN ce.order_id IS NOT NULL THEN 1 ELSE 0 END) as avg_match_rate
FROM contract_events ce
LEFT JOIN orders o ON ce.order_id = o.id
WHERE ce.event_name = 'PremiumPaid';

-- 12. 订单生命周期分析
SELECT 
    o.id,
    o.created_at as order_created,
    ce.created_at as event_created,
    c.created_at as claim_created,
    julianday(ce.created_at) - julianday(o.created_at) as payment_delay_days,
    julianday(c.created_at) - julianday(ce.created_at) as claim_delay_days
FROM orders o
LEFT JOIN contract_events ce ON o.id = ce.order_id AND ce.event_name = 'PremiumPaid'
LEFT JOIN claims c ON o.id = c.order_id
WHERE o.status IN ('paid', 'active', 'claimed')
ORDER BY o.created_at DESC
LIMIT 10;