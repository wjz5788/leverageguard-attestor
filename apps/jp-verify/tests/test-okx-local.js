#!/usr/bin/env node

/**
 * @file test-okx-local.js
 * @description 本地OKX订单验证测试程序
 * 用于测试本地环境是否可以正常连接OKX API并验证订单
 */

import axios from 'axios';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const OKX_BASE_URL = process.env.OKX_BASE_URL ?? 'https://www.okx.com';

// 测试配置
const TEST_CONFIG = {
    // 测试订单信息（使用真实订单数据）
    testOrders: [
        {
            instId: process.env.TEST_INST_ID || 'BTC-USDT-SWAP',
            clOrdId: process.env.TEST_ORDER_ID || '2940071038556348417',
            description: '真实BTC永续合约订单验证'
        }
    ],
    timeout: 60000, // 60秒超时（为真实订单增加超时时间）
    retryCount: 3
};

/**
 * 检查API密钥配置
 */
function checkApiCredentials() {
    const required = ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ 缺少必要的API密钥配置:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.log('\n请检查 .env 文件是否包含以下配置:');
        console.log('OKX_API_KEY=your_api_key_here');
        console.log('OKX_SECRET_KEY=your_secret_key_here');
        console.log('OKX_PASSPHRASE=your_passphrase_here');
        return false;
    }
    
    console.log('✅ API密钥配置检查通过');
    return true;
}

/**
 * 测试OKX API连通性
 */
async function testOkxConnectivity() {
    console.log('\n🔗 测试OKX API连通性...');
    
    try {
        const response = await axios.get(`${OKX_BASE_URL}/api/v5/public/time`, {
            timeout: 10000
        });
        
        if (response.data?.code === '0') {
            console.log('✅ OKX API连通性测试通过');
            console.log(`   服务器时间: ${response.data.data[0]?.ts}`);
            return true;
        } else {
            console.error('❌ OKX API返回错误:', response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ OKX API连通性测试失败:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('   可能原因: 网络连接问题或防火墙限制');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('   可能原因: 网络延迟过高或服务器响应慢');
        }
        return false;
    }
}

/**
 * 生成OKX API签名
 */
function generateOkxSignature(timestamp, method, requestPath, queryString = '') {
    const secretKey = process.env.OKX_SECRET_KEY;
    const message = timestamp + method + requestPath + queryString;
    return crypto
        .createHmac('sha256', secretKey)
        .update(message)
        .digest('base64');
}

/**
 * 验证单个订单
 */
async function verifySingleOrder(instId, clOrdId, attempt = 1) {
    console.log(`\n📋 验证订单: ${instId} - ${clOrdId}`);
    
    try {
        const timestamp = new Date().toISOString();
        const method = 'GET';
        const requestPath = '/api/v5/trade/order';
        const queryString = `instId=${instId}&clOrdId=${clOrdId}`;
        
        const signature = generateOkxSignature(timestamp, method, requestPath, queryString);
        
        const response = await axios.get(`${OKX_BASE_URL}${requestPath}`, {
            params: { instId, clOrdId },
            headers: {
                'OK-ACCESS-KEY': process.env.OKX_API_KEY,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
            },
            timeout: TEST_CONFIG.timeout
        });
        
        const orderData = response.data;
        
        if (orderData.code === '0') {
            const order = orderData.data?.[0];
            if (order) {
                console.log('✅ 订单验证成功');
                console.log(`   订单状态: ${order.state}`);
                console.log(`   订单方向: ${order.side}`);
                console.log(`   持仓方向: ${order.posSide}`);
                console.log(`   杠杆倍数: ${order.lever}`);
                console.log(`   成交数量: ${order.accFillSz}`);
                console.log(`   平均价格: ${order.avgPx}`);
                
                // 检查是否为强平订单
                const isLiquidation = order.state === 'filled' && 
                                   (order.category === 'full_liquidation' || 
                                    order.fillPx === order.liqPx);
                
                return {
                    success: true,
                    isLiquidation,
                    orderDetails: order,
                    rawResponse: orderData
                };
            } else {
                console.log('⚠️  订单不存在或已被删除');
                return {
                    success: false,
                    error: '订单不存在',
                    rawResponse: orderData
                };
            }
        } else {
            console.error(`❌ OKX API返回错误: ${orderData.msg} (代码: ${orderData.code})`);
            return {
                success: false,
                error: orderData.msg,
                code: orderData.code,
                rawResponse: orderData
            };
        }
        
    } catch (error) {
        console.error(`❌ 第${attempt}次验证失败:`, error.message);
        
        if (attempt < TEST_CONFIG.retryCount) {
            console.log(`   等待2秒后重试... (${attempt}/${TEST_CONFIG.retryCount})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return verifySingleOrder(instId, clOrdId, attempt + 1);
        }
        
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

/**
 * 运行完整测试套件
 */
async function runCompleteTest() {
    console.log('🚀 开始本地OKX订单验证测试');
    console.log('='.repeat(50));
    
    // 1. 检查API配置
    if (!checkApiCredentials()) {
        return false;
    }
    
    // 2. 测试连通性
    if (!await testOkxConnectivity()) {
        return false;
    }
    
    // 3. 验证测试订单
    console.log('\n📊 开始订单验证测试...');
    
    const results = [];
    for (const testOrder of TEST_CONFIG.testOrders) {
        const result = await verifySingleOrder(testOrder.instId, testOrder.clOrdId);
        results.push({
            ...testOrder,
            ...result
        });
    }
    
    // 4. 生成测试报告
    console.log('\n📈 测试报告');
    console.log('='.repeat(50));
    
    const successfulTests = results.filter(r => r.success);
    const failedTests = results.filter(r => !r.success);
    
    console.log(`✅ 成功测试: ${successfulTests.length}/${results.length}`);
    console.log(`❌ 失败测试: ${failedTests.length}/${results.length}`);
    
    if (failedTests.length > 0) {
        console.log('\n详细错误信息:');
        failedTests.forEach((test, index) => {
            console.log(`${index + 1}. ${test.instId} - ${test.clOrdId}: ${test.error}`);
        });
    }
    
    // 5. 提供诊断建议
    console.log('\n💡 诊断建议:');
    if (successfulTests.length === results.length) {
        console.log('✅ 所有测试通过！本地环境可以正常验证OKX订单。');
    } else if (successfulTests.length > 0) {
        console.log('⚠️  部分测试通过，请检查API密钥权限和网络连接。');
    } else {
        console.log('❌ 所有测试失败，请检查以下问题:');
        console.log('   - API密钥是否正确配置');
        console.log('   - 网络连接是否正常');
        console.log('   - OKX API服务是否可用');
        console.log('   - 防火墙或代理设置');
    }
    
    return successfulTests.length > 0;
}

/**
 * 主函数
 */
async function main() {
    try {
        const success = await runCompleteTest();
        
        if (success) {
            console.log('\n🎉 测试完成！本地环境可以验证OKX订单。');
        } else {
            console.log('\n💥 测试失败！请检查配置和网络连接。');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('💥 测试程序异常:', error);
        process.exit(1);
    }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    checkApiCredentials,
    testOkxConnectivity,
    verifySingleOrder,
    runCompleteTest
};