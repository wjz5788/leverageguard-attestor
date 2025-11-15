# 贡献指南

## 欢迎贡献者！

感谢您对LiqPass项目的关注！我们欢迎各种形式的贡献，包括代码提交、文档改进、问题报告和功能建议。

## 快速开始

### 1. 寻找贡献机会

- **初学者友好**: 查看标记为 `good-first-issue` 的问题
- **文档改进**: 帮助改进文档和翻译
- **Bug修复**: 查看标记为 `bug` 的问题
- **功能开发**: 查看标记为 `enhancement` 的问题

### 2. 设置开发环境

```bash
# 克隆仓库
git clone https://github.com/liqpass/liqpass.git
cd liqpass

# 安装依赖
npm install

# 设置环境变量
cp .env.example .env

# 启动开发环境
npm run dev
```

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm run test:unit
npm run test:integration

# 检查代码质量
npm run lint
npm run type-check
```

## 贡献流程

### 1. Fork仓库

1. 访问 [LiqPass GitHub仓库](https://github.com/liqpass/liqpass)
2. 点击 "Fork" 按钮创建您的副本
3. 克隆您的fork到本地

### 2. 创建分支

```bash
# 创建功能分支
git checkout -b feature/your-feature-name

# 或修复分支
git checkout -b fix/issue-description
```

**分支命名规范**:
- `feature/`: 新功能开发
- `fix/`: Bug修复
- `docs/`: 文档改进
- `test/`: 测试相关
- `refactor/`: 代码重构

### 3. 开发代码

#### 代码风格

```javascript
// ✅ 好的代码风格
class OrderService {
  async createOrder(orderData) {
    const validatedData = this.validateOrderData(orderData);
    const order = await this.orderRepository.create(validatedData);
    return this.formatOrderResponse(order);
  }
}

// ❌ 避免的代码风格
class orderService {
  async CreateOrder(data) {
    // 复杂的嵌套逻辑
    if (data.amount && data.leverage && data.duration) {
      // ...
    }
  }
}
```

#### 提交信息规范

```bash
# 格式: <类型>(<范围>): <描述>

# 示例:
git commit -m "feat(orders): add order validation logic"
git commit -m "fix(api): resolve CORS issue in production"
git commit -m "docs(readme): update installation instructions"
```

**提交类型**:
- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

### 4. 编写测试

所有新功能必须包含相应的测试：

```javascript
// 单元测试示例
describe('Order Validation', () => {
  it('should validate order amount', () => {
    const validOrder = { amount: 1000, leverage: 3, duration: 7 };
    const invalidOrder = { amount: 0, leverage: 3, duration: 7 };
    
    expect(validateOrder(validOrder)).toBe(true);
    expect(() => validateOrder(invalidOrder)).toThrow('Invalid amount');
  });
});
```

### 5. 提交Pull Request

1. 推送分支到您的fork
2. 在GitHub上创建Pull Request
3. 填写PR模板
4. 等待代码审查

## 代码规范

### JavaScript/TypeScript规范

#### 变量命名

```javascript
// ✅ 好的命名
const userAddress = '0x...';
const insuranceAmount = 1000;
const isOrderValid = true;

// ❌ 避免的命名
const addr = '0x...';
const amt = 1000;
const valid = true;
```

#### 函数设计

```javascript
// ✅ 好的函数设计
async function createInsuranceOrder(userData, orderConfig) {
  validateInput(userData, orderConfig);
  const premium = calculatePremium(orderConfig);
  return await saveOrder({ ...userData, premium });
}

// ❌ 避免的函数设计
async function createOrder(data, config, user, db, logger) {
  // 参数过多，职责不清晰
}
```

### 智能合约规范

#### Solidity代码规范

```solidity
// ✅ 好的合约设计
contract InsuranceCore {
    using SafeMath for uint256;
    
    struct Order {
        uint256 amount;
        uint256 leverage;
        uint256 duration;
        OrderStatus status;
    }
    
    mapping(uint256 => Order) public orders;
    
    function createOrder(uint256 amount, uint256 leverage, uint256 duration) 
        external 
        returns (uint256 orderId) 
    {
        require(amount > 0, "Invalid amount");
        require(leverage >= 1 && leverage <= 10, "Invalid leverage");
        
        orderId = nextOrderId++;
        orders[orderId] = Order(amount, leverage, duration, OrderStatus.Pending);
        
        emit OrderCreated(orderId, msg.sender, amount, leverage, duration);
    }
}
```

### 文档规范

#### 代码注释

```javascript
/**
 * 创建保险订单
 * @param {Object} orderData - 订单数据
 * @param {number} orderData.amount - 保险金额
 * @param {number} orderData.leverage - 杠杆倍数
 * @param {number} orderData.duration - 保险期限
 * @returns {Promise<Order>} 创建的订单对象
 * @throws {ValidationError} 当输入数据无效时
 */
