# 监听器Runbook v1.1

## 概述

本文档为LiqPass系统v1.1版本的监听器操作手册，包含事件监听、订单监控、验证作业处理等核心功能的详细操作指南。

## 1. 系统架构

### 1.1 监听器组件
```
├── event_listeners/
│   ├── __init__.py
│   ├── okx_listener.py          # OKX事件监听
│   ├── order_monitor.py         # 订单状态监控
│   ├── verification_handler.py  # 验证作业处理
│   └── webhook_receiver.py      # Webhook接收器
├── services/
│   ├── event_crawler.py         # 事件爬虫
│   ├── order_service.py         # 订单服务
│   └── verification_service.py  # 验证服务
└── queues/
    ├── task_queue.py            # 任务队列
    └── notification_queue.py    # 通知队列
```

### 1.2 数据流
```
交易所 → 事件监听器 → 任务队列 → 验证服务 → 证据包 → 前端通知
  ↓           ↓           ↓         ↓         ↓
 钱包地址   订单匹配     异步处理   哈希验证   Toast提示
```

## 2. 部署与启动

### 2.1 环境准备
```bash
# 1. 依赖安装
pip install -r requirements.txt
npm install  # 前端依赖

# 2. 数据库初始化
python scripts/init_database.py

# 3. 配置文件检查
cp .env.example .env
# 编辑.env配置交易所API密钥

# 4. 启动服务
python main.py                    # 启动API服务
python scripts/start_listeners.py # 启动监听器
```

### 2.2 配置文件示例
```bash
# .env配置
DATABASE_URL=sqlite:///liqpass.db

# OKX交易所
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret
OKX_PASSPHRASE=your_passphrase
OKX_SANDBOX=True  # 测试环境

# 监听器配置
LISTENER_BATCH_SIZE=100
LISTENER_INTERVAL=5  # 秒
LISTENER_MAX_RETRY=3

# 验证服务
VERIFICATION_TIMEOUT=300  # 5分钟
EVIDENCE_STORAGE_PATH=./evidence/

# 通知配置
WEBHOOK_SECRET=your_webhook_secret
NOTIFICATION_BATCH_SIZE=50
```

## 3. 监听器操作

### 3.1 事件监听器 (Event Listeners)

#### 3.1.1 OKX事件监听
```python
# 启动OKX监听
python -c "
from listeners.okx_listener import OKXListener
listener = OKXListener(
    api_key='your_key',
    secret='your_secret', 
    passphrase='your_passphrase'
)
listener.start_listening()
"
```

**监控事件**:
- 订单状态变更 (order-filled, order-partial-fill)
- 账户余额变更 (account-balance-update)
- 持仓变更 (position-update)
- 交易执行 (execution-report)

**监听范围**:
- 所有用户的授权账户
- 特定交易对 (BTC-USDT-SWAP, ETH-USDT-SWAP)
- 时间范围：最近24小时

#### 3.1.2 事件处理流程
```python
# 1. 接收事件
event = okx_client.get_event()

# 2. 事件解析
if event['event_type'] == 'execution-report':
    order_update = parse_order_execution(event)
    
# 3. 数据库更新
order_service.update_order_status(
    order_id=order_update['order_id'],
    new_status=order_update['status'],
    fill_data=order_update['fill_data']
)

# 4. 触发验证
if order_update['is_filled']:
    verification_service.create_verification_job(
        order_id=order_update['order_id'],
        priority='high'
    )
```

### 3.2 订单监控 (Order Monitor)

#### 3.2.1 监控任务
```bash
# 启动订单监控
python -c "
from services.order_monitor import OrderMonitor
monitor = OrderMonitor()
monitor.start_monitoring()
"
```

**监控列表**:
- `pending` 状态订单：确认超时检查
- `confirmed` 状态订单：等待成交检查
- `in_progress` 状态订单：验证超时处理

