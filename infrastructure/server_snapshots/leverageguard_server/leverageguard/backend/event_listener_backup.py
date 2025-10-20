#!/usr/bin/env python3
import os
import time
import json
from web3 import Web3
from dotenv import load_dotenv
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("leverageguard.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

class LeverageGuardEventListener:
    def __init__(self):
        # 初始化Web3连接
        self.rpc_url = os.getenv('ARBITRUM_RPC')
        self.private_key = os.getenv('OWNER_PRIVATE_KEY')
        self.contract_address = os.getenv('LEVERAGEGUARD_ADDRESS')
        
        if not all([self.rpc_url, self.private_key, self.contract_address]):
            logger.error("Missing environment variables. Please check your .env file.")
            raise ValueError("Missing required environment variables")
        
        # 连接到Arbitrum网络
        self.web3 = Web3(Web3.HTTPProvider(self.rpc_url))
        if not self.web3.is_connected():
            logger.error("Failed to connect to Arbitrum network")
            raise ConnectionError("Failed to connect to Arbitrum network")
        
        logger.info(f"Connected to Arbitrum network: {self.rpc_url}")
        
        # 获取合约实例
        self.wallet = self.web3.eth.account.from_key(self.private_key)
        self.contract = self.get_contract_instance()
        
        # 记录最后处理的区块号
        self.last_processed_block = self.web3.eth.block_number
        
        logger.info(f"Event listener initialized. Monitoring Liquidation events for contract: {self.contract_address}")
        logger.info(f"Owner wallet: {self.wallet.address}")
        logger.info(f"Starting from block: {self.last_processed_block}")
    
    def get_contract_instance(self):
        """获取LeverageGuard合约实例"""
        # 合约ABI (简化版)
        abi = [
            {"anonymous": False, "inputs": [{"indexed": True, "internalType": "address", "name": "user", "type": "address"}, {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}, {"indexed": False, "internalType": "string", "name": "reason", "type": "string"}], "name": "PositionLiquidated", "type": "event"},
            {"anonymous": False, "inputs": [{"indexed": True, "internalType": "address", "name": "user", "type": "address"}, {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}], "name": "Payout", "type": "event"},
            {"inputs": [{"internalType": "address", "name": "_user", "type": "address"}, {"internalType": "uint256", "name": "_amount", "type": "uint256"}], "name": "executePayout", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
            {"inputs": [{"internalType": "address", "name": "_user", "type": "address"}], "name": "getUserBalance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
            {"inputs": [], "name": "contractBalance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}
        ]
        
        return self.web3.eth.contract(address=self.contract_address, abi=abi)
    
    def calculate_payout_amount(self, user, leverage_ratio):
        """计算赔付金额"""
        # 这里可以实现更复杂的赔付逻辑
        # 示例：根据杠杆率计算赔付金额
        try:
            # 检查用户余额（历史赔付记录）
            user_balance = self.contract.functions.getUserBalance(user).call()
            
            # 检查合约余额
            contract_balance = self.contract.functions.contractBalance().call()
            
            # 简单的赔付算法示例：根据杠杆率和用户历史赔付记录计算
            # 实际应用中应该根据保险规则实现更复杂的逻辑
            if leverage_ratio > 200:  # 杠杆率超过200%时赔付更多
                base_amount = Web3.toWei(0.02, 'ether')
            elif leverage_ratio > 150:  # 杠杆率150-200%时中等赔付
                base_amount = Web3.toWei(0.01, 'ether')
            else:  # 杠杆率100-150%时基础赔付
                base_amount = Web3.toWei(0.005, 'ether')
            
            # 确保不超过合约余额的10%
            max_payout = contract_balance // 10
            payout_amount = min(base_amount, max_payout)
            
            # 确保赔付金额大于0且不超过合约余额
            if payout_amount <= 0 or payout_amount > contract_balance:
                return 0
            
            return payout_amount
        except Exception as e:
            logger.error(f"Error calculating payout amount for user {user}: {str(e)}")
            return 0
    
    def execute_payout(self, user, payout_amount):
        """执行赔付操作"""
        if payout_amount <= 0:
            logger.warning(f"Payout amount is zero or negative. Skipping payout for user {user}")
            return False
        
        try:
            # 构建交易
            nonce = self.web3.eth.getTransactionCount(self.wallet.address)
            gas_price = self.web3.eth.gas_price
            
            tx = self.contract.functions.executePayout(user, payout_amount).buildTransaction({
                'chainId': 421614,  # Arbitrum Sepolia chain ID
                'gas': 1000000,  # 预估Gas
                'gasPrice': gas_price,
                'nonce': nonce,
            })
            
            # 签名交易
            signed_tx = self.web3.eth.account.sign_transaction(tx, self.private_key)
            
            # 发送交易
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.rawTransaction)
            tx_hash_hex = self.web3.toHex(tx_hash)
            
            logger.info(f"Payout transaction sent for user {user}: {tx_hash_hex}")
            logger.info(f"Payout amount: {Web3.fromWei(payout_amount, 'ether')} ETH")
            
            # 等待交易确认
            tx_receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=600)
            
            if tx_receipt.status == 1:
                logger.info(f"Payout transaction confirmed for user {user}")
                return True
            else:
                logger.error(f"Payout transaction failed for user {user}")
                return False
        except Exception as e:
            logger.error(f"Error executing payout for user {user}: {str(e)}")
            return False
    
    def process_new_events(self):
        """处理新的事件"""
        try:
            current_block = self.web3.eth.block_number
            
            # 如果区块号没有增加，则没有新事件
            if current_block <= self.last_processed_block:
                return
            
            # 简化版：不直接获取事件，而是定期检查区块高度
            logger.info(f"Checking blocks from {self.last_processed_block+1} to {current_block}")
            
            # 在实际应用中，这里可以添加一个模拟的测试事件触发
            # 用于演示系统功能
            
            # 更新最后处理的区块号
            self.last_processed_block = current_block
        except Exception as e:
            logger.error(f"Error processing events: {str(e)}")
    
    def run(self):
        """运行事件监听器"""
        logger.info("Starting event listener loop...")
        
        try:
            while True:
                try:
                    self.process_new_events()
                except Exception as e:
                    logger.error(f"Error in event processing: {str(e)}")
                
                # 每10秒检查一次新事件
                time.sleep(10)
        except KeyboardInterrupt:
            logger.info("Event listener stopped by user")
        except Exception as e:
            logger.critical(f"Failed to start event listener: {str(e)}")

if __name__ == "__main__":
    try:
        listener = LeverageGuardEventListener()
        listener.run()
    except Exception as e:
        logger.critical(f"Failed to start event listener: {str(e)}")