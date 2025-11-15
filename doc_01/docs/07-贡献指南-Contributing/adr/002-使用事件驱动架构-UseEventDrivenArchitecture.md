# ADR-002: 采用事件驱动架构

## 状态
**已接受**

## 背景
LiqPass系统需要处理复杂的业务流程，包括订单创建、赔付申请、合约事件监听等。这些流程涉及多个组件之间的协作，需要一个灵活、可扩展的架构模式。

## 决策
我们采用事件驱动架构（Event-Driven Architecture, EDA）作为核心架构模式。

## 理由

### 优势
1. **松耦合**: 组件间通过事件通信，降低直接依赖
2. **可扩展性**: 新功能可以通过监听现有事件实现
3. **异步处理**: 提高系统吞吐量和响应性
4. **容错性**: 单个组件故障不影响整体系统
5. **可追溯性**: 事件日志提供完整的操作历史

### 架构模式选择

| 架构模式 | 优势 | 劣势 | 适用场景 |
|----------|------|------|----------|
| **事件驱动** | 松耦合、可扩展、异步 | 复杂性高、调试困难 | 复杂业务流程、微服务架构 |
| 请求-响应 | 简单直观、同步处理 | 紧耦合、扩展性差 | 简单CRUD应用 |
| 消息队列 | 可靠传输、削峰填谷 | 系统复杂性增加 | 高并发、异步处理 |
| CQRS | 读写分离、性能优化 | 数据一致性复杂 | 读写负载差异大的系统 |

## 后果

### 正面影响
- 系统组件可以独立开发和部署
- 支持水平扩展和负载均衡
- 提高系统的弹性和容错能力
- 便于实现复杂的业务逻辑

### 负面影响
- 增加了系统的复杂性
- 需要处理事件顺序和一致性
- 调试和问题排查难度增加
- 需要额外的事件存储和处理机制

### 中性影响
- 需要团队掌握事件驱动开发模式
- 需要建立事件规范和标准

## 实施指南

### 事件定义规范
```typescript
interface BaseEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  source: string;
  version: string;
}

interface OrderCreatedEvent extends BaseEvent {
  orderId: string;
  userId: string;
  amount: number;
  productType: string;
}
```

### 事件总线实现
使用Redis Pub/Sub作为事件总线：
```typescript
class EventBus {
  async publish(event: BaseEvent): Promise<void> {
    await redis.publish('events', JSON.stringify(event));
  }
  
  async subscribe(handler: EventHandler): Promise<void> {
    await redis.subscribe('events', (message) => {
      const event = JSON.parse(message) as BaseEvent;
      handler.handle(event);
    });
  }
}
```

### 事件处理模式
1. **简单事件处理**: 直接处理事件并更新状态
2. **Saga模式**: 处理跨多个服务的复杂事务
3. **事件溯源**: 通过事件序列重建状态

## 相关决策
- [ADR-001: 使用PostgreSQL作为主数据库](./001-use-postgresql.md)
- [ADR-003: 采用微服务架构](./003-microservices-architecture.md)
- [ADR-004: 事件存储策略](./004-event-storage-strategy.md)

## 参考资料
1. [事件驱动架构模式](https://microservices.io/patterns/data/event-driven-architecture.html)
2. [领域驱动设计中的事件](https://domainlanguage.com/ddd/)
3. [事件溯源模式](https://martinfowler.com/eaaDev/EventSourcing.html)