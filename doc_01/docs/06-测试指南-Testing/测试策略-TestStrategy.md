# 测试策略文档

## 概述

本文档定义了LiqPass系统的完整测试策略，涵盖单元测试、集成测试、端到端测试和性能测试等多个层面，确保系统质量和可靠性。

## 测试金字塔

```mermaid
graph TD
    A[单元测试] --> B[集成测试]
    B --> C[端到端测试]
    C --> D[性能测试]
    
    A -.-> E[数量最多]
    E -.-> F[执行最快]
    F -.-> G[成本最低]
    
    D -.-> H[数量最少]
    H -.-> I[执行最慢]
    I -.-> J[成本最高]
```

## 测试类型

### 1. 单元测试 (Unit Tests)

#### 目标
验证单个函数、方法或类的正确性。

#### 覆盖范围
- 业务逻辑函数
- 工具函数
- 数据验证
- 错误处理

#### 技术栈
- **框架**: Jest
- **断言库**: Jest Assertions
- **覆盖率**: Istanbul/NYC
- **Mock库**: Jest Mocks

#### 示例
```javascript
// orders.test.js
describe('Order Service', () => {
  describe('createOrder', () => {
    it('should create a valid order', async () => {
      const orderData = {
        amount: 1000,
        leverage: 3,
        duration: 7
      };
      
      const order = await orderService.createOrder(orderData);
      
      expect(order).toHaveProperty('order_id');
      expect(order.amount).toBe(1000);
      expect(order.status).toBe('pending');
    });
    
    it('should reject invalid leverage', async () => {
      const orderData = {
        amount: 1000,
        leverage: 15,  // 无效杠杆
        duration: 7
      };
      
      await expect(orderService.createOrder(orderData))
        .rejects.toThrow('Invalid leverage');
    });
  });
});
```

### 2. 集成测试 (Integration Tests)

#### 目标
验证多个组件协同工作的正确性。

#### 覆盖范围
- API端点
- 数据库操作
- 外部服务集成
- 消息队列

#### 技术栈
- **框架**: Jest + Supertest
- **测试数据库**: PostgreSQL Test Container
- **HTTP客户端**: Supertest

#### 示例
```javascript
// api.integration.test.js
describe('Orders API', () => {
  let app;
  let db;
  
  beforeAll(async () => {
    // 启动测试数据库
    db = await startTestDB();
    app = await createApp();
  });
  
  afterAll(async () => {
    await db.close();
  });
  
  describe('POST /api/v1/orders', () => {
    it('should create order via API', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', 'Bearer test-token')
        .send({
          amount: 1000,
          leverage: 3,
          duration: 7
        })
        .expect(201);
      
      expect(response.body.order_id).toBeDefined();
      
      // 验证数据库记录
      const dbOrder = await db.orders.findByPk(response.body.order_id);
      expect(dbOrder).toBeDefined();
    });
  });
});
```

### 3. 端到端测试 (End-to-End Tests)

#### 目标
验证完整业务流程的正确性。

#### 覆盖范围
- 用户注册到保险购买
- 赔付申请流程
- 支付流程
- 通知系统

#### 技术栈
- **框架**: Playwright
- **浏览器自动化**: Chromium
- **API测试**: REST Assured

#### 示例
```javascript
// e2e/insurance-flow.test.js
describe('Insurance Flow', () => {
  test('complete insurance purchase flow', async ({ page }) => {
    // 1. 用户登录
    await page.goto('/login');
    await page.fill('#email', 'test@liqpass.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    
    // 2. 创建保险订单
    await page.click('button:has-text("购买保险")');
    await page.fill('#amount', '1000');
    await page.selectOption('#leverage', '3');
    await page.fill('#duration', '7');
    await page.click('button:has-text("确认购买")');
    
    // 3. 验证订单创建
    await expect(page.locator('.order-confirmation')).toBeVisible();
    const orderId = await page.textContent('.order-id');
    
    // 4. 验证数据库
    const order = await db.orders.findByPk(orderId);
    expect(order.status).toBe('pending');
  });
});
```

### 4. 性能测试 (Performance Tests)

#### 目标
验证系统在高负载下的性能表现。

#### 覆盖范围
- API响应时间
- 数据库查询性能
- 并发处理能力
- 资源使用情况

#### 技术栈
- **工具**: k6
- **监控**: Prometheus + Grafana
- **分析**: Chrome DevTools

