import requests
import hmac
import base64
import hashlib
import json
import pandas as pd
from datetime import datetime, timezone
import time
import threading
import os
import sys
from concurrent.futures import ThreadPoolExecutor

# ==========================
# 🔑 用户配置
# ==========================
BASE_URL = os.getenv("OKX_BASE_URL", "https://www.okx.com")
API_KEY = os.getenv("OKX_API_KEY")
API_SECRET = os.getenv("OKX_API_SECRET")
PASSPHRASE = os.getenv("OKX_API_PASSPHRASE")

# 批量验证配置
ORDERS_FILE = "orders.txt"  # 包含订单ID的文件
OUTPUT_FILE = "batch_verification_report.json"  # 输出报告文件
MIN_VALUE_USDT = 100  # 爆仓检测阈值
MAX_WORKERS = 5  # 并发工作线程数
REQUEST_DELAY = 0.5  # 每个请求之间的延迟(秒)

# 存储所有订单的验证结果
all_results = []
# 线程锁，避免并发写入时的冲突
results_lock = threading.Lock()
# 统计信息
stats = {
    "total_orders": 0,
    "verified_orders": 0,
    "success_orders": 0,
    "failed_orders": 0,
    "potential_liquidations": 0
}


# ==========================
# 🛡️ 环境检查
# ==========================
def require_credentials():
    """确保运行前已设置OKX API密钥"""
    missing = []
    if not API_KEY:
        missing.append("OKX_API_KEY")
    if not API_SECRET:
        missing.append("OKX_API_SECRET")
    if not PASSPHRASE:
        missing.append("OKX_API_PASSPHRASE")
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")


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
# 📝 验证单个订单
# ==========================
def verify_single_order(order_info):
    """验证单个订单并收集结果"""
    order_id = order_info["order_id"]
    inst_id = order_info["inst_id"]
    
    print(f"\n正在验证订单: {order_id} ({inst_id})")
    
    # 查询订单详情
    order_details, order_error = check_order(order_id, inst_id)
    if order_error:
        result = {
            "order_id": order_id,
            "inst_id": inst_id,
            "status": "failed",
            "error": f"订单查询失败: {order_error}",
            "timestamp": get_iso_timestamp()
        }
        
        with results_lock:
            all_results.append(result)
            stats["failed_orders"] += 1
            stats["verified_orders"] += 1
        
        print(f"❌ 订单 {order_id} 验证失败: {order_error}")
        return
    
    # 查询成交记录
    fills, fills_error = check_fills(order_id, inst_id)
    if fills_error:
        result = {
            "order_id": order_id,
            "inst_id": inst_id,
            "status": "partially_failed",
            "order_details": order_details,
            "error": f"成交查询失败: {fills_error}",
            "timestamp": get_iso_timestamp()
        }
        
        with results_lock:
            all_results.append(result)
            stats["failed_orders"] += 1
            stats["verified_orders"] += 1
        
        print(f"⚠️ 订单 {order_id} 部分验证失败: {fills_error}")
        return
    
    # 分析成交记录
    trade_data = []
    total_pnl = 0.0
    liquidations = []
    
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
        
        row = {
            "时间": time_str,
            "方向": side,
            "价格": fill_px,
            "数量": fill_sz,
            "价值": round(value, 2),
            "盈亏": pnl,
            "手续费": fee,
        }
        trade_data.append(row)
        
        if pnl < 0 and value >= MIN_VALUE_USDT:
            liquidations.append(row)
    
    # 构建验证结果
    result = {
        "order_id": order_id,
        "inst_id": inst_id,
        "status": "success",
        "order_details": order_details,
        "fills": fills,
        "trade_summary": {
            "total_fills": len(fills),
            "total_pnl": round(total_pnl, 4),
            "has_liquidations": len(liquidations) > 0,
            "liquidation_count": len(liquidations),
            "liquidations": liquidations
        },
        "timestamp": get_iso_timestamp()
    }
    
    # 更新统计信息
    with results_lock:
        all_results.append(result)
        stats["verified_orders"] += 1
        stats["success_orders"] += 1
        stats["potential_liquidations"] += len(liquidations)
    
    # 打印验证结果摘要
    print(f"✅ 订单 {order_id} 验证成功")
    print(f"   成交记录数: {len(fills)}")
    print(f"   累计盈亏: {round(total_pnl, 4)} USDT")
    if liquidations:
        print(f"   ⚠️ 潜在爆仓: {len(liquidations)} 条")
    else:
        print("   ✅ 无爆仓迹象")
    
    # 添加延迟，避免请求过于频繁
    time.sleep(REQUEST_DELAY)


