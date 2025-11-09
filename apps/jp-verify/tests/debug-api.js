#!/usr/bin/env node

/**
 * @file debug-api.js
 * @description API密钥调试脚本
 */

import dotenv from 'dotenv';
import crypto from 'node:crypto';

// 加载环境变量
dotenv.config();

console.log('🔍 API密钥调试工具');
console.log('='.repeat(50));

// 检查环境变量
console.log('\n📋 环境变量检查:');
console.log(`OKX_API_KEY: ${process.env.OKX_API_KEY ? '已设置' : '未设置'}`);
console.log(`OKX_SECRET_KEY: ${process.env.OKX_SECRET_KEY ? '已设置' : '未设置'}`);
console.log(`OKX_PASSPHRASE: ${process.env.OKX_PASSPHRASE ? '已设置' : '未设置'}`);

// 检查密钥格式
console.log('\n🔑 密钥格式检查:');

const apiKey = process.env.OKX_API_KEY;
const secretKey = process.env.OKX_SECRET_KEY;
const passphrase = process.env.OKX_PASSPHRASE;

if (apiKey) {
    console.log(`API Key长度: ${apiKey.length} 字符`);
    console.log(`API Key格式: ${/^[a-f0-9-]+$/.test(apiKey) ? 'UUID格式 ✓' : '非标准格式 ⚠️'}`);
}

if (secretKey) {
    console.log(`Secret Key长度: ${secretKey.length} 字符`);
    console.log(`Secret Key格式: ${/^[A-F0-9]+$/.test(secretKey) ? '十六进制格式 ✓' : '非标准格式 ⚠️'}`);
}

if (passphrase) {
    console.log(`Passphrase长度: ${passphrase.length} 字符`);
}

// 测试签名生成
console.log('\n🔐 签名生成测试:');

try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/trade/order';
    const queryString = 'instId=BTC-USDT-SWAP&clOrdId=2940071038556348417';
    
    const signature = crypto
        .createHmac('sha256', secretKey || '')
        .update(timestamp + method + requestPath + queryString)
        .digest('base64');
    
    console.log('✅ 签名生成成功');
    console.log(`   时间戳: ${timestamp}`);
    console.log(`   签名长度: ${signature.length} 字符`);
    
} catch (error) {
    console.error('❌ 签名生成失败:', error.message);
}

// 检查可能的配置问题
console.log('\n💡 常见问题排查:');

// 1. 检查是否是模拟盘配置
if (process.env.OKX_SIMULATED === '1') {
    console.log('⚠️  当前配置为模拟盘，但API密钥可能是实盘的');
    console.log('   建议: 检查OKX_SIMULATED设置是否正确');
}

// 2. 检查密钥权限
console.log('🔐 API密钥权限检查:');
console.log('   请确认API密钥具有以下权限:');
console.log('   - 读取订单信息权限');
console.log('   - 交易权限（可选）');
console.log('   - IP白名单设置（如果启用）');

// 3. 检查网络连接
console.log('\n🌐 网络连接检查:');
console.log('   如果API密钥正确但认证失败，可能是:');
console.log('   - IP地址被限制');
console.log('   - 防火墙或代理问题');
console.log('   - OKX API服务临时故障');

console.log('\n🚀 建议操作:');
console.log('1. 登录OKX官网检查API密钥状态');
console.log('2. 确认API密钥权限设置');
console.log('3. 检查IP白名单设置');
console.log('4. 尝试在OKX官网手动测试API调用');