#### 3.2.2 超时处理
```python
# 确认超时处理
def handle_confirmation_timeout(order_id: str):
    order = order_service.get_order(order_id)
    
    if order.status == 'pending':
        # 更新为失败
        order_service.update_order_status(
            order_id=order_id,
            new_status='failed',
            error_reason='confirmation_timeout'
        )
        
        # 记录审计日志
        audit_log.record_timeout(order_id, 'confirmation')
        
        # 发送通知
        notification_service.send_failure_notification(
            user_id=order.user_id,
            order_id=order_id,
            reason='confirmation_timeout'
        )

# 验证超时处理
def handle_verification_timeout(job_uid: str):
    job = verification_service.get_job(job_uid)
    
    if job.status == 'in_progress':
        # 更新为失败
        verification_service.update_job_status(
            job_uid=job_uid,
            new_status='failed',
            error_reason='verification_timeout'
        )
        
        # 创建待补全证据
        evidence_service.create_pending_evidence(
            job_uid=job_uid,
            reason='verification_timeout'
        )
```

### 3.3 验证作业处理 (Verification Handler)

#### 3.3.1 作业队列处理
```bash
# 启动验证处理器
python -c "
from services.verification_handler import VerificationHandler
handler = VerificationHandler()
handler.start_processing()
"
```

**队列类型**:
- `verification_high`: 高优先级验证（实时订单）
- `verification_normal`: 普通优先级验证（手动验证）
- `verification_low`: 低优先级验证（后台重试）

#### 3.3.2 验证流程
```python
# 1. 获取待处理作业
job = queue_service.get_next_job('verification_high')

# 2. 启动验证作业
with verification_service.start_job(job_uid=job.job_uid) as context:
    
    # 3. 获取订单信息
    order = order_service.get_order(job.order_id)
    
    # 4. 获取三件套数据
    three_items = data_service.get_three_items(order)
    
    # 5. 执行验证
    if three_items.evidence_hash:
        result = verification_service.verify_evidence(
            evidence_hash=three_items.evidence_hash,
            expected_hash=three_items.expected_evidence_hash
        )
        
        if result.is_valid:
            # 6. 更新作业状态
            context.complete_job(success=True)
            
            # 7. 触发前端通知
            notification_service.send_success_notification(
                user_id=order.user_id,
                order_id=order.order_id,
                verification_result=result
            )
        else:
            # 验证失败处理
            context.complete_job(success=False, error=result.error)
```

## 4. 事件流管理

### 4.1 事件游标管理
```python
# 事件游标存储
event_cursor = {
    'cursor_key': 'okx:order:filled:20241219',
    'block_number': 10293847,
    'transaction_hash': '0x1234...',
    'log_index': 15,
    'event_type': 'order_filled',
    'processed': False,
    'created_at': '2024-12-19T10:30:00Z'
}

# 游标更新
def update_cursor(cursor_key: str, latest_event: dict):
    EventCursor.update(
        cursor_key=cursor_key,
        block_number=latest_event['block_number'],
        transaction_hash=latest_event['transaction_hash'],
        log_index=latest_event['log_index'],
        processed=False
    )
```

### 4.2 幂等性保证
```python
# 事件去重
def is_event_processed(event: dict) -> bool:
    event_hash = hashlib.sha256(
        json.dumps(event, sort_keys=True).encode()
    ).hexdigest()
    
    existing = IdempotencyStore.find_by_hash(event_hash)
    return existing is not None

# 标记事件已处理
def mark_event_processed(event: dict):
    event_hash = hashlib.sha256(
        json.dumps(event, sort_keys=True).encode()
    ).hexdigest()
    
    IdempotencyStore.create(
        hash_key=event_hash,
        event_data=event,
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
```

## 5. 监控与告警

