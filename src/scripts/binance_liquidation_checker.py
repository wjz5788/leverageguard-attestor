#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
币安爆仓逻辑验证器
这个脚本专门用于验证币安USDⓈ‑M期货交易的爆仓逻辑
"""

import os
import json
import time
import hmac
import hashlib
import logging
import argparse
from pathlib import Path
from datetime import datetime

import requests
from dotenv import load_dotenv

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("binance_liquidation_checker.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 仓库根目录 & 输出目录
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVIDENCE_DIR = Path(
    os.environ.get("BINANCE_EVIDENCE_DIR", REPO_ROOT / "data" / "evidence")
)

# 加载环境变量，支持自定义路径
logger.info("正在加载环境变量...")
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
    if candidate and candidate.exists():
        load_dotenv(candidate)
        logger.info(f"已加载币安API凭证: {candidate}")
        env_loaded = True
        break

if not env_loaded:
    load_dotenv()
    logger.info("未找到专门的 binance.env 文件，使用当前环境变量")

class BinanceClient:
    """
    币安API客户端，专注于爆仓相关数据获取
    """
    def __init__(self, api_key=None, api_secret=None):
        # 实盘环境设置
        self.api_key = api_key or os.getenv('BINANCE_API_KEY')
        self.api_secret = api_secret or os.getenv('BINANCE_SECRET_KEY')
        # 实盘API基础URL
        self.base_url = "https://fapi.binance.com"
        self.timeout = 10
        logger.info("使用币安实盘API环境")
        
        # 验证API凭证
        if not self.api_key or not self.api_secret:
            raise ValueError("API密钥或密钥缺失，请在环境变量中设置BINANCE_API_KEY和BINANCE_SECRET_KEY")
        
        logger.info("币安API客户端初始化完成")
    
    def _generate_signature(self, params):
        """生成API请求签名"""
        # 创建一个副本以避免修改原始参数
        params_copy = params.copy()
        # 如果params中已经包含signature，需要先移除它
        if 'signature' in params_copy:
            del params_copy['signature']
        
        # 按照币安API要求，参数必须按照字母顺序排序
        sorted_params = sorted(params_copy.items())
        logger.debug(f"排序后的参数: {sorted_params}")
        
        query_string = '&'.join([f"{k}={v}" for k, v in sorted_params])
        logger.debug(f"用于生成签名的查询字符串: {query_string}")
        
        signature = hmac.new(
            self.api_secret.encode('utf-8'),
            query_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        logger.debug(f"生成的签名: {signature[:10]}...")
        
        return signature
    
    def _request(self, endpoint, method='GET', params=None, need_signature=True):
        """发送API请求（实盘环境）"""
        url = f"{self.base_url}{endpoint}"
        headers = {'X-MBX-APIKEY': self.api_key}
        logger.debug(f"发送实盘API请求到: {url}")
        
        if params is None:
            params = {}
        
        # 添加时间戳
        if need_signature:
            params['timestamp'] = int(time.time() * 1000)
            # 复制参数以避免修改原始参数
            signature_params = params.copy()
            # 移除可能存在的signature参数
            if 'signature' in signature_params:
                del signature_params['signature']
            
            # 按照币安API要求，参数必须按照字母顺序排序
            sorted_params = sorted(signature_params.items())
            logger.debug(f"排序后的参数: {sorted_params}")
            
            # 构建正确排序的查询字符串
            query_string = '&'.join([f"{k}={v}" for k, v in sorted_params])
            logger.debug(f"签名前的查询字符串: {query_string}")
            
            signature = hmac.new(
                self.api_secret.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            # 创建一个新的参数字典，包含排序后的参数和签名
            full_params = dict(sorted_params)
            full_params['signature'] = signature
            params = full_params
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=self.timeout)
            else:
                response = requests.post(url, headers=headers, data=params, timeout=self.timeout)
            
            # 先检查响应状态码
            if response.status_code != 200:
                error_msg = f"API请求失败: {response.status_code} {response.reason}"
                # 尝试获取币安特定的错误信息
                if response.text:
                    try:
                        error_data = response.json()
                        if 'code' in error_data and 'msg' in error_data:
                            error_msg += f" - 币安错误代码: {error_data['code']}, 错误信息: {error_data['msg']}"
                        else:
                            error_msg += f" - 响应内容: {response.text}"
                    except:
                        error_msg += f" - 响应内容: {response.text}"
                logger.error(error_msg)
                # 抛出包含详细错误信息的异常
                raise Exception(error_msg)
            
            return response.json()
        except Exception as e:
            logger.error(f"API请求失败: {str(e)}")
            raise
    
    def get_account_info(self):
        """获取账户信息，包含保证金和持仓情况"""
        endpoint = "/fapi/v2/account"
        return self._request(endpoint)
    
    def get_order(self, symbol, order_id):
        """获取订单详情"""
        endpoint = "/fapi/v1/order"
        # 使用大写的orderId参数（币安API要求）
        params = {'symbol': symbol, 'orderId': order_id}
        logger.debug(f"查询订单参数: {params}")
        return self._request(endpoint, params=params)
    
    def get_user_trades(self, symbol, order_id, limit=500):
        """获取用户交易记录"""
        endpoint = "/fapi/v1/userTrades"
        params = {'symbol': symbol, 'orderId': order_id, 'limit': limit}
        return self._request(endpoint, params=params)
    
    def get_position_risk(self):
        """获取持仓风险信息，包含维持保证金等"""
        endpoint = "/fapi/v2/positionRisk"
        return self._request(endpoint)
    
    def get_liquidation_orders(self, symbol=None, startTime=None, endTime=None, limit=500):
        """获取强平订单历史"""
        endpoint = "/fapi/v1/allForceOrders"
        params = {'limit': limit}
        
        if symbol:
            params['symbol'] = symbol
        if startTime:
            params['startTime'] = startTime
        if endTime:
            params['endTime'] = endTime
        
        return self._request(endpoint, params=params)
        
    def get_exchange_info(self):
        """获取交易所信息"""
        return self._request("/fapi/v1/exchangeInfo", need_signature=False)

def calculate_liquidation_price(entry_price, leverage, maintenance_margin_rate, is_long=True):
    """
    计算理论爆仓价格
    
    参数:
    - entry_price: 开仓价格
    - leverage: 杠杆倍数
    - maintenance_margin_rate: 维持保证金率
    - is_long: 是否为多头
    
    返回:
    - 爆仓价格
    """
    try:
        entry_price = float(entry_price)
        leverage = float(leverage)
        maintenance_margin_rate = float(maintenance_margin_rate)
        
        # 计算初始保证金率
        initial_margin_rate = 1 / leverage
        
        # 爆仓条件：账户权益 <= 维持保证金
        # 多头爆仓价格 = 入场价格 * (1 - 初始保证金率 + 维持保证金率)
        # 空头爆仓价格 = 入场价格 * (1 + 初始保证金率 - 维持保证金率)
        
        if is_long:
            liquidation_price = entry_price * (1 - initial_margin_rate + maintenance_margin_rate)
        else:
            liquidation_price = entry_price * (1 + initial_margin_rate - maintenance_margin_rate)
        
        return liquidation_price
    except (ValueError, TypeError) as e:
        logger.error(f"计算爆仓价格失败: {e}")
        return None

def check_liquidation_risk(client, symbol, position=None):
    """
    检查持仓是否存在爆仓风险
    
    参数:
    - client: BinanceClient实例
    - symbol: 交易对
    - position: 持仓信息（可选）
    
    返回:
    - 爆仓风险评估结果
    """
    try:
        # 如果没有提供持仓信息，则获取所有持仓风险
        if not position:
            position_risks = client.get_position_risk()
            position = next((p for p in position_risks if p['symbol'] == symbol), None)
            if not position:
                return {"risk_level": "无持仓", "message": f"未找到{symbol}的持仓"}
        
        # 检查是否有持仓
        position_amount = float(position['positionAmt'])
        if position_amount == 0:
            return {"risk_level": "无持仓", "message": f"{symbol}当前无持仓"}
        
        # 获取关键参数
        entry_price = float(position['entryPrice'])
        leverage = float(position['leverage'])
        maintenance_margin_rate = float(position['maintMarginRatio'])
        current_price = float(position['markPrice'])
        unrealized_pnl = float(position['unRealizedProfit'])
        wallet_balance = float(position['walletBalance'])
        margin_balance = float(position['marginBalance'])
        
        # 判断多空
        is_long = position_amount > 0
        
        # 计算理论爆仓价格
        liquidation_price = calculate_liquidation_price(entry_price, leverage, maintenance_margin_rate, is_long)
        
        # 计算当前维持保证金
        maintenance_margin = float(position['maintMargin'])
        
        # 计算保证金率
        margin_rate = float(position['marginRatio'])
        
        # 评估风险等级
        price_difference_percent = abs((current_price - liquidation_price) / liquidation_price * 100)
        
        if margin_rate >= 1:
            risk_level = "即将爆仓"
            message = f"保证金率{margin_rate*100:.2f}%，已达到或超过100%，即将爆仓！"
        elif margin_rate >= 0.8:
            risk_level = "高风险"
            message = f"保证金率{margin_rate*100:.2f}%，接近爆仓点，当前价格距离爆仓价格{price_difference_percent:.2f}%"
        elif margin_rate >= 0.5:
            risk_level = "中风险"
            message = f"保证金率{margin_rate*100:.2f}%，存在一定风险，当前价格距离爆仓价格{price_difference_percent:.2f}%"
        else:
            risk_level = "低风险"
            message = f"保证金率{margin_rate*100:.2f}%，风险较低，当前价格距离爆仓价格{price_difference_percent:.2f}%"
        
        return {
            "risk_level": risk_level,
            "message": message,
            "details": {
                "symbol": symbol,
                "entry_price": entry_price,
                "current_price": current_price,
                "liquidation_price": liquidation_price,
                "leverage": leverage,
                "position_amount": position_amount,
                "position_type": "多头" if is_long else "空头",
                "unrealized_pnl": unrealized_pnl,
                "wallet_balance": wallet_balance,
                "margin_balance": margin_balance,
                "maintenance_margin": maintenance_margin,
                "maintenance_margin_rate": maintenance_margin_rate * 100,
                "margin_rate": margin_rate * 100,
                "price_distance_percent": price_difference_percent
            }
        }
    
    except Exception as e:
        logger.error(f"检查爆仓风险时出错: {e}")
        return {"risk_level": "未知", "message": f"检查失败: {str(e)}"}

def verify_liquidation_logic(order_id, symbol, api_key=None, api_secret=None, verbose=False):
    """
    验证特定订单的爆仓逻辑
    
    参数:
    - order_id: 订单ID
    - symbol: 交易对
    - api_key: API密钥（可选，优先使用环境变量）
    - api_secret: API密钥（可选，优先使用环境变量）
    - verbose: 是否输出详细日志
    
    返回:
    - 验证结果
    """
    logger.info(f"开始验证订单 {order_id} 的清算逻辑，交易对: {symbol}")
    
    env_api_key = os.getenv('BINANCE_API_KEY')
    env_api_secret = os.getenv('BINANCE_SECRET_KEY')

    resolved_api_key = api_key or env_api_key
    resolved_api_secret = api_secret or env_api_secret

    if not resolved_api_key or not resolved_api_secret:
        logger.error("缺少币安API凭证，请通过参数或环境变量提供 BINANCE_API_KEY/BINANCE_SECRET_KEY")
        return {"success": False, "message": "缺少币安API凭证，请检查配置"}

    if api_key or api_secret:
        logger.info("使用命令行传入的币安API凭证")
    else:
        logger.info("使用环境变量中的币安API凭证")
    
    try:
        # 初始化API客户端
        client = BinanceClient(api_key=resolved_api_key, api_secret=resolved_api_secret)
        
        # 创建结果目录
        result_path = DEFAULT_EVIDENCE_DIR / f"binance_{order_id}"
        result_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"开始验证订单 {order_id} ({symbol}) 的爆仓逻辑")
        
        # 首先测试账户信息API，确保连接正常
        logger.info("测试API连接：获取账户信息")
        account_info = client.get_account_info()
        logger.info("成功获取账户信息，API连接正常")
        
        # 获取订单信息
        try:
            logger.info(f"获取订单 {order_id} 信息")
            order_info = client.get_order(symbol, order_id)
            logger.info(f"成功获取订单信息: 订单ID={order_info.get('orderId')}")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"获取订单信息失败: {error_msg}")
            if "Order does not exist" in error_msg:
                return {"success": False, "message": "订单不存在，请确认订单ID和交易对是否正确"}
            elif "Invalid symbol" in error_msg:
                return {"success": False, "message": "无效的交易对，请确认交易对格式是否正确"}
            else:
                raise
        
        # 获取交易记录
        logger.info(f"获取交易记录")
        trades = client.get_user_trades(symbol, order_id)
        logger.info(f"成功获取 {len(trades)} 笔交易记录")
        
        # 获取持仓风险信息
        logger.info(f"获取持仓风险信息")
        position_risks = client.get_position_risk()
        position = next((p for p in position_risks if p['symbol'] == symbol), None)
        if position:
            logger.info(f"找到 {symbol} 的持仓信息")
        else:
            logger.warning(f"未找到 {symbol} 的持仓信息")
        
        # 检查爆仓风险
        liquidation_risk = check_liquidation_risk(client, symbol, position)
        logger.info(f"爆仓风险评估: {liquidation_risk['risk_level']} - {liquidation_risk['message']}")
        
        # 获取历史强平订单（该端点已停用）
        logger.info(f"跳过获取历史强平订单，因为API端点已停用")
        liquidation_orders = []
        
        # 由于无法获取强平订单列表，我们设置为未知状态
        is_liquidation_order = "unknown"
        
        # 计算理论爆仓价格（如果有持仓）
        theoretical_liquidation_price = None
        if position and float(position.get('positionAmt', '0')) != 0:
            entry_price = float(position.get('entryPrice', '0'))
            leverage = float(position.get('leverage', '1'))
            maintenance_margin_rate = float(position.get('maintMarginRatio', '0'))
            is_long = float(position.get('positionAmt', '0')) > 0
            theoretical_liquidation_price = calculate_liquidation_price(
                entry_price, leverage, maintenance_margin_rate, is_long
            )
        
        # 准备验证结果
        verification_result = {
            "order_id": order_id,
            "symbol": symbol,
            "timestamp": datetime.now().isoformat(),
            "order_info": {
                "order_type": order_info.get('type'),
                "side": order_info.get('side'),
                "status": order_info.get('status'),
                "price": order_info.get('price'),
                "orig_qty": order_info.get('origQty'),
                "executed_qty": order_info.get('executedQty'),
                "time": datetime.fromtimestamp(order_info.get('time', 0) / 1000).isoformat()
            },
            "is_liquidation_order": is_liquidation_order,
            "liquidation_risk": liquidation_risk,
            "theoretical_liquidation_price": theoretical_liquidation_price,
            "trade_count": len(trades),
            "liquidation_orders_count": len(liquidation_orders)
        }
        
        # 保存结果到文件
        logger.info(f"保存验证结果到 {result_path}")
        with (result_path / "verification_result.json").open("w", encoding="utf-8") as f:
            json.dump(verification_result, f, indent=2, ensure_ascii=False)
        
        with (result_path / "order.json").open("w", encoding="utf-8") as f:
            json.dump(order_info, f, indent=2, ensure_ascii=False)
        
        with (result_path / "trades.json").open("w", encoding="utf-8") as f:
            json.dump(trades, f, indent=2, ensure_ascii=False)
        
        with (result_path / "account_info.json").open("w", encoding="utf-8") as f:
            json.dump(account_info, f, indent=2, ensure_ascii=False)
        
        with (result_path / "liquidation_orders.json").open("w", encoding="utf-8") as f:
            json.dump(liquidation_orders, f, indent=2, ensure_ascii=False)
        
        if position:
            with (result_path / "position.json").open("w", encoding="utf-8") as f:
                json.dump(position, f, indent=2, ensure_ascii=False)
        
        logger.info(f"验证完成，结果保存在 {result_path}")
        
        # 生成可读的摘要
        summary = {
            "验证订单": f"{order_id} ({symbol})",
            "订单类型": order_info.get('type', '未知'),
            "订单方向": order_info.get('side', '未知'),
            "订单状态": order_info.get('status', '未知'),
            "是否强平订单": "是" if is_liquidation_order else "否",
            "爆仓风险等级": liquidation_risk['risk_level'],
            "风险评估": liquidation_risk['message'],
            "交易记录数量": len(trades)
        }
        
        if theoretical_liquidation_price:
            summary["理论爆仓价格"] = theoretical_liquidation_price
        
        return {
            "success": True,
            "message": "爆仓逻辑验证完成",
            "summary": summary,
            "result_dir": str(result_path)
        }
    
    except Exception as e:
        logger.error(f"验证爆仓逻辑时出错: {e}")
        error_msg = str(e)
        
        # 分析常见的API错误
        if "API-key format invalid" in error_msg or "Invalid API-key" in error_msg:
            return {"success": False, "message": "API密钥格式无效，请检查您的API密钥"}
        elif "API-key not found" in error_msg:
            return {"success": False, "message": "未找到API密钥，请确认密钥是否正确"}
        elif "Signature for this request is not valid" in error_msg:
            return {"success": False, "message": "签名无效，请检查API密钥和密钥密码是否匹配"}
        elif "IP banned" in error_msg or "IP restriction" in error_msg:
            return {"success": False, "message": "IP被限制，请检查API的IP白名单设置"}
        elif "Timestamps for this request are not valid" in error_msg:
            return {"success": False, "message": "时间戳无效，请确保服务器时间同步"}
        elif "Insufficient permissions" in error_msg:
            return {"success": False, "message": "API权限不足，请确保API具有读取订单和账户信息的权限"}
        elif "Order does not exist" in error_msg:
            return {"success": False, "message": "订单不存在，请确认订单ID和交易对是否正确，或该订单可能不属于当前API账户"}
        else:
            return {"success": False, "message": f"验证失败: {error_msg}"}



def main():
    """
    主函数，处理命令行参数并执行验证
    """
    parser = argparse.ArgumentParser(description='币安爆仓逻辑验证器')
    parser.add_argument('--ordId', required=True, help='订单ID')
    parser.add_argument('--symbol', required=True, help='交易对（例如：BTCUSDT）')
    parser.add_argument('--apiKey', type=str, help='币安API密钥（可选，优先使用环境变量）')
    parser.add_argument('--secretKey', type=str, help='币安API密钥密码（可选，优先使用环境变量）')
    parser.add_argument('--verbose', action='store_true', help='显示详细日志')
    
    args = parser.parse_args()
    
    # 如果启用详细日志
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    try:
        # 执行验证，传入命令行提供的API凭证（如果有）
        result = verify_liquidation_logic(args.ordId, args.symbol, args.apiKey, args.secretKey, args.verbose)
        
        # 打印结果摘要
        print("\n=== 币安爆仓逻辑验证结果 ===")
        if result['success']:
            print(f"验证状态: 成功")
            print(f"结果目录: {result['result_dir']}")
            print("\n验证摘要:")
            for key, value in result['summary'].items():
                print(f"{key}: {value}")
        else:
            print(f"验证状态: 失败")
            print(f"错误信息: {result['message']}")
            
    except Exception as e:
        print(f"执行过程中出错: {str(e)}")
        logger.error(f"主程序执行失败: {e}")
        exit(1)

if __name__ == "__main__":
    main()
