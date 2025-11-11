#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载测试环境变量
dotenv.config({ path: join(__dirname, '.env.test') });

console.log('🧪 测试启动顺序和环境验证修复');
console.log('================================');

// 测试环境变量是否加载正确
console.log('📋 环境变量检查:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`PORT: ${process.env.PORT}`);
console.log(`PAYMENT_VAULT_ADDRESS: ${process.env.PAYMENT_VAULT_ADDRESS}`);
console.log(`PAYMENT_CHAIN_ID: ${process.env.PAYMENT_CHAIN_ID}`);
console.log(`USDC_ADDRESS: ${process.env.USDC_ADDRESS}`);

// 测试环境验证模块
console.log('\n🔍 测试环境验证模块...');
try {
  // 使用tsx动态导入TypeScript模块
  const { execSync } = await import('child_process');
  
  // 测试支付配置验证
  console.log('✅ 支付配置验证测试:');
  execSync('npx tsx -e "import { EnvValidator } from \'./src/utils/envValidator\'; EnvValidator.validatePaymentConfig(); console.log(\'✅ 支付配置验证通过\');"', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  // 测试获取支付配置
  console.log('✅ 获取支付配置测试:');
  execSync('npx tsx -e "import { EnvValidator } from \'./src/utils/envValidator\'; const config = EnvValidator.getPaymentConfig(); console.log(\'✅ 支付配置获取成功\'); console.log(\'USDC地址:\', config.usdcAddress); console.log(\'金库地址:\', config.vaultAddress); console.log(\'链ID:\', config.chainId);"', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  // 测试订单服务中的支付配置构建（通过创建OrderService实例来测试）
  console.log('✅ 订单服务支付配置构建测试:');
  execSync('npx tsx -e "import OrderService from \'./src/services/orderService\'; const service = new OrderService(); const config = service.getPaymentConfig(); console.log(\'✅ 支付配置构建成功\'); console.log(\'USDC合约:\', config.usdcContract); console.log(\'金库地址:\', config.spenderOrVault); console.log(\'链ID:\', config.chainId);"', { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  console.log('\n🎉 所有测试通过！启动顺序和环境验证修复有效。');
  
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error('错误详情:', error);
  process.exit(1);
}

console.log('\n✅ 测试完成！修复验证成功。');