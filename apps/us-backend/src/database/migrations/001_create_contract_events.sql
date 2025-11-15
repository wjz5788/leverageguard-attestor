-- 创建合约事件表
CREATE TABLE IF NOT EXISTS contract_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    quote_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    event_timestamp INTEGER NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    
    -- 唯一约束，确保幂等性
    UNIQUE(tx_hash, log_index)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_contract_events_tx_hash ON contract_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_contract_events_order_id ON contract_events(order_id);
CREATE INDEX IF NOT EXISTS idx_contract_events_buyer_address ON contract_events(buyer_address);
CREATE INDEX IF NOT EXISTS idx_contract_events_block_number ON contract_events(block_number);
CREATE INDEX IF NOT EXISTS idx_contract_events_status ON contract_events(status);

-- 创建订单表（如果不存在）
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    buyer_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_tx_hash TEXT,
    payment_block_number INTEGER,
    payment_log_index INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建订单索引
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_address ON orders(buyer_address);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);