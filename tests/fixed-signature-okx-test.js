#!/usr/bin/env node

/**
 * @file fixed-signature-okx-test.js
 * @description 修复签名问题的OKX API测试 - 确保HTTP方法大写
 */

import axios from 'axios';
import crypto from 'node:crypto';

// ==========================
// 🔑 用户配置
// ==========================
const BASE_URL = "https://www.okx.com";
const API_KEY = '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6';
const API_SECRET = 'F9F45C90C94953FDACEBFE3697248B33';
const PASSPHRASE = 'S20250901zhao$';

// ==========================
// 🕒 工具函数（修复版）
// ==========================

/**
 * 获取ISO8601格式的UTC时间戳（包含毫秒）
 */
function get_iso_timestamp() {
    const now = new Date();
    return now.toISOString(); // 包含毫秒的完整格式
}

/**
 * OKX API v5 签名算法（修复HTTP方法大写问题）
 */
function okx_sign(timestamp, method, request_path, body, secret_key) {
    // 关键修复：HTTP方法必须大写
    const uppercaseMethod = method.toUpperCase();
    const message = `${timestamp}${uppercaseMethod}${request_path}${body || ''}`;
    
    console.log('🔐 签名生成详情（修复版）:');
    console.log(`   时间戳: ${timestamp}`);
    console.log(`   方法: ${uppercaseMethod} (已大写)`);
    console.log(`   路径: ${request_path}`);
    console.log(`   Body: "${body || ''}"`);
    console.log(`   完整消息: "${message}"`);
    
    const hmac = crypto.createHmac('sha256', secret_key);
    hmac.update(message);
    const signature = hmac.digest('base64');
    
    console.log(`   生成签名: ${signature.substring(0, 30)}...`);
    
    return signature;
}

/**
 * 统一封装 OKX 请求（修复版）
 */