#### 示例
```javascript
// performance/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // 逐步增加到100用户
    { duration: '5m', target: 100 },  // 保持100用户5分钟
    { duration: '2m', target: 0 },    // 逐步减少到0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95%请求在500ms内
    http_req_failed: ['rate<0.01'],    // 错误率低于1%
  },
};

export default function() {
  // 创建订单请求
  let orderResponse = http.post('http://api.liqpass.com/api/v1/orders', {
    amount: 1000,
    leverage: 3,
    duration: 7
  }, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  
  check(orderResponse, {
    'order created successfully': (r) => r.status === 201,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

## 测试环境

### 环境配置

| 环境 | 用途 | 数据库 | 外部服务 |
|------|------|--------|----------|
| 本地开发 | 单元测试 | SQLite | Mock服务 |
| 持续集成 | 集成测试 | Test Container | WireMock |
| 预发布 | 端到端测试 | 独立实例 | 沙盒环境 |
| 生产影子 | 性能测试 | 生产副本 | 真实服务 |

### 测试数据管理

#### 数据工厂
```javascript
// test/factories/order-factory.js
class OrderFactory {
  static createPendingOrder(overrides = {}) {
    return {
      order_id: faker.string.uuid(),
      user_address: faker.finance.ethereumAddress(),
      amount: 1000,
      leverage: 3,
      duration: 7,
      premium: 30,
      status: 'pending',
      ...overrides
    };
  }
  
  static createActiveOrder() {
    return this.createPendingOrder({
      status: 'active',
      premium_paid_at: new Date()
    });
  }
}
```

#### 数据清理
```javascript
// test/setup/cleanup.js
afterEach(async () => {
  // 清理测试数据
  await db.orders.destroy({ where: {}, truncate: true });
  await db.claims.destroy({ where: {}, truncate: true });
});
```

## 测试自动化

### CI/CD流水线

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### 测试报告

#### 覆盖率报告
```bash
# 生成覆盖率报告
npm run test:coverage

# 查看HTML报告
open coverage/lcov-report/index.html
```

#### 性能报告
```bash
# 运行性能测试
npm run test:performance

# 生成性能报告
open performance-report.html
```

## 质量门禁

### 通过标准

| 指标 | 标准 | 检查点 |
|------|------|--------|
| 单元测试覆盖率 | ≥ 80% | PR合并前 |
| 集成测试通过率 | 100% | 每日构建 |
| 端到端测试通过率 | ≥ 95% | 发布前 |
| 性能基准 | 满足SLA | 版本发布 |

### 质量检查清单

```bash
# 运行完整测试套件
npm run test:all

# 检查代码质量
npm run lint
npm run type-check

# 安全检查
npm run security-scan
```

## 特殊测试场景

### 安全测试

#### 渗透测试
```bash
# OWASP ZAP扫描
zap-baseline.py -t https://api.liqpass.com

# SQL注入测试
sqlmap -u "https://api.liqpass.com/api/v1/orders" --data="amount=1000"
```

#### 权限测试
```javascript
// security/authorization.test.js
describe('Authorization', () => {
  it('should prevent unauthorized order access', async () => {
    // 用户A创建订单
    const orderA = await createOrderAs(userA);
    
    // 用户B尝试访问
    const response = await request(app)
      .get(`/api/v1/orders/${orderA.id}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(403);
  });
});
```

### 兼容性测试

#### 浏览器兼容性
```javascript
// compatibility/browser.test.js
describe('Browser Compatibility', () => {
  ['chromium', 'firefox', 'webkit'].forEach(browserType => {
    test(`should work on ${browserType}`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      await page.goto('/');
      await expect(page.locator('h1')).toHaveText('LiqPass');
    });
  });
});
```

#### 区块链网络兼容性
```javascript
// compatibility/blockchain.test.js
describe('Blockchain Compatibility', () => {
  ['ethereum', 'polygon', 'arbitrum'].forEach(network => {
    test(`should work on ${network}`, async () => {
      const contract = await deployContract(network);
      const tx = await contract.createOrder(1000, 3, 7);
      await expect(tx.wait()).resolves.toBeDefined();
    });
  });
});
```

## 测试工具和资源

### 开发工具

```bash
# 测试监视模式
npm run test:watch

# 调试测试
npm run test:debug

# 性能分析
npm run test:profile
```

### 文档资源

- [测试框架文档](https://jestjs.io/docs)
- [性能测试指南](https://k6.io/docs)
- [安全测试手册](https://owasp.org/www-project-web-security-testing-guide)
- [测试最佳实践](https://martinfowler.com/articles/practical-test-pyramid.html)

## 持续改进

### 指标跟踪

| 指标 | 目标 | 当前值 | 趋势 |
|------|------|--------|------|
| 测试覆盖率 | 85% | 78% | ↗️ |
| 测试执行时间 | < 10min | 12min | ↘️ |
| 缺陷逃逸率 | < 5% | 7% | ↗️ |
| 自动化测试比例 | > 90% | 85% | ↗️ |

### 改进措施

1. **增加测试覆盖率**
   - 添加边界条件测试
   - 覆盖错误处理路径
   - 增加集成测试场景

2. **优化测试性能**
   - 并行执行测试
   - 优化测试数据准备
   - 使用测试容器

3. **提升测试质量**
   - 代码审查测试用例
   - 定期重构测试代码
   - 分享测试最佳实践

## 结论

LiqPass的测试策略采用分层方法，确保从代码级别到系统级别的全面质量保障。通过自动化测试和持续监控，我们能够快速发现和修复问题，为用户提供可靠的去中心化保险服务。