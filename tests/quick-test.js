#!/usr/bin/env node

/**
 * @file quick-test.js
 * @description 快速连通性测试 - 不依赖API密钥
 */

import axios from 'axios';

const OKX_BASE_URL = 'https://www.okx.com';

async function quickConnectivityTest() {
    console.log('🔗 快速连通性测试（不依赖API密钥）');
    console.log('='.repeat(50));
    
    try {
        // 测试公共API端点
        console.log('1. 测试OKX公共时间API...');
        const response = await axios.get(`${OKX_BASE_URL}/api/v5/public/time`, {
            timeout: 10000
        });
        
        if (response.data?.code === '0') {
            console.log('✅ OKX公共API连通性正常');
            console.log(`   服务器时间戳: ${response.data.data[0]?.ts}`);
            console.log(`   HTTP状态码: ${response.status}`);
            console.log(`   响应时间: ${response.duration}ms`);
        } else {
            console.log('⚠️  OKX API返回非标准响应:', response.data);
        }
        
        // 测试市场数据API
        console.log('\n2. 测试OKX市场数据API...');
        const tickerResponse = await axios.get(`${OKX_BASE_URL}/api/v5/market/ticker`, {
            params: { instId: 'BTC-USDT' },
            timeout: 10000
        });
        
        if (tickerResponse.data?.code === '0') {
            console.log('✅ OKX市场数据API连通性正常');
            const ticker = tickerResponse.data.data[0];
            console.log(`   交易对: ${ticker.instId}`);
            console.log(`   最新价格: ${ticker.last}`);
            console.log(`   24小时涨跌幅: ${ticker.dayPct}%`);
        }
        
        console.log('\n🎉 快速测试完成！');
        console.log('💡 如果以上测试通过，说明网络连接正常，可以继续配置API密钥进行完整测试。');
        
    } catch (error) {
        console.error('❌ 连通性测试失败:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 可能原因: 网络连接问题、防火墙限制或DNS解析失败');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('💡 可能原因: 网络延迟过高或OKX服务器响应慢');
        } else if (error.response) {
            console.log(`💡 HTTP状态码: ${error.response.status}`);
        }
        
        console.log('💡 建议检查:');
        console.log('   - 网络连接是否正常');
        console.log('   - 防火墙设置');
        console.log('   - 代理配置（如果有）');
        console.log('   - DNS解析（尝试ping www.okx.com）');
    }
}

// 运行测试
quickConnectivityTest();