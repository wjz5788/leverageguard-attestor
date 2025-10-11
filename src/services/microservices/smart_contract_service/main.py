from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator, conint, confloat
from typing import List, Dict, Optional, Any, Union, Tuple
import uvicorn
import time
import asyncio
import os
import json
import uuid
import threading
from enum import Enum
import eth_account
from eth_account.messages import encode_defunct
import web3
from web3 import Web3, HTTPProvider, IPCProvider, WebsocketProvider
from web3.middleware import geth_poa_middleware
import solcx
import hashlib
import base64

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_SMART_CONTRACT_EVENTS, QUEUE_PAYOUT_PROCESSING, QUEUE_ORDER_VERIFICATION

# 初始化FastAPI应用
app = FastAPI(
    title="Smart Contract Service",
    description="Service for blockchain interaction and smart contract management in LeverageGuard",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 配置CORS
origins = config_manager.get('cors.origins', ['*'])
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 安全配置
bearer_scheme = HTTPBearer()

# 智能合约类型定义
class ContractType(str, Enum):
    LEVERAGE_ENGINE = "leverage_engine"
    COLLATERAL_MANAGER = "collateral_manager"
    ORDER_BOOK = "order_book"
    TOKEN = "token"
    LIQUIDATION_MODULE = "liquidation_module"
    PRICE_FEED = "price_feed"

# 交易状态定义
class TransactionStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    REVERTED = "reverted"

# Web3 连接管理器
class Web3Manager:
    """区块链连接管理类"""
    _instance = None
    _lock = threading.RLock()
    
    def __new__(cls):
        """单例模式实现"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(Web3Manager, cls).__new__(cls)
                cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """初始化Web3连接"""
        self.connections = {}
        self.contracts = {}
        
    def connect(self, network_name: str, rpc_url: str) -> bool:
        """连接到指定的区块链网络"""
        try:
            # 检查连接是否已存在
            if network_name in self.connections:
                logger.info(f"Already connected to network: {network_name}")
                return True
            
            # 创建Web3连接
            w3 = Web3(HTTPProvider(rpc_url))
            
            # 检查连接状态
            if not w3.isConnected():
                logger.error(f"Failed to connect to network: {network_name}, RPC URL: {rpc_url}")
                return False
            
            # 对于PoA网络，添加中间件
            if network_name.lower() in ['kovan', 'rinkeby', 'ropsten', 'goerli', 'bsctest', 'bscmain']:
                w3.middleware_onion.inject(geth_poa_middleware, layer=0)
                logger.info(f"Added PoA middleware for network: {network_name}")
            
            # 保存连接
            self.connections[network_name] = w3
            logger.info(f"Successfully connected to network: {network_name}")
            
            return True
        except Exception as e:
            logger.error(f"Error connecting to network {network_name}: {str(e)}")
            return False
    
    def get_connection(self, network_name: str) -> Optional[Web3]:
        """获取指定网络的Web3连接"""
        return self.connections.get(network_name)
    
    def add_contract(self, contract_name: str, network_name: str, address: str, abi: List[Dict[str, Any]]) -> bool:
        """添加智能合约实例"""
        try:
            # 检查网络连接是否存在
            if network_name not in self.connections:
                logger.error(f"Network not connected: {network_name}")
                return False
            
            # 创建合约实例
            w3 = self.connections[network_name]
            contract = w3.eth.contract(address=address, abi=abi)
            
            # 保存合约实例
            key = f"{network_name}:{contract_name}"
            self.contracts[key] = contract
            logger.info(f"Successfully added contract: {contract_name} on network: {network_name}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding contract {contract_name} on network {network_name}: {str(e)}")
            return False
    
    def get_contract(self, contract_name: str, network_name: str) -> Optional[Any]:
        """获取智能合约实例"""
        key = f"{network_name}:{contract_name}"
        return self.contracts.get(key)
    
    def close(self, network_name: str = None) -> None:
        """关闭区块链连接"""
        try:
            if network_name:
                # 关闭指定网络的连接
                if network_name in self.connections:
                    # HTTPProvider不需要显式关闭
                    del self.connections[network_name]
                    logger.info(f"Closed connection to network: {network_name}")
                
                # 删除该网络的所有合约实例
                keys_to_delete = [k for k in self.contracts.keys() if k.startswith(f"{network_name}:")]
                for key in keys_to_delete:
                    del self.contracts[key]
                    logger.info(f"Removed contract: {key}")
            else:
                # 关闭所有网络连接
                self.connections.clear()
                self.contracts.clear()
                logger.info("Closed all blockchain connections")
        except Exception as e:
            logger.error(f"Error closing connections: {str(e)}")

# 创建Web3管理器实例
web3_manager = Web3Manager()

# 签名验证请求模型
class SignatureVerificationRequest(BaseModel):
    message: str = Field(..., description="Message that was signed")
    signature: str = Field(..., description="Signature to verify")
    address: str = Field(..., description="Address that allegedly signed the message")

# 签名验证结果模型
class SignatureVerificationResult(BaseModel):
    is_valid: bool = Field(..., description="Whether the signature is valid")
    recovered_address: Optional[str] = Field(None, description="Recovered address from the signature")
    message_hash: str = Field(..., description="Hash of the message")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Verification timestamp")

# 交易请求模型
class TransactionRequest(BaseModel):
    network_name: str = Field(..., description="Name of the blockchain network")
    contract_name: str = Field(..., description="Name of the smart contract")
    function_name: str = Field(..., description="Name of the contract function to call")
    params: Dict[str, Any] = Field(..., description="Parameters to pass to the contract function")
    value: Optional[confloat(ge=0)] = Field(None, description="Amount of ETH to send with the transaction")
    gas_limit: Optional[conint(ge=0)] = Field(None, description="Gas limit for the transaction")
    gas_price: Optional[confloat(ge=0)] = Field(None, description="Gas price for the transaction")

# 交易结果模型
class TransactionResult(BaseModel):
    tx_hash: str = Field(..., description="Transaction hash")
    status: TransactionStatus = Field(..., description="Transaction status")
    network_name: str = Field(..., description="Blockchain network name")
    contract_name: str = Field(..., description="Smart contract name")
    function_name: str = Field(..., description="Contract function name")
    block_number: Optional[conint(ge=0)] = Field(None, description="Block number where the transaction was mined")
    gas_used: Optional[conint(ge=0)] = Field(None, description="Gas used for the transaction")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Transaction timestamp")
    error_message: Optional[str] = Field(None, description="Error message if the transaction failed")

# 部署合约请求模型
class DeployContractRequest(BaseModel):
    network_name: str = Field(..., description="Name of the blockchain network")
    contract_name: str = Field(..., description="Name of the contract to deploy")
    contract_code: str = Field(..., description="Solidity contract code")
    constructor_params: Optional[Dict[str, Any]] = Field(None, description="Parameters for the contract constructor")
    gas_limit: Optional[conint(ge=0)] = Field(None, description="Gas limit for the deployment")
    gas_price: Optional[confloat(ge=0)] = Field(None, description="Gas price for the deployment")

# 部署合约结果模型
class DeployContractResult(BaseModel):
    tx_hash: str = Field(..., description="Deployment transaction hash")
    contract_address: Optional[str] = Field(None, description="Address of the deployed contract")
    status: TransactionStatus = Field(..., description="Deployment status")
    network_name: str = Field(..., description="Blockchain network name")
    contract_name: str = Field(..., description="Deployed contract name")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Deployment timestamp")
    error_message: Optional[str] = Field(None, description="Error message if deployment failed")

# 调用合约只读方法请求模型
class CallContractRequest(BaseModel):
    network_name: str = Field(..., description="Name of the blockchain network")
    contract_name: str = Field(..., description="Name of the smart contract")
    function_name: str = Field(..., description="Name of the contract function to call")
    params: Dict[str, Any] = Field(..., description="Parameters to pass to the contract function")

# 获取账户余额请求模型
class GetBalanceRequest(BaseModel):
    network_name: str = Field(..., description="Name of the blockchain network")
    address: str = Field(..., description="Address to check balance for")
    token_address: Optional[str] = Field(None, description="Token contract address (for ERC20 tokens)")

# 账户余额模型
class BalanceResponse(BaseModel):
    network_name: str = Field(..., description="Blockchain network name")
    address: str = Field(..., description="Address")
    balance: str = Field(..., description="Balance (formatted as string to avoid precision issues)")
    symbol: str = Field(..., description="Currency symbol")
    decimals: int = Field(..., description="Number of decimal places")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Balance timestamp")

# 智能合约事件过滤器模型
class EventFilterRequest(BaseModel):
    network_name: str = Field(..., description="Name of the blockchain network")
    contract_name: str = Field(..., description="Name of the smart contract")
    event_name: str = Field(..., description="Name of the event to filter")
    from_block: Optional[conint(ge=0)] = Field(None, description="Starting block number")
    to_block: Optional[conint(ge=0)] = Field(None, description="Ending block number")
    filters: Optional[Dict[str, Any]] = Field(None, description="Additional filters for event parameters")

# 智能合约事件模型
class ContractEvent(BaseModel):
    event_name: str = Field(..., description="Name of the event")
    contract_name: str = Field(..., description="Name of the smart contract")
    network_name: str = Field(..., description="Blockchain network name")
    block_number: conint(ge=0) = Field(..., description="Block number where the event was emitted")
    transaction_hash: str = Field(..., description="Transaction hash")
    log_index: conint(ge=0) = Field(..., description="Log index")
    timestamp: int = Field(..., description="Event timestamp")
    args: Dict[str, Any] = Field(..., description="Event arguments")

# 内部函数：验证签名
def verify_signature(message: str, signature: str, address: str) -> SignatureVerificationResult:
    """验证以太坊消息签名"""
    try:
        # 创建消息对象
        message_bytes = message.encode('utf-8')
        encoded_message = encode_defunct(text=message)
        
        # 计算消息哈希
        message_hash = Web3.keccak(text=message).hex()
        
        # 恢复签名者地址
        recovered_address = eth_account.Account.recover_message(encoded_message, signature=signature)
        
        # 验证地址是否匹配
        is_valid = Web3.toChecksumAddress(recovered_address) == Web3.toChecksumAddress(address)
        
        return SignatureVerificationResult(
            is_valid=is_valid,
            recovered_address=recovered_address,
            message_hash=message_hash
        )
    except Exception as e:
        logger.error(f"Error verifying signature: {str(e)}")
        # 如果验证失败，返回无效结果
        return SignatureVerificationResult(
            is_valid=False,
            recovered_address=None,
            message_hash=Web3.keccak(text=message).hex() if message else ""
        )

# 内部函数：发送交易
def send_transaction(network_name: str, contract_name: str, function_name: str, params: Dict[str, Any], 
                    value: Optional[float] = None, gas_limit: Optional[int] = None, gas_price: Optional[float] = None) -> TransactionResult:
    """发送交易到智能合约"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Network not connected: {network_name}"
            )
        
        # 获取合约实例
        contract = web3_manager.get_contract(contract_name, network_name)
        if not contract:
            logger.error(f"Contract not found: {contract_name} on network: {network_name}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Contract not found: {contract_name}"
            )
        
        # 检查合约函数是否存在
        if not hasattr(contract.functions, function_name):
            logger.error(f"Contract function not found: {function_name}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Contract function not found: {function_name}"
            )
        
        # 获取发送账户
        private_key = config_manager.get(f'blockchain.{network_name}.private_key')
        if not private_key:
            logger.error(f"No private key configured for network: {network_name}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"No private key configured for network: {network_name}"
            )
        
        # 获取发送账户地址
        acct = eth_account.Account.from_key(private_key)
        sender_address = acct.address
        
        # 获取合约函数
        contract_function = getattr(contract.functions, function_name)
        
        # 准备函数调用参数
        try:
            # 如果params是字典，使用关键字参数
            if isinstance(params, dict):
                tx_function = contract_function(**params)
            # 如果params是列表，使用位置参数
            elif isinstance(params, list):
                tx_function = contract_function(*params)
            else:
                tx_function = contract_function(params)
        except Exception as e:
            logger.error(f"Error preparing contract function call: {str(e)}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Error preparing contract function call: {str(e)}"
            )
        
        # 准备交易参数
        tx_params = {
            'from': sender_address,
            'nonce': w3.eth.getTransactionCount(sender_address)
        }
        
        # 设置交易值（ETH）
        if value:
            tx_params['value'] = w3.toWei(value, 'ether')
        
        # 设置gas limit
        if gas_limit:
            tx_params['gas'] = gas_limit
        else:
            # 估算gas limit
            try:
                tx_params['gas'] = tx_function.estimateGas(tx_params)
                # 添加10%的安全边际
                tx_params['gas'] = int(tx_params['gas'] * 1.1)
            except Exception as e:
                logger.warning(f"Failed to estimate gas, using default: {str(e)}")
                tx_params['gas'] = 3000000  # 默认gas limit
        
        # 设置gas price
        if gas_price:
            tx_params['gasPrice'] = w3.toWei(gas_price, 'gwei')
        else:
            # 使用网络当前gas price
            tx_params['gasPrice'] = w3.eth.gasPrice
        
        # 构建交易
        try:
            tx = tx_function.buildTransaction(tx_params)
        except Exception as e:
            logger.error(f"Error building transaction: {str(e)}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Error building transaction: {str(e)}"
            )
        
        # 签名交易
        try:
            signed_tx = acct.sign_transaction(tx)
        except Exception as e:
            logger.error(f"Error signing transaction: {str(e)}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Error signing transaction: {str(e)}"
            )
        
        # 发送交易
        try:
            tx_hash = w3.eth.sendRawTransaction(signed_tx.rawTransaction)
            tx_hash_hex = w3.toHex(tx_hash)
            logger.info(f"Transaction sent: {tx_hash_hex}")
        except Exception as e:
            logger.error(f"Error sending transaction: {str(e)}")
            return TransactionResult(
                tx_hash="",
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                function_name=function_name,
                error_message=f"Error sending transaction: {str(e)}"
            )
        
        # 创建交易结果
        result = TransactionResult(
            tx_hash=tx_hash_hex,
            status=TransactionStatus.PENDING,
            network_name=network_name,
            contract_name=contract_name,
            function_name=function_name
        )
        
        # 记录审计日志
        audit_logger.log_transaction(
            tx_hash=tx_hash_hex,
            network_name=network_name,
            contract_name=contract_name,
            function_name=function_name,
            from_address=sender_address,
            status=TransactionStatus.PENDING
        )
        
        # 在后台等待交易确认
        asyncio.create_task(wait_for_transaction_confirmation(network_name, tx_hash_hex, result))
        
        return result
    except Exception as e:
        logger.error(f"Error in send_transaction: {str(e)}")
        return TransactionResult(
            tx_hash="",
            status=TransactionStatus.FAILED,
            network_name=network_name,
            contract_name=contract_name,
            function_name=function_name,
            error_message=str(e)
        )

