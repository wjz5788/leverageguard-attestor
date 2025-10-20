from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
from web3 import Web3
import json
import logging

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 加载配置
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['PORT'] = int(os.getenv('PORT', 5000))

# Web3 连接配置
RPC_URL = os.getenv('RPC_URL', 'https://arb-sepolia.g.alchemy.com/v2/demo')
PRIVATE_KEY = os.getenv('PRIVATE_KEY')
CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS')

# OKX API配置
OKX_API_KEY = os.getenv('OKX_API_KEY', '1e0ea9aa-e8a4-4217-a6dd-b5f0e7f313f6')
OKX_API_SECRET = os.getenv('OKX_API_SECRET', 'F9F45C90C94953FDACEBFE3697248B33')
OKX_PASSPHRASE = os.getenv('OKX_PASSPHRASE', 'S20250901zhao$')

# 初始化 Web3 实例
w3 = Web3(Web3.HTTPProvider(RPC_URL))
if not w3.is_connected():
    logger.warning("无法连接到以太坊网络，将使用模拟模式")

# 加载合约 ABI (简化版，实际应从文件加载)
contract_abi = [
    {"constant": False, "inputs": [{"name": "_user", "type": "address"}, {"name": "_leverageRatio", "type": "uint256"}, {"name": "_reason", "type": "string"}], "name": "markLiquidation", "outputs": [], "payable": False, "stateMutability": "nonpayable", "type": "function"},
    {"constant": False, "inputs": [{"name": "_user", "type": "address"}, {"name": "_amount", "type": "uint256"}], "name": "executePayout", "outputs": [], "payable": False, "stateMutability": "nonpayable", "type": "function"},
    {"constant": False, "inputs": [{"name": "user", "type": "address"}, {"name": "orderId", "type": "uint256"}, {"name": "payoutAmount", "type": "uint256"}, {"name": "verified", "type": "bool"}], "name": "verifyAndEmitEvent", "outputs": [], "payable": False, "stateMutability": "nonpayable", "type": "function"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "user", "type": "address"}, {"indexed": True, "name": "orderId", "type": "uint256"}, {"indexed": False, "name": "payoutAmount", "type": "uint256"}, {"indexed": False, "name": "verified", "type": "bool"}], "name": "PayoutVerified", "type": "event"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "user", "type": "address"}, {"indexed": False, "name": "amount", "type": "uint256"}], "name": "Payout", "type": "event"}
]

# 初始化合约实例
contract = None
if w3.is_connected() and CONTRACT_ADDRESS:
    try:
        contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=contract_abi)
    except Exception as e:
        logger.error(f"初始化合约实例失败: {str(e)}")

# 导入服务、工具和路由
from backend.services.okx_verification import OKXVerificationService
from backend.utils.database import db

# 初始化OKX验证服务
ota_service = OKXVerificationService(
    api_key=OKX_API_KEY,
    api_secret=OKX_API_SECRET,
    passphrase=OKX_PASSPHRASE
)

# 导入API路由蓝图
from backend.api.routes import bp as api_bp

# 注册蓝图
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return "LeverageGuard 后端服务运行中"

