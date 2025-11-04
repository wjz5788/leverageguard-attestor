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
API_KEY = '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6'
API_SECRET = 'F9F45C90C94953FDACEBFE3697248B33'
PASSPHRASE = 'S20250901zhao$'

# ==========================
# 🕒 工具函数
# ==========================
def get_iso_timestamp():
    """获取ISO8601格式的UTC时间戳"""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def okx_sign(timestamp, method, request_path, body, secret_key):
    """OKX API v5 签名算法（Base64）"""
    message = f"{timestamp}{method.upper()}{request_path}{body or ''}"
    mac = hmac.new(secret_key.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()

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
    
    try:
        r = requests.request(method, url, headers=headers, data=body, timeout=10)
        try:
            return r.json()
        except Exception:
            return {"code": "error", "msg": r.text}
    except Exception as e:
        return {"code": "error", "msg": str(e)}

# ==========================
# 📄 查询订单详情
# ==========================
def get_order_details(order_id, inst_id):
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
def get_fills_details(order_id, inst_id):
    """查询单个订单的成交记录"""
    params = {"instType": "SWAP", "instId": inst_id, "ordId": order_id, "limit": 100}
    data = okx_request("GET", "/api/v5/trade/fills-history", params=params)
    
    if data.get("code") != "0":
        return [], data.get("msg", "Unknown error")
    
    return data.get("data", []), None

# ==========================
# 📈 分析订单数据
# ==========================
def analyze_order_data(order_details, fills):
    """分析订单数据并生成详细报告"""
    
    # 订单基本信息
    order_info = {
        "订单ID": order_details.get("ordId"),
        "交易对": order_details.get("instId"),
        "订单类型": order_details.get("ordType"),
        "状态": order_details.get("state"),
        "方向": order_details.get("side"),
        "持仓方向": order_details.get("posSide"),
        "杠杆": order_details.get("lever"),
        "订单数量": order_details.get("sz"),
        "成交数量": order_details.get("accFillSz"),
        "平均成交价格": order_details.get("avgPx"),
        "创建时间": datetime.fromtimestamp(int(order_details.get("cTime", 0)) / 1000).strftime("%Y-%m-%d %H:%M:%S") if order_details.get("cTime") else "N/A",
        "更新时间": datetime.fromtimestamp(int(order_details.get("uTime", 0)) / 1000).strftime("%Y-%m-%d %H:%M:%S") if order_details.get("uTime") else "N/A",
        "成交时间": datetime.fromtimestamp(int(order_details.get("fillTime", 0)) / 1000).strftime("%Y-%m-%d %H:%M:%S") if order_details.get("fillTime") else "N/A"
    }
    
    # 成交记录分析
    fills_analysis = []
    total_pnl = 0.0
    total_fee = 0.0
    total_volume = 0.0
    
    for fill in fills:
        ts = int(fill["ts"])
        time_str = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
        side = "买入" if fill["side"] == "buy" else "卖出"
        fill_sz = float(fill["fillSz"])
        fill_px = float(fill["fillPx"])
        pnl = float(fill.get("fillPnl", 0))
        fee = float(fill.get("fee", 0))
        value = fill_sz * fill_px
        
        total_pnl += pnl
        total_fee += fee
        total_volume += value
        
        fill_info = {
            "时间": time_str,
            "方向": side,
            "价格": fill_px,
            "数量": fill_sz,
            "价值": round(value, 2),
            "盈亏": pnl,
            "手续费": fee,
            "成交ID": fill.get("tradeId", "N/A")
        }
        fills_analysis.append(fill_info)
    
    # 风险评估
    risk_assessment = {
        "累计盈亏": round(total_pnl, 4),
        "总手续费": round(total_fee, 4),
        "总交易量": round(total_volume, 2),
        "盈亏率": round((total_pnl / total_volume) * 100, 4) if total_volume > 0 else 0,
        "是否有强平风险": total_pnl < -100,  # 假设100 USDT为风险阈值
        "成交效率": round(len(fills) / 1, 2) if len(fills) > 0 else 0  # 成交记录数/订单数
    }
    
    return order_info, fills_analysis, risk_assessment

# ==========================
# 📝 生成详细报告
# ==========================
def generate_detailed_report(order_id, inst_id):
    """生成订单的详细报告"""
    
    print("=" * 80)
    print("📊 OKX 订单详细分析报告")
    print("=" * 80)
    print(f"订单ID: {order_id}")
    print(f"交易对: {inst_id}")
    print(f"报告时间: {get_iso_timestamp()}")
    print("-" * 80)
    
    # 获取订单详情
    print("🔍 正在查询订单详情...")
    order_details, order_error = get_order_details(order_id, inst_id)
    
    if order_error:
        print(f"❌ 订单查询失败: {order_error}")
        return
    
    # 获取成交记录
    print("📊 正在查询成交记录...")
    fills, fills_error = get_fills_details(order_id, inst_id)
    
    if fills_error:
        print(f"⚠️ 成交记录查询失败: {fills_error}")
        fills = []
    
    # 分析数据
    print("📈 正在分析订单数据...")
    order_info, fills_analysis, risk_assessment = analyze_order_data(order_details, fills)
    
    # 打印订单基本信息
    print("\n📋 订单基本信息")
    print("-" * 40)
    for key, value in order_info.items():
        print(f"{key}: {value}")
    
    # 打印成交记录
    print(f"\n💱 成交记录 (共{len(fills_analysis)}条)")
    print("-" * 40)
    
    if fills_analysis:
        for i, fill in enumerate(fills_analysis, 1):
            print(f"\n第{i}笔成交:")
            for key, value in fill.items():
                print(f"  {key}: {value}")
    else:
        print("暂无成交记录")
    
    # 打印风险评估
    print("\n⚠️ 风险评估")
    print("-" * 40)
    for key, value in risk_assessment.items():
        if isinstance(value, bool):
            status = "是" if value else "否"
            print(f"{key}: {status}")
        else:
            print(f"{key}: {value}")
    
    # 总结
    print("\n📊 订单总结")
    print("-" * 40)
    print(f"订单状态: {order_info['状态']}")
    print(f"累计盈亏: {risk_assessment['累计盈亏']} USDT")
    print(f"总手续费: {risk_assessment['总手续费']} USDT")
    print(f"总交易量: {risk_assessment['总交易量']} USDT")
    
    if risk_assessment['是否有强平风险']:
        print("🚨 警告: 检测到潜在强平风险")
    else:
        print("✅ 订单风险可控")
    
    print("\n" + "=" * 80)
    print("📄 报告生成完成")
    print("=" * 80)
    
    # 保存详细数据到文件
    save_detailed_data(order_id, order_info, fills_analysis, risk_assessment)

def save_detailed_data(order_id, order_info, fills_analysis, risk_assessment):
    """保存详细数据到JSON文件"""
    report_data = {
        "report_time": get_iso_timestamp(),
        "order_id": order_id,
        "order_info": order_info,
        "fills_analysis": fills_analysis,
        "risk_assessment": risk_assessment
    }
    
    filename = f"order_{order_id}_detailed_report.json"
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        print(f"\n💾 详细报告已保存至: {filename}")
    except Exception as e:
        print(f"❌ 保存报告失败: {e}")

# ==========================
# 🚀 主函数
# ==========================
def main():
    order_id = "2938801601245126656"
    inst_id = "BTC-USDT-SWAP"
    
    print("开始生成订单详细分析报告...")
    generate_detailed_report(order_id, inst_id)

if __name__ == "__main__":
    main()