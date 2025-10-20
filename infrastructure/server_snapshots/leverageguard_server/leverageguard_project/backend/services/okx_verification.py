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
from concurrent.futures import ThreadPoolExecutor
import logging

# 配置日志
logger = logging.getLogger(__name__)

class OKXVerificationService:
    def __init__(self, api_key=None, api_secret=None, passphrase=None, base_url="https://www.okx.com"):
        self.base_url = base_url
        self.api_key = api_key
        self.api_secret = api_secret
        self.passphrase = passphrase
        
        # 批量验证配置
        self.min_value_usdt = 100  # 爆仓检测阈值
        self.max_workers = 5  # 并发工作线程数
        self.request_delay = 0.5  # 每个请求之间的延迟(秒)
        
        # 存储所有订单的验证结果
        self.all_results = []
        # 线程锁，避免并发写入时的冲突
        self.results_lock = threading.Lock()
        # 统计信息
        self.stats = {
            "total_orders": 0,
            "verified_orders": 0,
            "success_orders": 0,
            "failed_orders": 0,
            "potential_liquidations": 0
        }
        
    def get_iso_timestamp(self):
        """获取ISO8601格式的UTC时间戳"""
        return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    
    def okx_sign(self, timestamp, method, request_path, body):
        """OKX API v5 签名算法（Base64）"""
        message = f"{timestamp}{method.upper()}{request_path}{body or ''}"
        mac = hmac.new(self.api_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
        return base64.b64encode(mac.digest()).decode()
    
    def okx_request(self, method, request_path, params=None, body=None):
        """统一封装 OKX 请求"""
        timestamp = self.get_iso_timestamp()
        query = ""
        if params:
            query = "?" + "&".join([f"{k}={v}" for k, v in params.items()])
        full_path = request_path + query
        sign = self.okx_sign(timestamp, method, full_path, body or "")

        headers = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": sign,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
        }

        url = self.base_url + full_path
        try:
            r = requests.request(method, url, headers=headers, data=body, timeout=10)
            try:
                return r.json()
            except Exception:
                return {"code": "error", "msg": r.text}
        except Exception as e:
            logger.error(f"OKX API请求失败: {str(e)}")
            return {"code": "error", "msg": str(e)}
    
    def check_order(self, order_id, inst_id):
        """查询单个订单的详情"""
        params = {"instId": inst_id, "ordId": order_id}
        data = self.okx_request("GET", "/api/v5/trade/order", params=params)
        if data.get("code") != "0":
            return None, data.get("msg", "Unknown error")
        
        if not data.get("data") or len(data["data"]) == 0:
            return None, "No data found"
        
        return data["data"][0], None
    
    def check_fills(self, order_id, inst_id):
        """查询单个订单的成交记录"""
        params = {"instType": "SWAP", "instId": inst_id, "ordId": order_id, "limit": 100}
        data = self.okx_request("GET", "/api/v5/trade/fills-history", params=params)
        if data.get("code") != "0":
            return [], data.get("msg", "Unknown error")
        
        return data.get("data", []), None
    
    def verify_single_order(self, order_info):
        """验证单个订单并收集结果"""
        order_id = order_info["order_id"]
        inst_id = order_info["inst_id"]
        
        logger.info(f"正在验证订单: {order_id} ({inst_id})")
        
        # 查询订单详情
        order_details, order_error = self.check_order(order_id, inst_id)
        if order_error:
            result = {
                "order_id": order_id,
                "inst_id": inst_id,
                "status": "failed",
                "error": f"订单查询失败: {order_error}",
                "timestamp": self.get_iso_timestamp()
            }
            
            with self.results_lock:
                self.all_results.append(result)
                self.stats["failed_orders"] += 1
                self.stats["verified_orders"] += 1
            
            logger.error(f"订单 {order_id} 验证失败: {order_error}")
            return result
        
        # 查询成交记录
        fills, fills_error = self.check_fills(order_id, inst_id)
        if fills_error:
            result = {
                "order_id": order_id,
                "inst_id": inst_id,
                "status": "partially_failed",
                "order_details": order_details,
                "error": f"成交查询失败: {fills_error}",
                "timestamp": self.get_iso_timestamp()
            }
            
            with self.results_lock:
                self.all_results.append(result)
                self.stats["failed_orders"] += 1
                self.stats["verified_orders"] += 1
            
            logger.warning(f"订单 {order_id} 部分验证失败: {fills_error}")
            return result
        
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
            
            if pnl < 0 and value >= self.min_value_usdt:
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
            "timestamp": self.get_iso_timestamp()
        }
        
        # 更新统计信息
        with self.results_lock:
            self.all_results.append(result)
            self.stats["verified_orders"] += 1
            self.stats["success_orders"] += 1
            self.stats["potential_liquidations"] += len(liquidations)
        
        # 记录验证结果摘要
        logger.info(f"订单 {order_id} 验证成功")
        logger.info(f"   成交记录数: {len(fills)}")
        logger.info(f"   累计盈亏: {round(total_pnl, 4)} USDT")
        if liquidations:
            logger.warning(f"   ⚠️ 潜在爆仓: {len(liquidations)} 条")
        else:
            logger.info("   ✅ 无爆仓迹象")
        
        # 添加延迟，避免请求过于频繁
        time.sleep(self.request_delay)
        
        return result
    
    def read_orders_from_file(self, file_path):
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
                            logger.warning(f"第{line_num}行格式不正确，已跳过: {line}")
                    else:
                        # 默认使用BTC-USDT-SWAP
                        orders.append({"order_id": line, "inst_id": "BTC-USDT-SWAP"})
            
            logger.info(f"成功读取 {len(orders)} 个订单信息")
            return orders
        except Exception as e:
            logger.error(f"读取订单文件失败: {str(e)}")
            # 如果文件不存在，创建一个示例文件
            if not os.path.exists(file_path):
                self.create_example_orders_file(file_path)
            return []
    
    def create_example_orders_file(self, file_path):
        """创建示例订单文件"""
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write("# OKX 订单批量验证文件\n")
                f.write("# 格式: 订单ID,交易对 或 仅订单ID(默认使用BTC-USDT-SWAP)\n")
                f.write("# 示例:\n")
                f.write("2938812509925187584,BTC-USDT-SWAP\n")
                f.write("2938812509925187585,ETH-USDT-SWAP\n")
                f.write("2938812509925187586 # 默认使用BTC-USDT-SWAP\n")
            logger.info(f"已创建示例订单文件: {file_path}")
        except Exception as e:
            logger.error(f"创建示例订单文件失败: {str(e)}")
    
    def save_verification_report(self, output_file="batch_verification_report.json"):
        """保存批量验证报告"""
        try:
            report = {
                "report_time": self.get_iso_timestamp(),
                "total_orders": self.stats["total_orders"],
                "verified_orders": self.stats["verified_orders"],
                "success_orders": self.stats["success_orders"],
                "failed_orders": self.stats["failed_orders"],
                "potential_liquidations": self.stats["potential_liquidations"],
                "orders": self.all_results
            }
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            
            logger.info(f"批量验证报告已保存至: {output_file}")
            
            # 同时生成CSV格式的摘要报告
            csv_file = output_file.replace(".json", "_summary.csv")
            self.generate_csv_summary(report, csv_file)
            
            return report
        except Exception as e:
            logger.error(f"保存验证报告失败: {str(e)}")
            return None
    
    def generate_csv_summary(self, report, csv_file):
        """生成CSV格式的摘要报告"""
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
            logger.info(f"CSV格式摘要报告已保存至: {csv_file}")
        except Exception as e:
            logger.error(f"生成CSV摘要报告失败: {str(e)}")
    
    def batch_verify_orders(self, orders_file="orders.txt", output_file="batch_verification_report.json"):
        """批量验证订单"""
        logger.info("=== OKX 订单批量验证工具 ===")
        logger.info(f"当前时间: {self.get_iso_timestamp()}")
        logger.info(f"配置信息:")
        logger.info(f"- 订单文件: {orders_file}")
        logger.info(f"- 输出报告: {output_file}")
        logger.info(f"- 并发线程: {self.max_workers}")
        logger.info(f"- 爆仓检测阈值: {self.min_value_usdt} USDT")
        
        # 读取订单信息
        orders = self.read_orders_from_file(orders_file)
        self.stats["total_orders"] = len(orders)
        
        if not orders:
            logger.error("❌ 没有找到可验证的订单")
            return None
        
        # 使用线程池并发验证订单
        logger.info(f"\n开始验证 {len(orders)} 个订单...")
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            executor.map(self.verify_single_order, orders)
        
        # 保存验证报告
        report = self.save_verification_report(output_file)
        
        # 打印验证统计
        elapsed_time = time.time() - start_time
        logger.info("\n=== 批量验证统计 ===")
        logger.info(f"总订单数: {self.stats['total_orders']}")
        logger.info(f"已验证订单: {self.stats['verified_orders']}")
        logger.info(f"成功验证: {self.stats['success_orders']}")
        logger.info(f"验证失败: {self.stats['failed_orders']}")
        logger.info(f"潜在爆仓订单数: {self.stats['potential_liquidations']}")
        logger.info(f"总耗时: {round(elapsed_time, 2)} 秒")
        logger.info(f"平均每个订单耗时: {round(elapsed_time / max(1, self.stats['verified_orders']), 2)} 秒")
        
        return report
    
    def is_liquidation_event(self, order_id, inst_id):
        """检查单个订单是否发生爆仓"""
        # 验证单个订单
        result = self.verify_single_order({"order_id": order_id, "inst_id": inst_id})
        
        # 判断是否有爆仓
        if result.get("status") == "success" and result.get("trade_summary", {}).get("has_liquidations", False):
            return True, result
        
        return False, result

# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(level=logging.INFO)
    
    # 示例API配置
    api_key = '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6'
    api_secret = 'F9F45C90C94953FDACEBFE3697248B33'
    passphrase = 'S20250901zhao$'
    
    # 初始化验证服务
    okx_service = OKXVerificationService(api_key, api_secret, passphrase)
    
    # 批量验证订单
    # okx_service.batch_verify_orders()
    
    # 验证单个订单是否爆仓
    # is_liquidation, details = okx_service.is_liquidation_event("2938812509925187584", "BTC-USDT-SWAP")
    # print(f"是否爆仓: {is_liquidation}")