# 添加一个新的验证爆仓事件的端点，结合数据库和Web3
@app.route('/api/verify_liquidation', methods=['POST'])
def verify_liquidation():
    """验证爆仓事件"""
    try:
        data = request.json
        order_id = data.get('order_id')
        inst_id = data.get('inst_id', 'BTC-USDT-SWAP')  # 默认交易对
        
        # 从数据库获取订单
        order_info = db.get_order(order_id)
        if not order_info:
            return jsonify({'status': 'error', 'message': '订单不存在'}), 404
        
        # 使用OKX验证服务验证爆仓事件
        logger.info(f"开始验证订单 {order_id} 的爆仓事件")
        
        # 调用OKX验证服务的verify_single_order方法
        result = ota_service.verify_single_order({
            'order_id': order_id,
            'inst_id': inst_id
        })
        
        # 检查是否有爆仓
        has_liquidations = result.get('trade_summary', {}).get('has_liquidations', False)
        
        if has_liquidations:
            # 计算赔付金额（这里根据爆仓严重程度计算）
            # 实际应用中应根据用户购买的套餐和爆仓情况动态计算
            trade_summary = result.get('trade_summary', {})
            total_pnl = trade_summary.get('total_pnl', 0)
            liquidation_count = trade_summary.get('liquidation_count', 0)
            
            # 获取套餐信息
            package_info = db.get_package(order_info.get('package_id'))
            coverage = package_info.get('coverage', 1000) if package_info else 1000
            
            # 简单的赔付计算逻辑示例
            if total_pnl < 0:
                # 取亏损金额的一定比例作为赔付金额（最高不超过套餐保障金额）
                loss_amount = abs(total_pnl)
                # 假设赔付比例为10%，且不超过套餐保障金额对应的ETH
                # 这里简化处理，假设1 ETH = 2000 USDT
                max_payout_eth = coverage / 2000
                payout_amount = min(int(loss_amount * 0.1 * 10**18), int(max_payout_eth * 10**18))
            else:
                payout_amount = 0
            
            # 调用合约验证事件（如果连接可用）
            tx_hash = None
            if w3.is_connected() and contract and PRIVATE_KEY:
                try:
                    account = w3.eth.account.from_key(PRIVATE_KEY)
                    nonce = w3.eth.get_transaction_count(account.address)
                    
                    tx = contract.functions.verifyAndEmitEvent(
                        order_info['user_address'],
                        int(order_id),
                        payout_amount,
                        True
                    ).build_transaction({
                        'from': account.address,
                        'nonce': nonce,
                        'gas': 2000000,
                        'gasPrice': w3.eth.gas_price
                    })
                    
                    signed_tx = account.sign_transaction(tx)
                    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
                    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
                    tx_hash = tx_hash.hex()
                except Exception as e:
                    logger.error(f"链上验证失败: {str(e)}")
                    # 继续执行，不中断流程
            
            # 更新订单状态和详细信息到数据库
            db.update_order_status(
                order_id,
                'verified',
                tx_hash=tx_hash,
                payout_amount=payout_amount,
                verification_details=result
            )
            
            logger.info(f"爆仓验证成功，订单 {order_id}")
            logger.info(f"爆仓次数: {liquidation_count}, 总亏损: {total_pnl} USDT, 赔付金额: {payout_amount} wei")
            
            return jsonify({
                'status': 'success',
                'message': '爆仓验证成功',
                'tx_hash': tx_hash,
                'payout_amount': payout_amount,
                'liquidation_count': liquidation_count,
                'total_pnl': total_pnl
            })
        else:
            # 更新订单状态为未爆仓
            db.update_order_status(order_id, 'no_liquidation', verification_details=result)
            logger.warning(f"订单 {order_id} 未检测到爆仓事件")
            return jsonify({'status': 'error', 'message': '未检测到爆仓事件'}), 400
    except Exception as e:
        logger.error(f"验证爆仓事件失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 批量验证订单端点（管理员功能）
@app.route('/api/batch_verify', methods=['POST'])
def batch_verify():
    """批量验证订单（管理员功能）"""
    try:
        # 这里应该有管理员权限验证
        
        # 获取请求参数
        data = request.json
        orders_file = data.get('orders_file', 'orders.txt')
        output_file = data.get('output_file', 'batch_verification_report.json')
        
        # 执行批量验证
        report = ota_service.batch_verify_orders(orders_file, output_file)
        
        if report:
            return jsonify({
                'status': 'success',
                'message': '批量验证完成',
                'report': report
            })
        else:
            return jsonify({'status': 'error', 'message': '批量验证失败'}), 500
    except Exception as e:
        logger.error(f"批量验证失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 执行赔付操作端点
@app.route('/api/execute_payout/<order_id>', methods=['POST'])
def execute_payout_endpoint(order_id):
    """执行赔付操作"""
    try:
        # 从数据库获取订单
        order_info = db.get_order(order_id)
        if not order_info:
            return jsonify({'status': 'error', 'message': '订单不存在'}), 404
        
        # 检查订单状态
        if order_info.get('status') != 'verified':
            return jsonify({'status': 'error', 'message': '订单未通过验证'}), 400
        
        # 执行链上赔付
        if w3.is_connected() and contract and PRIVATE_KEY:
            try:
                account = w3.eth.account.from_key(PRIVATE_KEY)
                nonce = w3.eth.get_transaction_count(account.address)
                
                payout_amount = order_info.get('payout_amount', 0)
                
                tx = contract.functions.executePayout(
                    order_info['user_address'],
                    payout_amount
                ).build_transaction({
                    'from': account.address,
                    'nonce': nonce,
                    'gas': 2000000,
                    'gasPrice': w3.eth.gas_price
                })
                
                signed_tx = account.sign_transaction(tx)
                tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
                tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
                tx_hash = tx_hash.hex()
                
                # 更新订单状态
                db.update_order_status(
                    order_id,
                    'paid_out',
                    payout_tx_hash=tx_hash
                )
                
                logger.info(f"赔付执行成功，订单 {order_id}，交易哈希 {tx_hash}")
                
                return jsonify({
                    'status': 'success',
                    'message': '赔付执行成功',
                    'tx_hash': tx_hash
                })
            except Exception as e:
                logger.error(f"链上赔付失败: {str(e)}")
                return jsonify({'status': 'error', 'message': f'链上赔付失败: {str(e)}'}), 500
        else:
            logger.error("无法执行赔付，Web3连接不可用")
            return jsonify({'status': 'error', 'message': 'Web3连接不可用'}), 500
    except Exception as e:
        logger.error(f"执行赔付操作失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 获取订单状态端点
@app.route('/api/order/<order_id>', methods=['GET'])
def get_order_status(order_id):
    """获取订单状态"""
    try:
        # 从数据库获取订单
        order_info = db.get_order(order_id)
        if not order_info:
            return jsonify({'status': 'error', 'message': '订单不存在'}), 404
        
        # 隐藏敏感信息
        safe_order_info = {
            'order_id': order_id,
            'user_address': order_info['user_address'],
            'package_id': order_info['package_id'],
            'status': order_info['status'],
            'created_at': order_info['created_at']
        }
        
        # 添加可选字段
        if 'tx_hash' in order_info:
            safe_order_info['tx_hash'] = order_info['tx_hash']
        if 'payout_amount' in order_info:
            safe_order_info['payout_amount'] = order_info['payout_amount']
        if 'payout_tx_hash' in order_info:
            safe_order_info['payout_tx_hash'] = order_info['payout_tx_hash']
        
        return jsonify({
            'status': 'success',
            'data': safe_order_info
        })
    except Exception as e:
        logger.error(f"获取订单状态失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    # 注意：生产环境应使用 Gunicorn 或 uWSGI 等WSGI服务器
    app.run(host='0.0.0.0', port=app.config['PORT'], debug=True)