# ==========================
# 📂 从文件读取订单
# ==========================
def read_orders_from_file(file_path):
    """从文件中读取订单信息"""
    orders = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                # 跳过空行和注释行
                if not line or line.startswith('#'):
                    continue
                
                # 支持两种格式：1. 订单ID,交易对 2. 仅订单ID(使用默认交易对)
                if ',' in line:
                    parts = line.split(',')
                    if len(parts) >= 2:
                        order_id = parts[0].strip()
                        inst_id = parts[1].strip()
                        orders.append({"order_id": order_id, "inst_id": inst_id})
                    else:
                        print(f"警告: 第{line_num}行格式不正确，已跳过: {line}")
                else:
                    # 默认使用BTC-USDT-SWAP
                    orders.append({"order_id": line, "inst_id": "BTC-USDT-SWAP"})
        
        print(f"成功读取 {len(orders)} 个订单信息")
        return orders
    except Exception as e:
        print(f"读取订单文件失败: {str(e)}")
        # 如果文件不存在，创建一个示例文件
        if not os.path.exists(file_path):
            create_example_orders_file(file_path)
        return []


def create_example_orders_file(file_path):
    """创建示例订单文件"""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("# OKX 订单批量验证文件\n")
            f.write("# 格式: 订单ID,交易对 或 仅订单ID(默认使用BTC-USDT-SWAP)\n")
            f.write("# 示例:\n")
            f.write("2938812509925187584,BTC-USDT-SWAP\n")
            f.write("2938812509925187585,ETH-USDT-SWAP\n")
            f.write("2938812509925187586 # 默认使用BTC-USDT-SWAP\n")
        print(f"已创建示例订单文件: {file_path}")
    except Exception as e:
        print(f"创建示例订单文件失败: {str(e)}")


# ==========================
# 💾 保存验证报告
# ==========================
def save_verification_report():
    """保存批量验证报告"""
    try:
        report = {
            "report_time": get_iso_timestamp(),
            "total_orders": stats["total_orders"],
            "verified_orders": stats["verified_orders"],
            "success_orders": stats["success_orders"],
            "failed_orders": stats["failed_orders"],
            "potential_liquidations": stats["potential_liquidations"],
            "orders": all_results
        }
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        print(f"\n批量验证报告已保存至: {OUTPUT_FILE}")
        
        # 同时生成CSV格式的摘要报告
        generate_csv_summary(report)
        
    except Exception as e:
        print(f"保存验证报告失败: {str(e)}")


def generate_csv_summary(report):
    """生成CSV格式的摘要报告"""
    csv_file = "batch_verification_summary.csv"
    try:
        summary_data = []
        for order in report["orders"]:
            row = {
                "order_id": order["order_id"],
                "inst_id": order["inst_id"],
                "status": order["status"],
                "has_liquidations": False,
                "liquidation_count": 0,
                "total_pnl": 0,
                "error": ""
            }
            
            if order["status"] == "success" and "trade_summary" in order:
                row["has_liquidations"] = order["trade_summary"]["has_liquidations"]
                row["liquidation_count"] = order["trade_summary"]["liquidation_count"]
                row["total_pnl"] = order["trade_summary"]["total_pnl"]
            elif "error" in order:
                row["error"] = order["error"]
            
            summary_data.append(row)
        
        df = pd.DataFrame(summary_data)
        df.to_csv(csv_file, index=False, encoding='utf-8-sig')
        print(f"CSV格式摘要报告已保存至: {csv_file}")
    except Exception as e:
        print(f"生成CSV摘要报告失败: {str(e)}")


# ==========================
# 🚀 主执行流程
# ==========================
def main():
    print("=== OKX 订单批量验证工具 ===")
    print(f"当前时间: {get_iso_timestamp()}")
    print(f"配置信息:")
    print(f"- 订单文件: {ORDERS_FILE}")
    print(f"- 输出报告: {OUTPUT_FILE}")
    print(f"- 并发线程: {MAX_WORKERS}")
    print(f"- 爆仓检测阈值: {MIN_VALUE_USDT} USDT")

    try:
        require_credentials()
    except RuntimeError as exc:
        print(f"❌ 缺少必需的环境变量: {exc}")
        print("请在运行前设置 OKX_API_KEY、OKX_API_SECRET、OKX_API_PASSPHRASE。")
        sys.exit(1)
    
    # 读取订单信息
    orders = read_orders_from_file(ORDERS_FILE)
    stats["total_orders"] = len(orders)
    
    if not orders:
        print("❌ 没有找到可验证的订单，程序退出")
        return
    
    # 使用线程池并发验证订单
    print(f"\n开始验证 {len(orders)} 个订单...")
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        executor.map(verify_single_order, orders)
    
    # 保存验证报告
    save_verification_report()
    
    # 打印验证统计
    elapsed_time = time.time() - start_time
    print("\n=== 批量验证统计 ===")
    print(f"总订单数: {stats['total_orders']}")
    print(f"已验证订单: {stats['verified_orders']}")
    print(f"成功验证: {stats['success_orders']}")
    print(f"验证失败: {stats['failed_orders']}")
    print(f"潜在爆仓订单数: {stats['potential_liquidations']}")
    print(f"总耗时: {round(elapsed_time, 2)} 秒")
    print(f"平均每个订单耗时: {round(elapsed_time / max(1, stats['verified_orders']), 2)} 秒")


if __name__ == "__main__":
    main()
