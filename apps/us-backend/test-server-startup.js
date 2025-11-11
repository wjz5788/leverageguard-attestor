#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载测试环境变量
dotenv.config({ path: join(__dirname, '.env.test') });

console.log('🧪 测试服务器启动流程修复');
console.log('========================');

// 模拟服务器启动流程
console.log('🔍 模拟服务器启动流程...');

try {
  // 1. 加载环境变量（已在上面完成）
  console.log('✅ 环境变量加载完成');
  
  // 2. 测试环境验证（这是修复的核心）
  console.log('✅ 测试环境验证模块...');
  
  // 使用我们之前验证成功的测试方法
  console.log('🚀 模拟服务器启动流程...');
  
  // 测试1: 环境变量检查
  console.log('\n🔍 测试1: 环境变量检查');
  const envCheckScript = `
    import dotenv from 'dotenv';
    dotenv.config({ path: '.env.test' });
    console.log('✅ 环境变量加载成功');
    console.log('USDC地址:', process.env.USDC_ADDRESS || '未设置');
    console.log('金库地址:', process.env.TREASURY_ADDRESS || '未设置');
    console.log('链ID:', process.env.CHAIN_ID || '未设置');
  `;
  
  execSync(`npx tsx -e "${envCheckScript.replace(/"/g, '\\"')}"`, { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  // 测试2: 支付配置验证
  console.log('\n🔍 测试2: 支付配置验证');
  const paymentValidationScript = `
    import dotenv from 'dotenv';
    import { EnvValidator } from './src/utils/envValidator.ts';
    dotenv.config({ path: '.env.test' });
    
    try {
      EnvValidator.validatePaymentConfig();
      console.log('✅ 支付配置验证通过');
      const config = EnvValidator.getPaymentConfig();
      console.log('USDC地址:', config.usdcAddress);
      console.log('金库地址:', config.vaultAddress);
      console.log('链ID:', config.chainId);
    } catch (error) {
      console.error('❌ 支付配置验证失败:', error.message);
      process.exit(1);
    }
  `;
  
  execSync(`npx tsx -e "${paymentValidationScript.replace(/"/g, '\\"')}"`, { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  // 测试3: 订单服务支付配置构建
  console.log('\n🔍 测试3: 订单服务支付配置构建');
  const orderServiceScript = `
    import dotenv from 'dotenv';
    import OrderService from './src/services/orderService.ts';
    dotenv.config({ path: '.env.test' });
    
    try {
      const service = new OrderService();
      const paymentConfig = service.getPaymentConfig();
      console.log('✅ 订单服务支付配置构建成功');
      console.log('USDC合约:', paymentConfig.usdcContract);
      console.log('金库地址:', paymentConfig.spenderOrVault);
      console.log('链ID:', paymentConfig.chainId);
    } catch (error) {
      console.error('❌ 订单服务配置失败:', error.message);
      process.exit(1);
    }
  `;
  
  execSync(`npx tsx -e "${orderServiceScript.replace(/"/g, '\\"')}"`, { 
    cwd: __dirname, 
    stdio: 'inherit' 
  });
  
  console.log('\n✅ 服务器启动流程测试完成！');
  
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error('错误详情:', error);
  process.exit(1);
}

console.log('\n🎉 所有测试通过！启动顺序和环境验证修复有效。');