# 异步函数：等待交易确认
async def wait_for_transaction_confirmation(network_name: str, tx_hash: str, result: TransactionResult, timeout: int = 300) -> None:
    """等待交易确认并更新交易状态"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            result.status = TransactionStatus.FAILED
            result.error_message = f"Network not connected: {network_name}"
            return
        
        # 等待交易确认，最多等待timeout秒
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # 获取交易收据
                receipt = w3.eth.getTransactionReceipt(tx_hash)
                if receipt:
                    # 交易已确认
                    result.block_number = receipt['blockNumber']
                    result.gas_used = receipt['gasUsed']
                    
                    # 检查交易状态
                    if receipt['status'] == 1:
                        # 交易成功
                        result.status = TransactionStatus.CONFIRMED
                        logger.info(f"Transaction confirmed: {tx_hash}, Block: {receipt['blockNumber']}")
                    else:
                        # 交易失败
                        result.status = TransactionStatus.REVERTED
                        logger.error(f"Transaction reverted: {tx_hash}")
                    
                    # 更新审计日志
                    audit_logger.update_transaction_status(
                        tx_hash=tx_hash,
                        status=result.status,
                        block_number=receipt['blockNumber'],
                        gas_used=receipt['gasUsed']
                    )
                    
                    # 发布交易确认事件到消息队列
                    mq_client.publish_message(QUEUE_SMART_CONTRACT_EVENTS, {
                        "event_type": "TRANSACTION_CONFIRMED",
                        "tx_hash": tx_hash,
                        "network_name": network_name,
                        "contract_name": result.contract_name,
                        "function_name": result.function_name,
                        "status": result.status,
                        "block_number": result.block_number,
                        "gas_used": result.gas_used,
                        "timestamp": int(time.time())
                    })
                    
                    return
                
                # 等待1秒后重试
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error checking transaction status: {str(e)}")
                await asyncio.sleep(1)
        
        # 交易超时
        result.status = TransactionStatus.FAILED
        result.error_message = "Transaction confirmation timeout"
        logger.error(f"Transaction confirmation timeout: {tx_hash}")
        
        # 更新审计日志
        audit_logger.update_transaction_status(
            tx_hash=tx_hash,
            status=TransactionStatus.FAILED,
            error_message="Timeout"
        )
        
    except Exception as e:
        logger.error(f"Error in wait_for_transaction_confirmation: {str(e)}")
        result.status = TransactionStatus.FAILED
        result.error_message = str(e)

# 内部函数：部署智能合约
async def deploy_contract(network_name: str, contract_name: str, contract_code: str, 
                         constructor_params: Optional[Dict[str, Any]] = None, 
                         gas_limit: Optional[int] = None, gas_price: Optional[float] = None) -> DeployContractResult:
    """部署智能合约"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"Network not connected: {network_name}"
            )
        
        # 获取部署账户私钥
        private_key = config_manager.get(f'blockchain.{network_name}.private_key')
        if not private_key:
            logger.error(f"No private key configured for network: {network_name}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"No private key configured for network: {network_name}"
            )
        
        # 获取部署账户地址
        acct = eth_account.Account.from_key(private_key)
        deployer_address = acct.address
        
        # 编译合约（这里简化处理，实际应用中可能需要更复杂的编译逻辑）
        try:
            # 设置solc编译器版本
            solcx.set_solc_version('0.8.0')
            
            # 编译合约
            compiled_sol = solcx.compile_source(
                contract_code,
                output_values=['abi', 'bin']
            )
            
            # 获取合约接口和字节码
            contract_interface = list(compiled_sol.values())[0]
            contract_abi = contract_interface['abi']
            contract_bytecode = contract_interface['bin']
            
        except Exception as e:
            logger.error(f"Error compiling contract: {str(e)}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"Error compiling contract: {str(e)}"
            )
        
        # 创建合约对象
        Contract = w3.eth.contract(abi=contract_abi, bytecode=contract_bytecode)
        
        # 准备部署交易
        tx_params = {
            'from': deployer_address,
            'nonce': w3.eth.getTransactionCount(deployer_address)
        }
        
        # 设置gas limit
        if gas_limit:
            tx_params['gas'] = gas_limit
        else:
            # 估算gas limit
            try:
                if constructor_params:
                    # 如果有构造函数参数
                    tx_params['gas'] = Contract.constructor(**constructor_params).estimateGas(tx_params)
                else:
                    # 如果没有构造函数参数
                    tx_params['gas'] = Contract.constructor().estimateGas(tx_params)
                # 添加10%的安全边际
                tx_params['gas'] = int(tx_params['gas'] * 1.1)
            except Exception as e:
                logger.warning(f"Failed to estimate gas, using default: {str(e)}")
                tx_params['gas'] = 5000000  # 默认gas limit
        
        # 设置gas price
        if gas_price:
            tx_params['gasPrice'] = w3.toWei(gas_price, 'gwei')
        else:
            # 使用网络当前gas price
            tx_params['gasPrice'] = w3.eth.gasPrice
        
        # 构建交易
        try:
            if constructor_params:
                # 如果有构造函数参数
                tx = Contract.constructor(**constructor_params).buildTransaction(tx_params)
            else:
                # 如果没有构造函数参数
                tx = Contract.constructor().buildTransaction(tx_params)
        except Exception as e:
            logger.error(f"Error building deployment transaction: {str(e)}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"Error building deployment transaction: {str(e)}"
            )
        
        # 签名交易
        try:
            signed_tx = acct.sign_transaction(tx)
        except Exception as e:
            logger.error(f"Error signing deployment transaction: {str(e)}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"Error signing deployment transaction: {str(e)}"
            )
        
        # 发送交易
        try:
            tx_hash = w3.eth.sendRawTransaction(signed_tx.rawTransaction)
            tx_hash_hex = w3.toHex(tx_hash)
            logger.info(f"Contract deployment transaction sent: {tx_hash_hex}")
        except Exception as e:
            logger.error(f"Error sending deployment transaction: {str(e)}")
            return DeployContractResult(
                tx_hash="",
                contract_address=None,
                status=TransactionStatus.FAILED,
                network_name=network_name,
                contract_name=contract_name,
                error_message=f"Error sending deployment transaction: {str(e)}"
            )
        
        # 创建部署结果
        result = DeployContractResult(
            tx_hash=tx_hash_hex,
            contract_address=None,
            status=TransactionStatus.PENDING,
            network_name=network_name,
            contract_name=contract_name
        )
        
        # 记录审计日志
        audit_logger.log_contract_deployment(
            tx_hash=tx_hash_hex,
            network_name=network_name,
            contract_name=contract_name,
            deployer_address=deployer_address,
            status=TransactionStatus.PENDING
        )
        
        # 等待交易确认并获取合约地址
        await wait_for_deployment_confirmation(network_name, tx_hash_hex, result, contract_abi)
        
        return result
    except Exception as e:
        logger.error(f"Error in deploy_contract: {str(e)}")
        return DeployContractResult(
            tx_hash="",
            contract_address=None,
            status=TransactionStatus.FAILED,
            network_name=network_name,
            contract_name=contract_name,
            error_message=str(e)
        )

