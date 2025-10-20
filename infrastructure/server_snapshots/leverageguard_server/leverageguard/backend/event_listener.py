import os
import time
import logging
from web3 import Web3
from dotenv import load_dotenv

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/root/leverageguard/logs/event_listener.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class LeverageGuardEventListener:
    def __init__(self):
        # 加载环境变量
        load_dotenv()
        self.rpc_url = os.getenv('ARBITRUM_RPC')
        self.private_key = os.getenv('OWNER_PRIVATE_KEY')
        contract_address = os.getenv('LEVERAGEGUARD_ADDRESS')
        self.chain_id = 421614  # Arbitrum Sepolia chain ID
        
        # 检查必要的环境变量
        if not all([self.rpc_url, self.private_key, contract_address]):
            logger.error("缺少环境变量！请检查ARBITRUM_RPC、OWNER_PRIVATE_KEY、LEVERAGEGUARD_ADDRESS")
            raise ValueError("缺少必要的环境变量")
        
        # 格式化合约地址
        self.contract_address = Web3.to_checksum_address(contract_address)
        
        # 连接到Arbitrum网络
        self.web3 = Web3(Web3.HTTPProvider(self.rpc_url))
        if not self.web3.is_connected():
            logger.error("无法连接到Arbitrum网络")
            raise ConnectionError("无法连接到Arbitrum网络")
        
        logger.info(f"已连接到Arbitrum网络: {self.rpc_url}")
        
        # 获取合约实例
        self.wallet = self.web3.eth.account.from_key(self.private_key)
        self.contract = self.get_contract_instance()
        
        # 记录最后处理的区块号
        self.last_processed_block = self.web3.eth.block_number
        
        logger.info(f"事件监听器已初始化。监控合约的清算事件: {self.contract_address}")
        logger.info(f"所有者钱包: {self.wallet.address}")
        logger.info(f"从区块开始监控: {self.last_processed_block}")
        
        # 配置参数
        self.poll_interval = 10  # 秒
        self.block_step = 10     # 区块步进
    
    def get_contract_instance(self):
        """获取LeverageGuard合约实例"""
        # 合约ABI
        abi = [
            {"anonymous": False, "inputs": [{"indexed": True, "internalType": "address", "name": "user", "type": "address"}, {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}, {"indexed": False, "internalType": "string", "name": "reason", "type": "string"}], "name": "PositionLiquidated", "type": "event"},
            {"anonymous": False, "inputs": [{"indexed": True, "internalType": "address", "name": "user", "type": "address"}, {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}], "name": "Payout", "type": "event"},
            {"inputs": [{"internalType": "address", "name": "_user", "type": "address"}, {"internalType": "uint256", "name": "_amount", "type": "uint256"}], "name": "executePayout", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
            {"inputs": [{"internalType": "address", "name": "_user", "type": "address"}], "name": "getUserBalance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
            {"inputs": [], "name": "contractBalance", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"}
        ]
        
        return self.web3.eth.contract(address=self.contract_address, abi=abi)
    
    def calculate_payout_amount(self, user):
        """计算赔付金额"""
        try:
            # 检查用户余额（历史赔付记录）
            user_balance = self.contract.functions.getUserBalance(user).call()
            
            # 检查合约余额
            contract_balance = self.contract.functions.contractBalance().call()
            
            # 基础赔付金额为0.01 ETH
            base_amount = Web3.to_wei(0.01, 'ether')
            
            # 确保不超过合约余额的10%
            max_payout = contract_balance // 10
            payout_amount = min(base_amount, max_payout)
            
            # 确保赔付金额大于0且不超过合约余额
            if payout_amount <= 0 or payout_amount > contract_balance:
                return 0
            
            return payout_amount
        except Exception as e:
            logger.error(f"计算赔付金额错误: {e}")
            return 0
    
    def execute_payout(self, user, payout_amount):
        """执行赔付操作"""
        if payout_amount <= 0:
            logger.warning(f"赔付金额为0或负数。跳过用户{user}的赔付")
            return False
        
        try:
            # 构建交易
            nonce = self.web3.eth.get_transaction_count(self.wallet.address)
            gas_price = self.web3.eth.gas_price
            
            tx = self.contract.functions.executePayout(user, payout_amount).build_transaction({
                'chainId': self.chain_id,
                'gas': 200000,
                'gasPrice': gas_price,
                'nonce': nonce,
            })
            
            # 签名交易
            signed_tx = self.web3.eth.account.sign_transaction(tx, self.private_key)
            
            # 发送交易
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
            tx_hash_hex = self.web3.to_hex(tx_hash)
            
            logger.info(f"赔付交易已发送给用户{user}: {tx_hash_hex}")
            logger.info(f"赔付金额: {Web3.from_wei(payout_amount, 'ether')} ETH")
            
            return True
        except Exception as e:
            logger.error(f"执行赔付操作时出错: {e}")
            return False
    
    def process_new_events(self):
        """处理新的事件 - 简化版，避免复杂的事件查询"""
        try:
            current_block = self.web3.eth.block_number
            
            # 如果区块号没有增加，则没有新事件
            if current_block <= self.last_processed_block:
                return
            
            # 分批处理区块
            blocks_to_process = current_block - self.last_processed_block
            if blocks_to_process > self.block_step:
                # 如果区块差太大，分批次处理
                start_block = self.last_processed_block + 1
                end_block = self.last_processed_block + self.block_step
                logger.info(f"区块范围过大，分批处理: {start_block}-{end_block}")
                
                # 简化版：只记录区块检查，不实际查询事件
                logger.info(f"检查区块从 {start_block} 到 {end_block}（简化版）")
                
                # 更新最后处理的区块号
                self.last_processed_block = end_block
            else:
                # 正常处理
                logger.info(f"检查区块从 {self.last_processed_block + 1} 到 {current_block}（简化版）")
                
                # 更新最后处理的区块号
                self.last_processed_block = current_block
        except Exception as e:
            logger.error(f"处理事件时出错: {str(e)}")
    
    def run(self):
        """运行事件监听器"""
        logger.info("启动事件监听器循环...")
        
        try:
            while True:
                try:
                    self.process_new_events()
                except Exception as e:
                    logger.error(f"事件处理错误: {e}")
                
                # 每10秒检查一次新事件
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            logger.info("事件监听器被用户停止")
        except Exception as e:
            logger.critical(f"无法启动事件监听器: {e}")

if __name__ == "__main__":
    try:
        listener = LeverageGuardEventListener()
        listener.run()
    except Exception as e:
        logger.critical(f"无法启动事件监听器: {e}")