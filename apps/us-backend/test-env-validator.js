// 测试环境变量验证器
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 导入验证器
const { EnvValidator } = require('./dist/utils/envValidator.js');

console.log('🧪 测试环境变量验证器...\n');

// 测试1: 无环境变量情况
try {
  console.log('测试1: 无环境变量配置');
  EnvValidator.validatePaymentConfig();
  console.log('❌ 测试失败: 应该抛出错误');
} catch (error) {
  console.log('✅ 测试通过:', error.message);
}

console.log('\n---\n');

// 测试2: 设置正确的环境变量
process.env.PAYMENT_VAULT_ADDRESS = '0x742d35Cc6634C0532925a3b8D9c9C8b5f7a9F8c2';
process.env.PAYMENT_CHAIN_ID = '1';
process.env.USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

try {
  console.log('测试2: 正确环境变量配置');
  EnvValidator.validatePaymentConfig();
  console.log('✅ 测试通过: 环境变量校验成功');
} catch (error) {
  console.log('❌ 测试失败:', error.message);
}

console.log('\n---\n');

// 测试3: 设置无效的地址
process.env.PAYMENT_VAULT_ADDRESS = 'invalid-address';

try {
  console.log('测试3: 无效地址配置');
  EnvValidator.validatePaymentConfig();
  console.log('❌ 测试失败: 应该抛出错误');
} catch (error) {
  console.log('✅ 测试通过:', error.message);
}

console.log('\n---\n');

// 测试4: 黑洞地址
process.env.PAYMENT_VAULT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
process.env.PAYMENT_CHAIN_ID = '1';
process.env.USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

try {
  console.log('测试4: 黑洞地址配置');
  EnvValidator.validatePaymentConfig();
  console.log('❌ 测试失败: 应该抛出错误');
} catch (error) {
  console.log('✅ 测试通过:', error.message);
}

console.log('\n🧪 测试完成');