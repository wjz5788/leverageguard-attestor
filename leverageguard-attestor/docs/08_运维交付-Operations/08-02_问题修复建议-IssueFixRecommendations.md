# LeverageGuard 问题与解决方案汇总

以下内容汇总了当前仓库中发现的关键问题及对应的处理建议，尚未修改任何代码，便于后续统一修复。

---

## 1. 明文存储 OKX 凭据
- **位置**：`代码/核心代码.md:17-40`
- **问题**：`API_KEY`、`API_SECRET`、`PASSPHRASE` 以明文硬编码形式出现在仓库中，一旦仓库泄露即可直接控制账户。
- **解决方案**：
  1. 立即登录 OKX 后台吊销这组旧凭据并生成新密钥。
  2. 改为通过环境变量或密钥管理系统加载，例如：
     ```python
     API_KEY = os.environ["OKX_API_KEY"]
     API_SECRET = os.environ["OKX_API_SECRET"]
     PASSPHRASE = os.environ["OKX_API_PASSPHRASE"]
     ```
  3. 提供 `.env.example` 或部署说明，指导团队如何安全注入配置，避免再次写回仓库。

---

## 2. 消息队列日志模块导入错误
- **位置**：`microservices/common/message_queue.py:13`
- **问题**：尝试从不存在的模块 `.logging` 导入 `get_logger`，导致依赖消息队列的服务在启动阶段即抛 `ModuleNotFoundError`。
- **解决方案**：
  - 将导入改为现有日志工具，例如 `from .logging_system import get_logger`，或对 `common/logger.py` 进行薄包装后统一暴露接口。

---

## 3. `MessageQueueClient` 缺少连接状态接口
- **位置**：`microservices/common/message_queue.py`（类定义）及多处调用：`microservices/api_gateway/main.py:144`、`microservices/order_verification/main.py:282`、`microservices/payout_processing/main.py:282` 等。
- **问题**：服务健康检查普遍使用 `mq_client.connected` 判定 RabbitMQ 状态，但客户端类未实现该属性，运行时会抛 `AttributeError`。
- **解决方案**：
  1. 在 `MessageQueueClient` 内维护连接状态并提供 `connected` 只读属性或 `is_connected()` 方法。
  2. 同步调整各调用方，统一使用新的接口执行健康检查。

---

## 4. 审计日志接口与调用方不匹配
- **位置**：`microservices/common/logger.py:170-197`（`AuditLogger` 定义）与以下调用：
  - `microservices/order_verification/main.py:244-334`
  - `microservices/payout_processing/main.py:244-358`
- **问题**：
  - 调用端使用了 `audit_logger.log_verification_request(...)`、`audit_logger.log_payout_request(...)` 等不存在的方法。
  - 即使调用现有方法，也缺少必需参数（如 `user_id`）或命名参数不一致，导致 `AttributeError` 或 `TypeError`。
- **解决方案**：
  1. 明确审计日志的事件类型与字段，统一接口签名。
  2. 任选其一：
     - 扩展 `AuditLogger`，新增 `log_verification_request`、`log_payout_request` 等包装方法，参数与调用方保持一致；
     - 或调整调用代码，按现有方法签名传入 `user_id`、`order_id`、`status` 等必需字段。
  3. 为关键调用补充测试，确保接口调整后运行正常。

---

## 5. 赔付服务重试装饰器与同步实现冲突
- **位置**：`microservices/payout_processing/main.py:92-198`
- **问题**：`retry_on_exception` 返回异步包装器，但装饰的 `execute_payout` 是同步函数，调用时将得到 coroutine 对象并在同步上下文中使用，触发 `TypeError: object dict can't be used in 'await' expression`。
- **解决方案**：
  - 方案 A：将 `execute_payout` 改写为 `async def` 并在调用处使用 `await`。
  - 方案 B：提供同步版本的重试装饰器（例如使用循环结合 `time.sleep`），并保留异步实现供需要的函数使用。

---

## 6. 进一步的改进建议（可选）
- 将 `代码/核心代码.md` 中的脚本迁移到独立 `.py` 模块，并添加命令行入口及日志，方便复用与测试。
- 为 RabbitMQ、Web3 交互建立测试桩或模拟容器，通过 `docker-compose` 执行端到端验证，涵盖订单验证 → 赔付处理 → 报告生成的全链路。
- 补充配置文档和示例，明确各服务所需的环境变量、消息队列、数据库、区块链节点等依赖。

---

以上问题解决后，可显著提升系统的安全性、可维护性与稳定性。当前未对任何源代码做改动，可根据优先级逐项落地修复。