async function createOrder(orderData) {
  // 实现逻辑
}
```

#### README更新

所有新功能应该更新相应的文档：
- 代码注释
- API文档
- 用户指南
- 变更日志

## 审查流程

### 1. 自动化检查

每个PR都会自动运行：
- 代码质量检查 (ESLint)
- 类型检查 (TypeScript)
- 单元测试
- 集成测试
- 安全扫描

### 2. 人工审查

审查者会检查：
- **功能正确性**: 代码是否按预期工作
- **代码质量**: 是否符合编码规范
- **测试覆盖**: 是否有足够的测试
- **文档更新**: 是否更新了相关文档
- **性能影响**: 是否影响系统性能

### 3. 审查反馈

审查者可能要求：
- 代码修改
- 补充测试
- 文档更新
- 性能优化

### 4. 合并标准

PR必须满足以下条件才能合并：
- ✅ 所有检查通过
- ✅ 至少1个审查者批准
- ✅ 解决所有评论
- ✅ 更新相关文档

## 特殊贡献类型

### 文档贡献

#### 文档结构

```
docs/
├── tutorials/          # 教程
├── how-to/             # 操作指南
├── reference/          # API参考
└── explanations/       # 概念解释
```

#### 文档质量标准

- 使用清晰的语言
- 包含实际示例
- 保持内容更新
- 遵循Markdown规范

### 翻译贡献

我们支持多语言文档：

```
docs/
├── zh-CN/             # 中文文档
├── en-US/             # 英文文档
└── ja-JP/             # 日文文档
```

### 测试贡献

#### 测试类型

- **单元测试**: 验证单个函数
- **集成测试**: 验证组件协作
- **端到端测试**: 验证完整流程
- **性能测试**: 验证系统性能

#### 测试质量标准

- 测试用例清晰明确
- 覆盖边界条件
- 模拟外部依赖
- 断言具体明确

## 社区准则

### 行为准则

我们遵循 [贡献者公约行为准则](https://www.contributor-covenant.org/)。

**期望行为**:
- 使用友好和包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 关注社区的整体利益

**不可接受行为**:
- 使用性化语言或图像
- 挑衅、侮辱/贬损评论
- 公开或私下骚扰
- 其他不专业或不尊重的行为

### 沟通渠道

- **问题讨论**: GitHub Issues
- **实时交流**: Discord 频道
- **开发讨论**: GitHub Discussions
- **安全报告**: security@liqpass.com

## 开发工具

### 推荐工具

#### 代码编辑器
- VS Code with extensions:
  - ESLint
  - Prettier
  - TypeScript Hero
  - GitLens

#### 浏览器工具
- MetaMask for blockchain interactions
- Postman for API testing
- Chrome DevTools for debugging

#### 开发工具
- Docker for containerization
- Hardhat for smart contract development
- Jest for testing

### 开发脚本

```bash
# 开发脚本
npm run dev           # 启动开发服务器
npm run build         # 构建生产版本
npm run test          # 运行测试
npm run lint          # 代码检查
npm run type-check   # 类型检查

# 数据库相关
npm run db:migrate   # 运行数据库迁移
npm run db:seed      # 初始化测试数据

# 部署相关
npm run deploy:staging    # 部署到测试环境
npm run deploy:production # 部署到生产环境
```

## 故障排除

### 常见问题

#### 环境设置问题

```bash
# 如果遇到依赖问题
rm -rf node_modules package-lock.json
npm install

# 如果数据库连接失败
sudo service postgresql start
createdb liqpass_dev
```

#### 测试失败问题

```bash
# 清理测试数据库
npm run db:test:reset

# 运行特定测试文件
npm run test -- src/services/order-service.test.js
```

### 获取帮助

如果您遇到问题：
1. 查看 [问题文档](https://github.com/liqpass/liqpass/issues)
2. 搜索现有问题
3. 创建新问题并提供详细信息
4. 在Discord寻求帮助

## 奖励和认可

### 贡献者榜单

我们会在项目README中列出主要贡献者：

```markdown
## 贡献者

感谢这些优秀的贡献者：

<!-- 自动生成的贡献者列表 -->
```

### 特殊贡献

对于重大贡献，我们可能：
- 邀请加入核心团队
- 提供项目权益
- 在社交媒体上宣传
- 提供推荐信

## 法律事项

### 许可证

LiqPass项目采用 [MIT许可证](LICENSE)。

### 贡献者许可协议

通过向本项目贡献代码，您同意：
1. 您的贡献将在MIT许可证下发布
2. 您拥有提交代码的合法权利
3. 您同意项目维护者使用您的贡献

## 更新日志

### 版本历史

查看 [CHANGELOG.md](CHANGELOG.md) 了解项目变更历史。

### 重大变更

重大变更会在发布说明中详细描述，并可能包含迁移指南。

## 联系方式

### 项目维护者

- **技术负责人**: tech@liqpass.com
- **社区经理**: community@liqpass.com
- **安全报告**: security@liqpass.com

### 社区资源

- [项目网站](https://liqpass.com)
- [文档网站](https://docs.liqpass.com)
- [GitHub仓库](https://github.com/liqpass/liqpass)
- [Discord社区](https://discord.gg/liqpass)

## 感谢贡献！

您的每一份贡献都让LiqPass变得更好。感谢您为去中心化保险生态系统做出的努力！

---

*最后更新: 2024年1月*  
*文档版本: v1.0*