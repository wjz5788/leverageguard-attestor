#!/usr/bin/env node

/**
 * @file signature-debug.js
 * @description 签名调试脚本 - 对比Python和JavaScript的签名差异
 */

import crypto from 'node:crypto';

// 测试数据
const API_SECRET = 'F9F45C90C94953FDACEBFE3697248B33';
const timestamp = '2025-11-03T15:52:22Z';
const method = 'GET';
const requestPath = '/api/v5/trade/order?instId=BTC-USDT-SWAP&ordId=2940071038556348417';
const body = '';

console.log('🔐 签名调试分析');
console.log('='.repeat(50));

// 方法1: JavaScript风格（我们之前的实现）
function jsStyleSignature() {
    const message = timestamp + method + requestPath + body;
    const hmac = crypto.createHmac('sha256', API_SECRET);
    hmac.update(message);
    return hmac.digest('base64');
}

// 方法2: Python风格（基于成功脚本）
function pythonStyleSignature() {
    const message = `${timestamp}${method.toUpperCase()}${requestPath}${body || ''}`;
    const hmac = crypto.createHmac('sha256', API_SECRET);
    hmac.update(message);
    return hmac.digest('base64');
}

// 方法3: 详细调试版本
function debugSignature() {
    console.log('\n📋 签名输入参数:');
    console.log(`   时间戳: "${timestamp}"`);
    console.log(`   方法: "${method}"`);
    console.log(`   路径: "${requestPath}"`);
    console.log(`   Body: "${body}"`);
    
    // 测试不同的消息格式
    const testCases = [
        {
            name: 'JavaScript风格',
            message: timestamp + method + requestPath + body
        },
        {
            name: 'Python风格',
            message: `${timestamp}${method.toUpperCase()}${requestPath}${body || ''}`
        },
        {
            name: 'Python风格（小写方法）',
            message: `${timestamp}${method.toLowerCase()}${requestPath}${body || ''}`
        },
        {
            name: '仅时间戳+路径',
            message: `${timestamp}${requestPath}`
        },
        {
            name: '时间戳+大写方法+路径',
            message: `${timestamp}${method.toUpperCase()}${requestPath}`
        }
    ];
    
    console.log('\n🔍 不同消息格式的签名结果:');
    console.log('-'.repeat(40));
    
    for (const testCase of testCases) {
        const hmac = crypto.createHmac('sha256', API_SECRET);
        hmac.update(testCase.message);
        const signature = hmac.digest('base64');
        
        console.log(`\n${testCase.name}:`);
        console.log(`   消息: "${testCase.message}"`);
        console.log(`   签名: ${signature}`);
        console.log(`   签名长度: ${signature.length}`);
        console.log(`   签名前20字符: ${signature.substring(0, 20)}`);
    }
    
    // 检查时间戳格式
    console.log('\n⏰ 时间戳格式分析:');
    console.log('-'.repeat(40));
    
    const timestampVariants = [
        '2025-11-03T15:52:22Z',
        '2025-11-03T15:52:22.000Z',
        '2025-11-03T15:52:22.000000Z',
        new Date().toISOString(),
        new Date().toISOString().replace(/\.\d{3}/, '').replace('+00:00', 'Z')
    ];
    
    for (const ts of timestampVariants) {
        const message = `${ts}${method.toUpperCase()}${requestPath}${body}`;
        const hmac = crypto.createHmac('sha256', API_SECRET);
        hmac.update(message);
        const signature = hmac.digest('base64');
        
        console.log(`\n时间戳: "${ts}"`);
        console.log(`   签名: ${signature.substring(0, 30)}...`);
    }
}

// 执行调试
debugSignature();

console.log('\n💡 建议检查:');
console.log('1. 时间戳格式是否正确（是否包含毫秒）');
console.log('2. HTTP方法是否应该大写');
console.log('3. 请求路径是否包含查询参数');
console.log('4. Body是否应该为空字符串');
console.log('5. 密钥是否正确（无多余空格）');