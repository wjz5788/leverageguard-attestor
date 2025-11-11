#!/usr/bin/env python3

import requests
import hmac
import base64
import hashlib
import json
from datetime import datetime, timezone

# ==========================
# 🔑 用户配置
# ==========================
BASE_URL = "https://www.okx.com"
API_KEY = '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6'  # 用户提供的API密钥
API_SECRET = 'F9F45C90C94953FDACEBFE3697248B33'  # 用户提供的API密钥
PASSPHRASE = 'S20250901zhao$'  # 用户提供的密码

# ==========================
# 🕒 工具函数
# ==========================
def get_iso_timestamp():
    """获取ISO8601格式的UTC时间戳"""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def okx_sign(timestamp, method, request_path, body, secret_key):
    """OKX API v5 签名算法（Base64）"""
    message = f"{timestamp}{method.upper()}{request_path}{body or ''}"
    print(f"🔐 签名生成详情:")
    print(f"   时间戳: {timestamp}")
    print(f"   方法: {method.upper()}")
    print(f"   路径: {request_path}")
    print(f"   Body: '{body or ''}'")
    print(f"   完整消息: '{message}'")
    
    mac = hmac.new(secret_key.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    signature = base64.b64encode(mac.digest()).decode()
    
    print(f"   生成签名: {signature}")
    print(f"   签名长度: {len(signature)}")
    
    return signature

def okx_request(method, request_path, params=None, body=None):
    """统一封装 OKX 请求"""
    timestamp = get_iso_timestamp()
    query = ""
    if params:
        query = "?" + "&".join([f"{k}={v}" for k, v in params.items()])
    full_path = request_path + query
    sign = okx_sign(timestamp, method, full_path, body or "", API_SECRET)

    headers = {
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
        "Content-Type": "application/json",
    }

    url = BASE_URL + full_path
    
    print(f"🌐 发送请求: {method.upper()} {url}")
    
    try:
        r = requests.request(method, url, headers=headers, data=body, timeout=10)
        print(f"✅ 请求成功，HTTP状态码: {r.status_code}")
        
        try:
            response_data = r.json()
            print(f"   响应码: {response_data.get('code', 'N/A')}")
            return response_data
        except Exception as e:
            print(f"❌ JSON解析失败: {e}")
            return {"code": "error", "msg": r.text}
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return {"code": "error", "msg": str(e)}

# ==========================
# 📄 查询订单详情
# ==========================
def check_order(order_id, inst_id):
    """查询单个订单的详情"""
    params = {"instId": inst_id, "ordId": order_id}
    data = okx_request("GET", "/api/v5/trade/order", params=params)
    
    if data.get("code") != "0":
        return None, data.get("msg", "Unknown error")
    
    if not data.get("data") or len(data["data"]) == 0:
        return None, "No data found"
    
    return data["data"][0], None

# ==========================
# 📊 查询成交记录
# ==========================
def check_fills(order_id, inst_id):
    """查询单个订单的成交记录"""
    params = {"instType": "SWAP", "instId": inst_id, "ordId": order_id, "limit": 100}
    data = okx_request("GET", "/api/v5/trade/fills-history", params=params)
    
    if data.get("code") != "0":
        return [], data.get("msg", "Unknown error")
    
    return data.get("data", []), None

# ==========================
# 🚀 主测试函数
# ==========================
def main():
    print("=== Python OKX API 测试 ===")
    print("=" * 50)
    
    test_order_id = "2938801601245126656"
    test_inst_id = "BTC-USDT-SWAP"
    
    print(f"📋 测试配置:")
    print(f"   订单ID: {test_order_id}")
    print(f"   交易对: {test_inst_id}")
    print(f"   API密钥: {API_KEY[:8]}...")
    
    # 测试1: 查询订单详情
    print("\n🔍 测试1: 查询订单详情")
    print("-" * 30)
    
    order_details, order_error = check_order(test_order_id, test_inst_id)
    
    if order_error:
        print(f"❌ 订单查询失败: {order_error}")
    else:
        print(f"✅ 订单查询成功")
        print(f"   订单ID: {order_details.get('ordId')}")
        print(f"   状态: {order_details.get('state')}")
        print(f"   方向: {order_details.get('side')}")
        print(f"   持仓方向: {order_details.get('posSide')}")
        print(f"   杠杆: {order_details.get('lever')}")
        
        # 检查强平标识
        if order_details.get('category') == 'full_liquidation' or order_details.get('fillPx') == order_details.get('liqPx'):
            print('🚨 检测到强平订单！')
    
    # 测试2: 查询成交记录
    print("\n📊 测试2: 查询成交记录")
    print("-" * 30)
    
    fills, fills_error = check_fills(test_order_id, test_inst_id)
    
    if fills_error:
        print(f"❌ 成交记录查询失败: {fills_error}")
    else:
        print(f"✅ 成交记录查询成功")
        print(f"   成交记录数: {len(fills)}")
        
        if fills:
            total_pnl = 0.0
            liquidations = []
            
            for fill in fills:
                pnl = float(fill.get("fillPnl", 0))
                fill_sz = float(fill.get("fillSz", 0))
                fill_px = float(fill.get("fillPx", 0))
                value = fill_sz * fill_px
                total_pnl += pnl
                
                if pnl < 0 and value >= 100:  # 爆仓检测阈值100 USDT
                    liquidations.append(fill)
            
            print(f"   累计盈亏: {total_pnl:.4f} USDT")
            print(f"   潜在爆仓记录: {len(liquidations)} 条")
    
    # 测试3: 测试公共API连通性
    print("\n🌐 测试3: 公共API连通性")
    print("-" * 30)
    
    try:
        response = requests.get(f"{BASE_URL}/api/v5/public/time", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 公共API连通性正常")
            print(f"   服务器时间: {data.get('data', [{}])[0].get('ts', 'N/A')}")
        else:
            print(f"❌ 公共API连通性测试失败: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ 公共API连通性测试失败: {e}")
    
    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    main()