import json
import os
import logging
from datetime import datetime
import time

# 配置日志
logger = logging.getLogger(__name__)

class UserDatabase:
    def __init__(self, data_dir='./data'):
        self.data_dir = data_dir
        # 确保数据目录存在
        os.makedirs(self.data_dir, exist_ok=True)
        
        # 数据文件路径
        self.users_file = os.path.join(data_dir, 'users.json')
        self.packages_file = os.path.join(data_dir, 'packages.json')
        self.claims_file = os.path.join(data_dir, 'claims.json')
        self.orders_file = os.path.join(data_dir, 'orders.json')
        
        # 初始化数据
        self.users = self._load_data(self.users_file, {})
        self.packages = self._load_data(self.packages_file, {})
        self.claims = self._load_data(self.claims_file, {})
        self.orders = self._load_data(self.orders_file, {})
        
        # 初始化套餐数据
        self._init_packages()
    
    def _load_data(self, file_path, default=None):
        """从文件加载数据"""
        try:
            if os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    return json.load(f)
            return default if default is not None else {}
        except Exception as e:
            logger.error(f"加载数据文件 {file_path} 失败: {str(e)}")
            return default if default is not None else {}
    
    def _save_data(self, file_path, data):
        """保存数据到文件"""
        try:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"保存数据到文件 {file_path} 失败: {str(e)}")
            return False
    
    def _init_packages(self):
        """初始化套餐数据"""
        if not self.packages:
            self.packages = {
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
            self._save_data(self.packages_file, self.packages)
    
    # 用户相关操作
    def add_user(self, user_address, user_data=None):
        """添加或更新用户信息"""
        if user_address not in self.users:
            self.users[user_address] = {
                'address': user_address,
                'created_at': int(time.time()),
                'updated_at': int(time.time()),
                'active_subscription': None
            }
        
        if user_data:
            self.users[user_address].update(user_data)
            self.users[user_address]['updated_at'] = int(time.time())
        
        return self._save_data(self.users_file, self.users)
    
    def get_user(self, user_address):
        """获取用户信息"""
        return self.users.get(user_address)
    
    def update_user_subscription(self, user_address, package_id):
        """更新用户的活跃订阅"""
        user = self.get_user(user_address)
        if user:
            user['active_subscription'] = package_id
            user['updated_at'] = int(time.time())
            return self._save_data(self.users_file, self.users)
        return False
    
    # 订单相关操作
    def add_order(self, order_id, order_data):
        """添加订单"""
        self.orders[order_id] = order_data
        return self._save_data(self.orders_file, self.orders)
    
    def get_order(self, order_id):
        """获取订单"""
        return self.orders.get(order_id)
    
    def get_user_orders(self, user_address):
        """获取用户的所有订单"""
        return [order for order in self.orders.values() if order.get('user_address') == user_address]
    
    def update_order_status(self, order_id, status, **kwargs):
        """更新订单状态"""
        if order_id in self.orders:
            self.orders[order_id]['status'] = status
            self.orders[order_id]['updated_at'] = int(time.time())
            if kwargs:
                self.orders[order_id].update(kwargs)
            return self._save_data(self.orders_file, self.orders)
        return False
    
    # 赔付申请相关操作
    def add_claim(self, claim_id, claim_data):
        """添加赔付申请"""
        self.claims[claim_id] = claim_data
        return self._save_data(self.claims_file, self.claims)
    
    def get_claim(self, claim_id):
        """获取赔付申请"""
        return self.claims.get(claim_id)
    
    def get_user_claims(self, user_address):
        """获取用户的所有赔付申请"""
        return [claim for claim in self.claims.values() if claim.get('user_address') == user_address]
    
    def update_claim_status(self, claim_id, status, **kwargs):
        """更新赔付申请状态"""
        if claim_id in self.claims:
            self.claims[claim_id]['status'] = status
            self.claims[claim_id]['updated_at'] = int(time.time())
            if kwargs:
                self.claims[claim_id].update(kwargs)
            return self._save_data(self.claims_file, self.claims)
        return False
    
    # 套餐相关操作
    def get_package(self, package_id):
        """获取套餐详情"""
        return self.packages.get(package_id)
    
    def get_all_packages(self):
        """获取所有套餐"""
        return list(self.packages.values())

# 创建数据库实例供全局使用
db = UserDatabase()