# 异步函数：等待合约部署确认
async def wait_for_deployment_confirmation(network_name: str, tx_hash: str, result: DeployContractResult, abi: List[Dict[str, Any]], 
                                          timeout: int = 300) -> None:
    """等待合约部署确认并获取合约地址"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            result.status = TransactionStatus.FAILED
            result.error_message = f"Network not connected: {network_name}"
            return
        
        # 等待交易确认，最多等待timeout秒
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # 获取交易收据
                receipt = w3.eth.getTransactionReceipt(tx_hash)
                if receipt:
                    # 交易已确认
                    
                    # 检查交易状态
                    if receipt['status'] == 1:
                        # 交易成功，获取合约地址
                        contract_address = receipt['contractAddress']
                        result.contract_address = contract_address
                        result.status = TransactionStatus.CONFIRMED
                        logger.info(f"Contract deployed successfully: {contract_address}, Tx: {tx_hash}")
                        
                        # 添加合约到Web3管理器
                        web3_manager.add_contract(result.contract_name, network_name, contract_address, abi)
                        
                        # 发布合约部署事件到消息队列
                        mq_client.publish_message(QUEUE_SMART_CONTRACT_EVENTS, {
                            "event_type": "CONTRACT_DEPLOYED",
                            "tx_hash": tx_hash,
                            "contract_address": contract_address,
                            "contract_name": result.contract_name,
                            "network_name": network_name,
                            "timestamp": int(time.time())
                        })
                    else:
                        # 交易失败
                        result.status = TransactionStatus.REVERTED
                        logger.error(f"Contract deployment reverted: {tx_hash}")
                    
                    # 更新审计日志
                    audit_logger.update_contract_deployment_status(
                        tx_hash=tx_hash,
                        status=result.status,
                        contract_address=result.contract_address
                    )
                    
                    return
                
                # 等待1秒后重试
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error checking deployment status: {str(e)}")
                await asyncio.sleep(1)
        
        # 部署超时
        result.status = TransactionStatus.FAILED
        result.error_message = "Contract deployment timeout"
        logger.error(f"Contract deployment timeout: {tx_hash}")
        
        # 更新审计日志
        audit_logger.update_contract_deployment_status(
            tx_hash=tx_hash,
            status=TransactionStatus.FAILED,
            error_message="Timeout"
        )
        
    except Exception as e:
        logger.error(f"Error in wait_for_deployment_confirmation: {str(e)}")
        result.status = TransactionStatus.FAILED
        result.error_message = str(e)

# 内部函数：调用合约只读方法
def call_contract_function(network_name: str, contract_name: str, function_name: str, 
                           params: Dict[str, Any]) -> Any:
    """调用合约只读方法"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            raise Exception(f"Network not connected: {network_name}")
        
        # 获取合约实例
        contract = web3_manager.get_contract(contract_name, network_name)
        if not contract:
            logger.error(f"Contract not found: {contract_name} on network: {network_name}")
            raise Exception(f"Contract not found: {contract_name}")
        
        # 检查合约函数是否存在
        if not hasattr(contract.functions, function_name):
            logger.error(f"Contract function not found: {function_name}")
            raise Exception(f"Contract function not found: {function_name}")
        
        # 获取合约函数
        contract_function = getattr(contract.functions, function_name)
        
        # 准备函数调用参数
        try:
            # 如果params是字典，使用关键字参数
            if isinstance(params, dict):
                call_function = contract_function(**params)
            # 如果params是列表，使用位置参数
            elif isinstance(params, list):
                call_function = contract_function(*params)
            else:
                call_function = contract_function(params)
        except Exception as e:
            logger.error(f"Error preparing contract function call: {str(e)}")
            raise Exception(f"Error preparing contract function call: {str(e)}")
        
        # 调用合约方法（只读调用）
        try:
            result = call_function.call()
            logger.info(f"Contract function called successfully: {function_name} on {contract_name}")
            return result
        except Exception as e:
            logger.error(f"Error calling contract function: {str(e)}")
            raise Exception(f"Error calling contract function: {str(e)}")
    except Exception as e:
        logger.error(f"Error in call_contract_function: {str(e)}")
        raise

