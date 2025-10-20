#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
简单的币安API测试脚本
用于调试API连接和签名问题
"""

import os
import time
import hmac
import hashlib
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# 加载环境变量
env_loaded = False
explicit_env = os.getenv("BINANCE_ENV_FILE")
env_candidates = []
if explicit_env:
    env_candidates.append(Path(explicit_env))
env_candidates.extend(
    [
        REPO_ROOT / "env" / "binance.env",
        REPO_ROOT / ".env",
    ]
)

for candidate in env_candidates:
    if candidate.exists():
        load_dotenv(candidate)
        env_loaded = True
        break

if not env_loaded:
    load_dotenv()

# 读取API凭证
api_key = os.getenv("BINANCE_API_KEY")
api_secret = os.getenv("BINANCE_SECRET_KEY")

if not api_key or not api_secret:
    raise SystemExit("缺少 BINANCE_API_KEY/BINANCE_SECRET_KEY，请先配置环境变量或 env/binance.env 文件。")

# 基本URL
base_url = "https://fapi.binance.com"

# 生成签名
def generate_signature(query_string, api_secret):
    signature = hmac.new(
        api_secret.encode('utf-8'),
        query_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature

# 测试公共API
def test_public_api():
    print("\n=== 测试公共API ===")
    
    # 测试ping
    url = f"{base_url}/fapi/v1/ping"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            print("✓ Ping API 成功")
        else:
            print(f"✗ Ping API 失败: {response.status_code}")
    except Exception as e:
        print(f"✗ Ping API 错误: {e}")

# 详细测试不同API调用方式
def test_api_endpoints():
    print("\n=== 详细测试API端点 ===")
    print(f"API Key长度: {len(api_key)}")
    print(f"API Secret长度: {len(api_secret)}")
    headers = {'X-MBX-APIKEY': api_key}
    
    # 测试1: 账户信息API (之前成功过)
    print("\n测试1: 账户信息API (fapi/v2/account)")
    endpoint = "/fapi/v2/account"
    timestamp = int(time.time() * 1000)
    params = {'timestamp': timestamp}
    query_string = f"timestamp={timestamp}"
    
    print(f"  参数: {params}")
    print(f"  查询字符串: {query_string}")
    print(f"  Secret前10字符: {api_secret[:10]}...")
    
    signature = generate_signature(query_string, api_secret)
    params['signature'] = signature
    url = f"{base_url}{endpoint}"
    
    try:
        response = requests.get(url, headers=headers, params=params)
        print(f"  状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
    except Exception as e:
        print(f"  错误: {e}")
    
    # 测试2: 持仓风险API
    print("\n测试2: 持仓风险API (fapi/v2/positionRisk)")
    endpoint = "/fapi/v2/positionRisk"
    timestamp = int(time.time() * 1000)
    params = {'timestamp': timestamp}
    query_string = f"timestamp={timestamp}"
    
    print(f"  参数: {params}")
    print(f"  查询字符串: {query_string}")
    
    signature = generate_signature(query_string, api_secret)
    params['signature'] = signature
    url = f"{base_url}{endpoint}"
    
    try:
        response = requests.get(url, headers=headers, params=params)
        print(f"  状态码: {response.status_code}")
        print(f"  响应: {response.text[:200]}")
    except Exception as e:
        print(f"  错误: {e}")
    
    # 测试3: 订单查询API (不指定orderId)
    print("\n测试3: 订单查询API (fapi/v1/order) - 仅symbol参数")
    endpoint = "/fapi/v1/order"
    timestamp = int(time.time() * 1000)
    params = {
        'symbol': 'BTCUSDT',
        'timestamp': timestamp
    }
    # 使用预构建的查询字符串，确保格式与账户API完全一致
    query_string = f"symbol=BTCUSDT&timestamp={timestamp}"
    
    print(f"  参数: {params}")
    print(f"  查询字符串: {query_string}")
    
    signature = generate_signature(query_string, api_secret)
    params['signature'] = signature
    url = f"{base_url}{endpoint}"
    
    try:
        response = requests.get(url, headers=headers, params=params)
        print(f"  状态码: {response.status_code}")
        print(f"  响应: {response.text[:500]}")
    except Exception as e:
        print(f"  错误: {e}")

# 模拟binance_liquidation_checker的请求方式
def simulate_liquidation_checker():
    print("\n=== 模拟币安验证器的请求方式 ===")
    headers = {'X-MBX-APIKEY': api_key}
    
    # 模拟_get_order方法
    print("\n模拟get_order方法:")
    endpoint = "/fapi/v1/order"
    order_id = "9663378153"
    symbol = "FETUSDT"
    timestamp = int(time.time() * 1000)
    
    # 3. 测试小写的orderid参数
    print("\n  测试3: 使用小写的orderid参数")
    endpoint = "/fapi/v1/order"
    order_id = "9663378153"
    symbol = "FETUSDT"
    timestamp = int(time.time() * 1000)
    
    params3 = {
        'symbol': symbol,
        'orderid': order_id,  # 注意这里是小写的orderid
        'timestamp': timestamp
    }
    query_string3 = f"orderid={order_id}&symbol={symbol}&timestamp={timestamp}"
    
    print(f"  参数: {params3}")
    print(f"  查询字符串: {query_string3}")
    
    signature3 = generate_signature(query_string3, api_secret)
    params3['signature'] = signature3
    url = f"{base_url}{endpoint}"
    
    try:
        response = requests.get(url, headers=headers, params=params3)
        print(f"  状态码: {response.status_code}")
        print(f"  响应: {response.text[:500]}")
    except Exception as e:
        print(f"  错误: {e}")
    
    # 4. 同时测试BTCUSDT交易对
    print("\n  测试4: BTCUSDT交易对 - 使用小写的orderid参数")
    params4 = {
        'symbol': 'BTCUSDT',
        'orderid': '123456789',  # 测试用的订单ID
        'timestamp': int(time.time() * 1000)
    }
    query_string4 = f"orderid={params4['orderid']}&symbol=BTCUSDT&timestamp={params4['timestamp']}"
    
    print(f"  参数: {params4}")
    print(f"  查询字符串: {query_string4}")
    
    signature4 = generate_signature(query_string4, api_secret)
    params4['signature'] = signature4
    
    try:
        response = requests.get(url, headers=headers, params=params4)
        print(f"  状态码: {response.status_code}")
        print(f"  响应: {response.text[:500]}")
    except Exception as e:
        print(f"  错误: {e}")

if __name__ == "__main__":
    print("=== API凭证信息 ===")
    print(f"API Key长度: {len(api_key)}")
    print(f"API Secret长度: {len(api_secret)}")
    
    test_public_api()
    test_api_endpoints()
    simulate_liquidation_checker()
    print("\n测试完成!")
