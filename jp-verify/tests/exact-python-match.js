#!/usr/bin/env node

/**
 * @file exact-python-match.js
 * @description 完全匹配Python脚本实现的OKX API测试
 */

import axios from 'axios';
import crypto from 'node:crypto';

// ==========================
// 🔑 用户配置（与Python脚本完全一致）
// ==========================
const BASE_URL = "https://www.okx.com";
const API_KEY = '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6';
const API_SECRET = 'F9F45C90C94953FDACEBFE3697248B33';
const PASSPHRASE = 'S20250901zhao$';

// ==========================
// 🕒 工具函数（完全匹配Python实现）
// ==========================

/**
 * 获取ISO8601格式的UTC时间戳（完全匹配Python实现）
 */
function get_iso_timestamp() {
    const now = new Date();
    // 完全匹配Python的格式：包含毫秒，Z结尾
    const isoString = now.toISOString(); // 格式: "2025-11-03T15:54:42.482Z"
    return isoString;
}

/**
 * OKX API v5 签名算法（完全匹配Python实现）
 */
function okx_sign(timestamp, method, request_path, body, secret_key) {
    // 完全匹配Python实现
    const message = `${timestamp}${method.toUpperCase()}${request_path}${body || ''}`;
    
    console.log('🔐 签名生成详情（完全匹配Python）:');
    console.log(`   时间戳: "${timestamp}"`);
    console.log(`   方法: "${method.toUpperCase()}"`);
    console.log(`   路径: "${request_path}"`);
    console.log(`   Body: "${body || ''}"`);
    console.log(`   完整消息: "${message}"`);
    
    // 使用hmac-sha256，然后base64编码（与Python完全一致）
    const hmac = crypto.createHmac('sha256', secret_key);
    hmac.update(message);
    const signature = hmac.digest('base64');
    
    console.log(`   生成签名: ${signature}`);
    console.log(`   签名长度: ${signature.length}`);
    
    return signature;
}

/**
 * 统一封装 OKX 请求（完全匹配Python实现）
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
        // 使用axios发送请求（与Python的requests库对应）
        const response = await axios({
            method: method.toLowerCase(),
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
// 📄 查询订单详情（完全匹配Python实现）
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
// 📊 查询成交记录（完全匹配Python实现）
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
    console.log("=== 完全匹配Python脚本的OKX API测试 ===");
    console.log("目标：实现与Python脚本完全一致的签名逻辑");
    console.log("=".repeat(60));
    
    const test_order_id = "2940071038556348417";
    const test_inst_id = "BTC-USDT-SWAP";
    
    console.log(`📋 测试配置:`);
    console.log(`   订单ID: ${test_order_id}`);
    console.log(`   交易对: ${test_inst_id}`);
    console.log(`   API密钥: ${API_KEY.substring(0, 8)}...`);
    
    // 测试1: 查询订单详情
    console.log("\n🔍 测试1: 查询订单详情");
    console.log("-".repeat(40));
    
    const [order_details, order_error] = await check_order(test_order_id, test_inst_id);
    
    if (order_error) {
        console.log(`❌ 订单查询失败: ${order_error}`);
        
        // 详细分析签名错误
        if (order_error.includes('50113') || order_error.includes('Invalid Sign')) {
            console.log('🔍 签名错误详细分析:');
            console.log('   1. 时间戳格式: 包含毫秒的ISO8601格式');
            console.log('   2. HTTP方法: 大写GET');
            console.log('   3. 消息格式: timestamp + method + path + body');
            console.log('   4. 编码方式: HMAC-SHA256 + Base64');
            console.log('   5. 请检查API密钥权限和IP白名单');
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
    console.log("-".repeat(40));
    
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
    console.log("-".repeat(40));
    
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