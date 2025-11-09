#!/usr/bin/env node

/**
 * @file detailed-auth-test.js
 * @description 详细认证测试 - 模拟OKX API调用
 */

import axios from 'axios';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const OKX_BASE_URL = process.env.OKX_BASE_URL ?? 'https://www.okx.com';

async function testAuthStepByStep() {
    console.log('🔍 详细认证测试');
    console.log('='.repeat(50));
    
    const apiKey = process.env.OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const passphrase = process.env.OKX_PASSPHRASE;
    
    // 步骤1: 测试公共API（无需认证）
    console.log('\n1️⃣  测试公共API（无需认证）...');
    try {
        const publicResponse = await axios.get(`${OKX_BASE_URL}/api/v5/public/time`, {
            timeout: 10000
        });
        console.log('✅ 公共API测试成功');
        console.log(`   响应码: ${publicResponse.data?.code}`);
        console.log(`   服务器时间: ${publicResponse.data?.data?.[0]?.ts}`);
    } catch (error) {
        console.error('❌ 公共API测试失败:', error.message);
        return;
    }
    
    // 步骤2: 生成认证参数
    console.log('\n2️⃣  生成认证参数...');
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/trade/order';
    const queryString = 'instId=BTC-USDT-SWAP&clOrdId=2940071038556348417';
    
    const signature = crypto
        .createHmac('sha256', secretKey)
        .update(timestamp + method + requestPath + queryString)
        .digest('base64');
    
    console.log('✅ 认证参数生成成功');
    console.log(`   时间戳: ${timestamp}`);
    console.log(`   签名: ${signature.substring(0, 20)}...`);
    
    // 步骤3: 测试私有API
    console.log('\n3️⃣  测试私有API（需要认证）...');
    
    const headers = {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json'
    };
    
    console.log('📋 请求头信息:');
    console.log(`   OK-ACCESS-KEY: ${apiKey.substring(0, 8)}...`);
    console.log(`   OK-ACCESS-SIGN: ${signature.substring(0, 20)}...`);
    console.log(`   OK-ACCESS-TIMESTAMP: ${timestamp}`);
    console.log(`   OK-ACCESS-PASSPHRASE: ${passphrase}`);
    
    try {
        const response = await axios.get(`${OKX_BASE_URL}${requestPath}`, {
            params: {
                instId: 'BTC-USDT-SWAP',
                clOrdId: '2940071038556348417'
            },
            headers: headers,
            timeout: 30000
        });
        
        console.log('✅ 私有API测试成功');
        console.log(`   响应码: ${response.data?.code}`);
        console.log(`   响应消息: ${response.data?.msg}`);
        
        if (response.data?.data?.[0]) {
            const order = response.data.data[0];
            console.log('📊 订单信息:');
            console.log(`   订单ID: ${order.ordId}`);
            console.log(`   状态: ${order.state}`);
            console.log(`   方向: ${order.side}`);
            console.log(`   持仓方向: ${order.posSide}`);
        }
        
    } catch (error) {
        console.error('❌ 私有API测试失败');
        
        if (error.response) {
            console.log(`   HTTP状态码: ${error.response.status}`);
            console.log(`   错误响应:`, error.response.data);
            
            // 分析常见错误
            if (error.response.status === 401) {
                console.log('💡 401错误分析:');
                console.log('   - API密钥可能无效或已过期');
                console.log('   - 密钥权限不足（需要交易/读取权限）');
                console.log('   - IP地址不在白名单中');
                console.log('   - 时间戳偏差过大');
            }
        } else {
            console.log(`   错误信息: ${error.message}`);
        }
    }
    
    // 步骤4: 测试其他端点
    console.log('\n4️⃣  测试账户信息API...');
    
    const balancePath = '/api/v5/account/balance';
    const balanceSignature = crypto
        .createHmac('sha256', secretKey)
        .update(timestamp + 'GET' + balancePath)
        .digest('base64');
    
    try {
        const balanceResponse = await axios.get(`${OKX_BASE_URL}${balancePath}`, {
            headers: {
                'OK-ACCESS-KEY': apiKey,
                'OK-ACCESS-SIGN': balanceSignature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': passphrase
            },
            timeout: 10000
        });
        
        console.log('✅ 账户信息API测试成功');
        console.log(`   响应码: ${balanceResponse.data?.code}`);
        
    } catch (error) {
        console.error('❌ 账户信息API测试失败');
        if (error.response) {
            console.log(`   HTTP状态码: ${error.response.status}`);
            console.log(`   错误响应:`, error.response.data);
        }
    }
}

// 运行测试
async function main() {
    await testAuthStepByStep();
    
    console.log('\n💡 问题排查建议:');
    console.log('1. 登录OKX官网 → 账户 → API管理');
    console.log('2. 检查API密钥状态和权限');
    console.log('3. 确认IP白名单设置（如果启用）');
    console.log('4. 检查密钥是否已启用');
    console.log('5. 确认是实盘还是模拟盘环境');
}

main().catch(console.error);