# 内部函数：获取账户余额
def get_balance(network_name: str, address: str, token_address: Optional[str] = None) -> BalanceResponse:
    """获取账户余额"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            raise Exception(f"Network not connected: {network_name}")
        
        # 检查地址格式
        if not Web3.isAddress(address):
            logger.error(f"Invalid address format: {address}")
            raise Exception(f"Invalid address format: {address}")
        
        # 获取地址的校验和格式
        checksum_address = Web3.toChecksumAddress(address)
        
        if token_address:
            # 获取ERC20代币余额
            
            # 检查代币地址格式
            if not Web3.isAddress(token_address):
                logger.error(f"Invalid token address format: {token_address}")
                raise Exception(f"Invalid token address format: {token_address}")
            
            # 创建代币合约实例
            # 简化的ERC20 ABI，只包含获取余额和代币信息的方法
            erc20_abi = [
                {"constant": True, "inputs": [], "name": "name", "outputs": [{"name": "", "type": "string"}], "payable": False, "stateMutability": "view", "type": "function"},
                {"constant": True, "inputs": [], "name": "symbol", "outputs": [{"name": "", "type": "string"}], "payable": False, "stateMutability": "view", "type": "function"},
                {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "payable": False, "stateMutability": "view", "type": "function"},
                {"constant": True, "inputs": [{"name": "", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "payable": False, "stateMutability": "view", "type": "function"}
            ]
            
            token_contract = w3.eth.contract(address=Web3.toChecksumAddress(token_address), abi=erc20_abi)
            
            # 获取余额
            balance_wei = token_contract.functions.balanceOf(checksum_address).call()
            
            # 获取代币信息
            try:
                symbol = token_contract.functions.symbol().call()
                decimals = token_contract.functions.decimals().call()
            except Exception as e:
                logger.warning(f"Failed to get token info, using defaults: {str(e)}")
                symbol = "TOKEN"
                decimals = 18
            
            # 转换余额为可读格式
            balance = str(w3.fromWei(balance_wei, 'ether'))
            
        else:
            # 获取原生代币（ETH/BTC等）余额
            balance_wei = w3.eth.getBalance(checksum_address)
            
            # 根据网络确定代币符号
            if network_name.lower() in ['mainnet', 'kovan', 'rinkeby', 'ropsten', 'goerli']:
                symbol = "ETH"
            elif network_name.lower() in ['bscmain', 'bsctest']:
                symbol = "BNB"
            else:
                symbol = "COIN"
            
            decimals = 18
            
            # 转换余额为可读格式
            balance = str(w3.fromWei(balance_wei, 'ether'))
        
        logger.info(f"Retrieved balance for address {address} on network {network_name}")
        
        return BalanceResponse(
            network_name=network_name,
            address=address,
            balance=balance,
            symbol=symbol,
            decimals=decimals
        )
    except Exception as e:
        logger.error(f"Error in get_balance: {str(e)}")
        raise

# 内部函数：获取合约事件
def get_contract_events(network_name: str, contract_name: str, event_name: str, 
                        from_block: Optional[int] = None, to_block: Optional[int] = None, 
                        filters: Optional[Dict[str, Any]] = None) -> List[ContractEvent]:
    """获取智能合约事件"""
    try:
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            raise Exception(f"Network not connected: {network_name}")
        
        # 获取合约实例
        contract = web3_manager.get_contract(contract_name, network_name)
        if not contract:
            logger.error(f"Contract not found: {contract_name} on network: {network_name}")
            raise Exception(f"Contract not found: {contract_name}")
        
        # 检查合约事件是否存在
        if event_name not in contract.events:
            logger.error(f"Contract event not found: {event_name}")
            raise Exception(f"Contract event not found: {event_name}")
        
        # 设置区块范围
        if from_block is None:
            from_block = 0
        
        if to_block is None:
            to_block = 'latest'
        
        # 获取事件过滤器
        event_filter = getattr(contract.events, event_name).createFilter(
            fromBlock=from_block,
            toBlock=to_block,
            argument_filters=filters or {}
        )
        
        # 获取事件日志
        events = event_filter.get_all_entries()
        
        # 转换为ContractEvent模型
        result_events = []
        for event in events:
            # 转换事件参数格式
            args = {}
            for key, value in event['args'].items():
                # 转换地址格式
                if isinstance(value, str) and Web3.isAddress(value):
                    args[key] = value.lower()
                # 转换大数为字符串
                elif hasattr(value, 'hex'):
                    args[key] = value.hex()
                else:
                    args[key] = value
            
            # 获取区块时间戳
            try:
                block = w3.eth.getBlock(event['blockNumber'])
                timestamp = block['timestamp']
            except:
                timestamp = int(time.time())
            
            result_events.append(ContractEvent(
                event_name=event_name,
                contract_name=contract_name,
                network_name=network_name,
                block_number=event['blockNumber'],
                transaction_hash=Web3.toHex(event['transactionHash']),
                log_index=event['logIndex'],
                timestamp=timestamp,
                args=args
            ))
        
        logger.info(f"Retrieved {len(result_events)} events: {event_name} from {contract_name}")
        
        return result_events
    except Exception as e:
        logger.error(f"Error in get_contract_events: {str(e)}")
        raise

# 异步函数：监听合约事件
async def monitor_contract_events():
    """持续监听合约事件并发布到消息队列"""
    # 注意：这是一个简化的实现。在实际应用中，应该为每个合约和事件设置专门的监听器
    # 这里仅作为示例
    
    # 模拟监听逻辑
    while True:
        try:
            # 检查是否有新的连接和合约
            # 如果有，设置事件监听器
            
            # 每30秒检查一次
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"Error in monitor_contract_events: {str(e)}")
            await asyncio.sleep(5)

# 依赖项：获取当前用户
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> Dict[str, Any]:
    """获取当前已认证的用户"""
    try:
        # 在实际应用中，应该验证令牌并从数据库中获取用户信息
        # 这里返回示例数据
        return {
            "user_id": "user-12345",
            "email": "example@example.com",
            "role": "USER",
            "is_active": True
        }
    except Exception as e:
        logger.error(f"Error in get_current_user: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查智能合约服务健康状态"""
    # 检查消息队列连接
    mq_connected = mq_client.connected or mq_client.connect()
    
    # 检查Web3连接状态
    networks_status = {}
    for network_name in config_manager.get('blockchain.networks', []):
        if network_name in web3_manager.connections:
            networks_status[network_name] = "connected"
        else:
            networks_status[network_name] = "disconnected"
    
    # 总体健康状态
    overall_status = "up" if mq_connected and any(status == "connected" for status in networks_status.values()) else "down"
    
    return {
        "status": overall_status,
        "timestamp": int(time.time()),
        "message_queue_connected": mq_connected,
        "networks": networks_status,
        "contracts_count": len(web3_manager.contracts)
    }