async function okx_request(method, request_path, params = null, body = null) {
    const timestamp = get_iso_timestamp();
    let query = "";
    
    if (params) {
        query = "?" + Object.entries(params)
            .map(([k, v]) => `${k}=${v}`)
            .join("&");
    }
    
    const full_path = request_path + query;
    const sign = okx_sign(timestamp, method, full_path, body || "", API_SECRET);

    const headers = {
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
        "Content-Type": "application/json",
    };

    const url = BASE_URL + full_path;
    
    console.log(`🌐 发送请求: ${method.toUpperCase()} ${url}`);
    
    try {
        const response = await axios({
            method: method.toLowerCase(), // axios需要小写方法
            url: url,
            headers: headers,
            data: body,
            timeout: 10000
        });
        
        console.log(`✅ 请求成功，响应码: ${response.data?.code || 'N/A'}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            const errorData = error.response.data;
            const errorMsg = typeof errorData === 'object' ? JSON.stringify(errorData) : errorData;
            
            console.log(`❌ 请求失败，HTTP状态码: ${error.response.status}`);
            console.log(`   错误响应: ${errorMsg}`);
            
            return {
                code: "error",
                msg: errorMsg,
                status: error.response.status
            };
        } else {
            console.log(`❌ 请求失败: ${error.message}`);
            return {
                code: "error", 
                msg: error.message
            };
        }
    }
}

// ==========================
// 📄 查询订单详情
// ==========================

async function check_order(order_id, inst_id) {
    const params = {"instId": inst_id, "ordId": order_id};
    const data = await okx_request("GET", "/api/v5/trade/order", params);
    
    if (data.code !== "0") {
        return [null, data.msg || "Unknown error"];
    }
    
    if (!data.data || data.data.length === 0) {
        return [null, "No data found"];
    }
    
    return [data.data[0], null];
}

// ==========================
// 📊 查询成交记录
// ==========================

async function check_fills(order_id, inst_id) {
    const params = {
        "instType": "SWAP", 
        "instId": inst_id, 
        "ordId": order_id, 
        "limit": 100
    };
    
    const data = await okx_request("GET", "/api/v5/trade/fills-history", params);
    
    if (data.code !== "0") {
        return [[], data.msg || "Unknown error"];
    }
    
    return [data.data || [], null];
}

// ==========================
// 🚀 主测试函数
// ==========================

async function main() {
    console.log("=== 修复签名问题的OKX API测试 ===");
    console.log("关键修复: HTTP方法必须大写（GET而不是get）");
    console.log("=".repeat(50));
    
    const test_order_id = "2940071038556348417";
    const test_inst_id = "BTC-USDT-SWAP";
    
    console.log(`📋 测试配置:`);
    console.log(`   订单ID: ${test_order_id}`);
    console.log(`   交易对: ${test_inst_id}`);
    console.log(`   API密钥: ${API_KEY.substring(0, 8)}...`);
    
    // 测试1: 查询订单详情
    console.log("\n🔍 测试1: 查询订单详情");
    console.log("-".repeat(30));
    
    const [order_details, order_error] = await check_order(test_order_id, test_inst_id);
    
    if (order_error) {
        console.log(`❌ 订单查询失败: ${order_error}`);
        
        // 如果是签名错误，提供具体建议
        if (order_error.includes('50113') || order_error.includes('Invalid Sign')) {
            console.log('💡 签名错误排查建议:');
            console.log('   1. 检查时间戳格式（是否包含毫秒）');
            console.log('   2. 检查HTTP方法是否大写（GET而不是get）');
            console.log('   3. 检查API密钥和密钥是否正确');
            console.log('   4. 检查请求路径是否包含查询参数');
        }
    } else {
        console.log(`✅ 订单查询成功`);
        console.log(`   订单ID: ${order_details.ordId}`);
        console.log(`   状态: ${order_details.state}`);
        console.log(`   方向: ${order_details.side}`);
        console.log(`   持仓方向: ${order_details.posSide}`);
        console.log(`   杠杆: ${order_details.lever}`);
        
        // 检查强平标识
        if (order_details.category === 'full_liquidation' || order_details.fillPx === order_details.liqPx) {
            console.log('🚨 检测到强平订单！');
        }
    }
    
    // 测试2: 查询成交记录
    console.log("\n📊 测试2: 查询成交记录");
    console.log("-".repeat(30));
    
    const [fills, fills_error] = await check_fills(test_order_id, test_inst_id);
    
    if (fills_error) {
        console.log(`❌ 成交记录查询失败: ${fills_error}`);
    } else {
        console.log(`✅ 成交记录查询成功`);
        console.log(`   成交记录数: ${fills.length}`);
        
        if (fills.length > 0) {
            let total_pnl = 0;
            let liquidations = [];
            
            for (const fill of fills) {
                const pnl = parseFloat(fill.fillPnl || 0);
                const value = parseFloat(fill.fillSz) * parseFloat(fill.fillPx);
                total_pnl += pnl;
                
                if (pnl < 0 && value >= 100) { // 爆仓检测阈值100 USDT
                    liquidations.push(fill);
                }
            }
            
            console.log(`   累计盈亏: ${total_pnl.toFixed(4)} USDT`);
            console.log(`   潜在爆仓记录: ${liquidations.length} 条`);
        }
    }
    
    // 测试3: 测试公共API连通性
    console.log("\n🌐 测试3: 公共API连通性");
    console.log("-".repeat(30));
    
    try {
        const publicResponse = await axios.get(`${BASE_URL}/api/v5/public/time`, { timeout: 5000 });
        console.log(`✅ 公共API连通性正常`);
        console.log(`   服务器时间: ${publicResponse.data.data[0].ts}`);
    } catch (error) {
        console.log(`❌ 公共API连通性测试失败: ${error.message}`);
    }
    
    console.log("\n=== 测试完成 ===");
}

// 执行测试
main().catch(error => {
    console.error("❌ 测试执行失败:", error.message);
    process.exit(1);
});