### 5.1 关键指标
```python
# 监听器指标
LISTENER_METRICS = {
    'events_received_total': '接收事件总数',
    'events_processed_total': '已处理事件总数', 
    'events_failed_total': '处理失败事件数',
    'orders_pending_count': '待处理订单数',
    'verification_jobs_active': '活跃验证作业数',
    'average_processing_time': '平均处理时间(秒)',
    'error_rate': '错误率(%)'
}

# 告警阈值
ALERT_THRESHOLDS = {
    'error_rate': 0.05,      # 错误率超过5%
    'processing_time': 30,    # 处理时间超过30秒
    'pending_orders': 100,    # 待处理订单超过100个
    'verification_timeout': 10 # 验证超时次数超过10次
}
```

### 5.2 日志配置
```python
# 结构化日志
import structlog

logger = structlog.get_logger()

# 事件处理日志
def log_event_processing(event: dict, result: str):
    logger.info(
        "event_processed",
        event_type=event['event_type'],
        order_id=event.get('order_id'),
        result=result,
        processing_time=get_processing_time(),
        timestamp=datetime.utcnow().isoformat()
    )

# 错误日志
def log_processing_error(event: dict, error: Exception):
    logger.error(
        "event_processing_failed",
        event_type=event['event_type'],
        error_type=type(error).__name__,
        error_message=str(error),
        event_data=event,
        timestamp=datetime.utcnow().isoformat()
    )
```

## 6. 故障处理

### 6.1 常见问题

#### 6.1.1 事件积压
```bash
# 检查队列状态
python -c "
from queues.task_queue import TaskQueue
queue = TaskQueue()
print('队列长度:', queue.get_length('verification_high'))
print('队列详情:', queue.get_queue_details())
"

# 清理过期任务
python scripts/cleanup_expired_jobs.py

# 重启监听器
pkill -f "okx_listener"
python scripts/start_listeners.py
```

#### 6.1.2 验证超时
```bash
# 手动重试验证
python -c "
from services.verification_service import VerificationService
service = VerificationService()

# 重试指定作业
service.retry_verification('job_ulid_12345')

# 批量重试
service.retry_failed_verifications(limit=50)
"
```

#### 6.1.3 数据库连接
```python
# 数据库连接重试
def with_retry(func, max_retries=3, delay=1):
    for attempt in range(max_retries):
        try:
            return func()
        except DatabaseError as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(delay * (2 ** attempt))  # 指数退避
```

### 6.2 紧急恢复
```bash
# 1. 停止所有监听器
pkill -f "listener"

# 2. 检查数据库状态
python -c "
import sqlite3
conn = sqlite3.connect('liqpass.db')
print('数据库连接正常')
conn.close()
"

# 3. 清理损坏任务
python scripts/cleanup_corrupted_tasks.py

# 4. 重新启动服务
python main.py &          # API服务
python scripts/start_listeners.py  # 监听器

# 5. 验证服务恢复
curl -X GET http://localhost:8000/health
```

## 7. 性能优化

### 7.1 批量处理
```python
# 批量更新订单状态
def batch_update_orders(orders: List[dict]):
    batch_size = 100
    
    for i in range(0, len(orders), batch_size):
        batch = orders[i:i + batch_size]
        with db.transaction():
            for order in batch:
                order_service.update_order(
                    order_id=order['id'],
                    status=order['status'],
                    updated_at=datetime.utcnow()
                )
        logger.info(f"批处理完成: {len(batch)} 个订单")
```

### 7.2 缓存策略
```python
# Redis缓存
import redis

redis_client = redis.Redis(host='localhost', port=6379, db=0)

# 缓存订单信息
def get_cached_order(order_id: str):
    cache_key = f"order:{order_id}"
    cached = redis_client.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # 数据库查询
    order = order_service.get_order(order_id)
    
    # 写入缓存（5分钟）
    redis_client.setex(
        cache_key, 
        300, 
        json.dumps(order.to_dict())
    )
    
    return order.to_dict()
```

---

**文档版本**: v1.1  
**最后更新**: 2024-12-19  
**维护者**: LiqPass运维团队