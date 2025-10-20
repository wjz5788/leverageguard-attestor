from flask import Blueprint, request, jsonify
import logging
from datetime import datetime
import time

# 创建蓝图
bp = Blueprint('api', __name__, url_prefix='/api')

# 配置日志
logger = logging.getLogger(__name__)

# 导入服务和工具
from backend.services.okx_verification import OKXVerificationService
from backend.utils.database import UserDatabase

# 模拟订单数据存储（实际应使用数据库）
user_packages = {}
claims = {}
claims_count = 0

@bp.route('/packages', methods=['POST'])
def purchase_package():
    """购买保险套餐"""
    try:
        data = request.json
        user_address = data.get('user_address')
        package_id = data.get('package_id')
        order_id = data.get('order_id')
        api_key = data.get('api_key')
        secret_key = data.get('secret_key')
        passphrase = data.get('passphrase')
        
        # 验证输入
        if not all([user_address, package_id, order_id]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 保存用户套餐信息
        user_packages[order_id] = {
            'user_address': user_address,
            'package_id': package_id,
            'api_key': api_key,
            'secret_key': secret_key,
            'passphrase': passphrase,
            'status': 'pending',
            'created_at': int(time.time())
        }
        
        logger.info(f"用户 {user_address} 购买套餐 {package_id}，订单号 {order_id}")
        
        return jsonify({
            'status': 'success',
            'message': '套餐购买成功',
            'order_id': order_id
        })
    except Exception as e:
        logger.error(f"购买套餐失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/verify_liquidation', methods=['POST'])
def verify_liquidation():
    """验证爆仓事件"""
    try:
        data = request.json
        order_id = data.get('order_id')
        inst_id = data.get('inst_id', 'BTC-USDT-SWAP')  # 默认交易对
        
        # 检查订单是否存在
        if order_id not in user_packages:
            return jsonify({'status': 'error', 'message': '订单不存在'}), 404
        
        # 这里需要结合OKX验证服务和Web3合约交互
        # 由于当前函数已经在app.py中实现，这里仅作为路由示例
        
        return jsonify({
            'status': 'success',
            'message': '爆仓验证处理中',
            'order_id': order_id
        })
    except Exception as e:
        logger.error(f"验证爆仓事件失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/claims', methods=['POST'])
def submit_claim():
    """提交赔付申请"""
    global claims_count
    try:
        data = request.json
        user_address = data.get('user_address')
        exchange = data.get('exchange')
        position_id = data.get('position_id')
        trading_pair = data.get('trading_pair')
        leverage = data.get('leverage')
        liquidation_price = data.get('liquidation_price')
        
        # 验证输入
        required_fields = ['user_address', 'exchange', 'position_id', 'trading_pair', 'leverage', 'liquidation_price']
        for field in required_fields:
            if field not in data:
                return jsonify({'status': 'error', 'message': f'缺少必要参数: {field}'}), 400
        
        # 生成申请ID
        claims_count += 1
        claim_id = f"CLAIM-{datetime.now().strftime('%Y%m%d%H%M%S')}-{claims_count}"
        
        # 保存赔付申请
        claims[claim_id] = {
            'claim_id': claim_id,
            'user_address': user_address,
            'exchange': exchange,
            'position_id': position_id,
            'trading_pair': trading_pair,
            'leverage': leverage,
            'liquidation_price': liquidation_price,
            'status': 'pending',
            'submitted_at': int(time.time())
        }
        
        logger.info(f"用户 {user_address} 提交赔付申请 {claim_id}")
        
        return jsonify({
            'status': 'success',
            'message': '赔付申请提交成功',
            'claim_id': claim_id
        })
    except Exception as e:
        logger.error(f"提交赔付申请失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/claims/<user_address>', methods=['GET'])
def get_user_claims(user_address):
    """获取用户的赔付申请历史"""
    try:
        user_claims = [claim for claim in claims.values() if claim['user_address'] == user_address]
        
        # 按提交时间倒序排列
        user_claims.sort(key=lambda x: x['submitted_at'], reverse=True)
        
        return jsonify({
            'status': 'success',
            'claims': user_claims
        })
    except Exception as e:
        logger.error(f"获取用户赔付申请历史失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/orders/<user_address>', methods=['GET'])
def get_user_orders(user_address):
    """获取用户的订单历史"""
    try:
        user_orders = [order for order in user_packages.values() if order['user_address'] == user_address]
        
        # 按创建时间倒序排列
        user_orders.sort(key=lambda x: x['created_at'], reverse=True)
        
        return jsonify({
            'status': 'success',
            'orders': user_orders
        })
    except Exception as e:
        logger.error(f"获取用户订单历史失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bp.route('/packages/<package_id>', methods=['GET'])
def get_package_details(package_id):
    """获取套餐详情"""
    try:
        # 模拟套餐数据
        packages = {
            'basic': {
                'id': 'basic',
                'name': '基础版',
                'price': 0.01,  # ETH
                'coverage': 1000,  # USDT
                'max_leverage': 5,
                'duration_days': 30,
                'features': ['单交易所支持', '基础爆仓赔付', '邮件通知']
            },
            'pro': {
                'id': 'pro',
                'name': '专业版',
                'price': 0.05,  # ETH
                'coverage': 5000,  # USDT
                'max_leverage': 10,
                'duration_days': 30,
                'features': ['多交易所支持', '高级爆仓赔付', '短信通知', '优先客服']
            },
            'elite': {
                'id': 'elite',
                'name': '精英版',
                'price': 0.1,  # ETH
                'coverage': 20000,  # USDT
                'max_leverage': 20,
                'duration_days': 30,
                'features': ['全交易所支持', '全额爆仓赔付', 'VIP客服', '风险预警', '定制报告']
            }
        }
        
        if package_id not in packages:
            return jsonify({'status': 'error', 'message': '套餐不存在'}), 404
        
        return jsonify({
            'status': 'success',
            'package': packages[package_id]
        })
    except Exception as e:
        logger.error(f"获取套餐详情失败: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500