# API端点：验证签名
@app.post("/api/contracts/verify-signature", tags=["Signature"], response_model=SignatureVerificationResult)
async def verify_signature_endpoint(request: SignatureVerificationRequest):
    """验证以太坊消息签名"""
    try:
        logger.info("Received signature verification request")
        
        # 验证签名
        result = verify_signature(request.message, request.signature, request.address)
        
        # 记录审计日志
        audit_logger.log_signature_verification(
            address=request.address,
            is_valid=result.is_valid
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in verify_signature_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify signature")

# API端点：发送交易
@app.post("/api/contracts/transact", tags=["Transactions"], response_model=TransactionResult)
async def transact_endpoint(request: TransactionRequest):
    """发送交易到智能合约"""
    try:
        logger.info(f"Received transaction request: {request.contract_name}.{request.function_name}")
        
        # 发送交易
        result = send_transaction(
            network_name=request.network_name,
            contract_name=request.contract_name,
            function_name=request.function_name,
            params=request.params,
            value=request.value,
            gas_limit=request.gas_limit,
            gas_price=request.gas_price
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in transact_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send transaction: {str(e)}")

# API端点：获取交易状态
@app.get("/api/contracts/transactions/{tx_hash}", tags=["Transactions"])
async def get_transaction_status(tx_hash: str, network_name: str):
    """获取交易状态"""
    try:
        logger.info(f"Fetching transaction status: {tx_hash}")
        
        # 获取Web3连接
        w3 = web3_manager.get_connection(network_name)
        if not w3:
            logger.error(f"Network not connected: {network_name}")
            raise HTTPException(status_code=500, detail=f"Network not connected: {network_name}")
        
        # 获取交易信息
        try:
            tx = w3.eth.getTransaction(tx_hash)
            if not tx:
                raise HTTPException(status_code=404, detail="Transaction not found")
            
            # 获取交易收据
            receipt = w3.eth.getTransactionReceipt(tx_hash)
            
            # 构建响应
            response = {
                "tx_hash": tx_hash,
                "network_name": network_name,
                "from_address": tx['from'],
                "to_address": tx['to'],
                "value": str(w3.fromWei(tx['value'], 'ether')),
                "gas": tx['gas'],
                "gas_price": str(w3.fromWei(tx['gasPrice'], 'gwei')) + " gwei",
                "nonce": tx['nonce'],
                "block_number": tx['blockNumber'] if tx['blockNumber'] else None,
                "timestamp": int(time.time())
            }
            
            # 添加收据信息
            if receipt:
                response["status"] = "confirmed" if receipt['status'] == 1 else "reverted"
                response["block_number"] = receipt['blockNumber']
                response["gas_used"] = receipt['gasUsed']
                response["contract_address"] = receipt.get('contractAddress')
            else:
                response["status"] = "pending"
            
            return response
        except web3.exceptions.ContractLogicError as e:
            logger.error(f"Contract logic error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Contract error: {str(e)}")
        except Exception as e:
            logger.error(f"Error fetching transaction status: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch transaction status: {str(e)}")
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"Error in get_transaction_status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch transaction status")

# API端点：部署合约
@app.post("/api/contracts/deploy", tags=["Contracts"], response_model=DeployContractResult)
async def deploy_contract_endpoint(request: DeployContractRequest):
    """部署智能合约"""
    try:
        logger.info(f"Received contract deployment request: {request.contract_name}")
        
        # 部署合约
        result = await deploy_contract(
            network_name=request.network_name,
            contract_name=request.contract_name,
            contract_code=request.contract_code,
            constructor_params=request.constructor_params,
            gas_limit=request.gas_limit,
            gas_price=request.gas_price
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in deploy_contract_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to deploy contract: {str(e)}")

# API端点：调用合约只读方法
@app.post("/api/contracts/call", tags=["Contracts"])
async def call_contract_endpoint(request: CallContractRequest):
    """调用合约只读方法"""
    try:
        logger.info(f"Received contract call request: {request.contract_name}.{request.function_name}")
        
        # 调用合约方法
        result = call_contract_function(
            network_name=request.network_name,
            contract_name=request.contract_name,
            function_name=request.function_name,
            params=request.params
        )
        
        return {
            "status": "success",
            "result": result,
            "contract_name": request.contract_name,
            "function_name": request.function_name,
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in call_contract_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to call contract function: {str(e)}")

# API端点：获取账户余额
@app.post("/api/contracts/balance", tags=["Accounts"], response_model=BalanceResponse)
async def get_balance_endpoint(request: GetBalanceRequest):
    """获取账户余额"""
    try:
        logger.info(f"Received balance request for address: {request.address}")
        
        # 获取余额
        result = get_balance(
            network_name=request.network_name,
            address=request.address,
            token_address=request.token_address
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in get_balance_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get balance: {str(e)}")

# API端点：获取合约事件
@app.post("/api/contracts/events", tags=["Events"], response_model=List[ContractEvent])
async def get_events_endpoint(request: EventFilterRequest):
    """获取智能合约事件"""
    try:
        logger.info(f"Received events request: {request.contract_name}.{request.event_name}")
        
        # 获取合约事件
        events = get_contract_events(
            network_name=request.network_name,
            contract_name=request.contract_name,
            event_name=request.event_name,
            from_block=request.from_block,
            to_block=request.to_block,
            filters=request.filters
        )
        
        return events
    except Exception as e:
        logger.error(f"Error in get_events_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get contract events: {str(e)}")

# API端点：添加合约
@app.post("/api/contracts/add", tags=["Contracts"])
async def add_contract_endpoint(network_name: str, contract_name: str, address: str, abi: List[Dict[str, Any]], 
                               user: Dict[str, Any] = Depends(get_current_user)):
    """添加智能合约"""
    try:
        # 检查用户权限（简化实现）
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        logger.info(f"Adding contract: {contract_name} at address: {address}")
        
        # 添加合约
        success = web3_manager.add_contract(contract_name, network_name, address, abi)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add contract")
        
        # 记录审计日志
        audit_logger.log_contract_addition(
            contract_name=contract_name,
            contract_address=address,
            network_name=network_name,
            user_id=user["user_id"]
        )
        
        return {
            "status": "success",
            "message": "Contract added successfully",
            "contract_name": contract_name,
            "contract_address": address,
            "network_name": network_name,
            "timestamp": int(time.time())
        }
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"Error in add_contract_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add contract")

# API端点：连接网络
@app.post("/api/contracts/connect-network", tags=["Networks"])
async def connect_network_endpoint(network_name: str, rpc_url: str, user: Dict[str, Any] = Depends(get_current_user)):
    """连接到区块链网络"""
    try:
        # 检查用户权限（简化实现）
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        logger.info(f"Connecting to network: {network_name}")
        
        # 连接网络
        success = web3_manager.connect(network_name, rpc_url)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to connect to network")
        
        # 记录审计日志
        audit_logger.log_network_connection(
            network_name=network_name,
            rpc_url=rpc_url,
            user_id=user["user_id"]
        )
        
        return {
            "status": "success",
            "message": "Connected to network successfully",
            "network_name": network_name,
            "rpc_url": rpc_url,
            "timestamp": int(time.time())
        }
    except HTTPException as e:
        raise
    except Exception as e:
        logger.error(f"Error in connect_network_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to connect to network")

# API端点：获取合约列表
@app.get("/api/contracts", tags=["Contracts"])
async def get_contracts():
    """获取所有添加的合约"""
    try:
        logger.info("Fetching contract list")
        
        # 构建合约列表
        contracts = []
        for key, contract in web3_manager.contracts.items():
            network_name, contract_name = key.split(":", 1)
            contracts.append({
                "contract_name": contract_name,
                "network_name": network_name,
                "contract_address": contract.address
            })
        
        return {
            "status": "success",
            "contracts": contracts,
            "total_contracts": len(contracts),
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in get_contracts: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch contracts")

# API端点：获取连接的网络
@app.get("/api/contracts/networks", tags=["Networks"])
async def get_networks():
    """获取所有连接的网络"""
    try:
        logger.info("Fetching network list")
        
        # 构建网络列表
        networks = []
        for network_name, w3 in web3_manager.connections.items():
            networks.append({
                "network_name": network_name,
                "is_connected": w3.isConnected()
            })
        
        return {
            "status": "success",
            "networks": networks,
            "total_networks": len(networks),
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in get_networks: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch networks")

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Smart Contract Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 从配置加载区块链网络
    blockchain_config = config_manager.get('blockchain', {})
    networks = blockchain_config.get('networks', [])
    
    for network_name in networks:
        rpc_url = blockchain_config.get(f'{network_name}.rpc_url')
        if rpc_url:
            logger.info(f"Connecting to network: {network_name}")
            web3_manager.connect(network_name, rpc_url)
        
        # 加载网络上的合约
        contracts = blockchain_config.get(f'{network_name}.contracts', {})
        for contract_name, contract_info in contracts.items():
            address = contract_info.get('address')
            abi = contract_info.get('abi')
            if address and abi:
                logger.info(f"Loading contract: {contract_name} on network: {network_name}")
                web3_manager.add_contract(contract_name, network_name, address, abi)
    
    # 启动事件监听任务
    loop = asyncio.get_event_loop()
    loop.create_task(monitor_contract_events())
    
    logger.info("Smart Contract Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Smart Contract Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    # 关闭区块链连接
    web3_manager.close()
    
    logger.info("Smart Contract Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('smart_contract_service.host', '0.0.0.0')
    port = config_manager.get('smart_contract_service.port', 8007)
    
    logger.info(f"Starting Smart Contract Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('smart_contract_service.workers', 1)  # 工作进程数
    )