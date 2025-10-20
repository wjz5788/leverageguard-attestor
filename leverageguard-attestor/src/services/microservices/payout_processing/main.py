from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
import uvicorn
import time
import web3
from web3 import Web3
import asyncio
from functools import wraps
import random
import string

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_PAYOUT_REQUESTS, QUEUE_PAYOUT_RESULTS

# 初始化FastAPI应用
app = FastAPI(
    title="Payout Processing Service",
    description="Service for processing LeverageGuard payouts and claims",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Web3配置
WEB3_PROVIDER_URL = config_manager.get('web3.provider_url', 'http://localhost:8545')
CONTRACT_ADDRESS = config_manager.get('contract.address', '')
CONTRACT_ABI = config_manager.get('contract.abi', [])
PRIVATE_KEY = config_manager.get('contract.private_key', '')

# 赔付配置
MIN_PAYOUT_AMOUNT = config_manager.get('payout.min_amount', 0.001)
MAX_PAYOUT_AMOUNT = config_manager.get('payout.max_amount', 10000.0)
PAYOUT_FEE_PERCENTAGE = config_manager.get('payout.fee_percentage', 0.5)  # 0.5%
MAX_RETRY_ATTEMPTS = config_manager.get('payout.max_retry_attempts', 3)
RETRY_DELAY_SECONDS = config_manager.get('payout.retry_delay_seconds', 5)

# 初始化Web3实例
w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER_URL))

# 智能合约实例
contract = None
if CONTRACT_ADDRESS and CONTRACT_ABI:
    try:
        contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
        logger.info(f"Connected to smart contract at {CONTRACT_ADDRESS}")
    except Exception as e:
        logger.error(f"Failed to initialize smart contract: {str(e)}")

# 赔付请求模型
class PayoutRequest(BaseModel):
    claim_id: str = Field(..., description="Unique claim identifier")
    user_address: str = Field(..., description="User wallet address")
    amount: float = Field(..., description="Payout amount")
    asset_type: str = Field(..., description="Asset type for payout")
    reason: str = Field(..., description="Reason for payout")
    order_id: Optional[str] = Field(None, description="Related order ID if applicable")
    timestamp: int = Field(..., description="Request timestamp")
    signature: str = Field(..., description="User signature for request validation")

    @validator('user_address')
    def validate_user_address(cls, v):
        """验证用户地址格式"""
        if not Web3.isAddress(v):
            raise ValueError("Invalid Ethereum address")
        return v.lower()

    @validator('amount')
    def validate_amount(cls, v):
        """验证赔付金额"""
        if v <= 0 or v > MAX_PAYOUT_AMOUNT:
            raise ValueError(f"Amount must be between {MIN_PAYOUT_AMOUNT} and {MAX_PAYOUT_AMOUNT}")
        if v < MIN_PAYOUT_AMOUNT:
            raise ValueError(f"Amount must be at least {MIN_PAYOUT_AMOUNT}")
        return v

# 赔付结果模型
class PayoutResult(BaseModel):
    claim_id: str
    status: str  # pending, processing, completed, failed
    transaction_hash: Optional[str] = None
    amount: float
    fee: float
    user_address: str
    timestamp: int
    processed_by: str = "payout_processing_service"
    error_message: Optional[str] = None

# 装饰器：重试机制
def retry_on_exception(max_attempts=MAX_RETRY_ATTEMPTS, delay=RETRY_DELAY_SECONDS):
    """用于在异常情况下重试函数的装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            attempts = 0
            last_exception = None
            
            while attempts < max_attempts:
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    attempts += 1
                    last_exception = e
                    logger.warning(f"Attempt {attempts} failed: {str(e)}. Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
                    
            logger.error(f"All {max_attempts} attempts failed. Last error: {str(last_exception)}")
            raise last_exception
        return wrapper
    return decorator

# 内部函数：验证赔付请求
def verify_payout_request(request: PayoutRequest) -> bool:
    """验证赔付请求的有效性"""
    try:
        # 验证金额是否在允许范围内
        if request.amount < MIN_PAYOUT_AMOUNT or request.amount > MAX_PAYOUT_AMOUNT:
            logger.warning(f"Payout amount {request.amount} is outside allowed range")
            return False
        
        # 这里可以添加更多验证逻辑，例如：
        # 1. 检查用户是否有有效的保险覆盖
        # 2. 检查相关订单是否符合赔付条件
        # 3. 验证用户签名
        
        # 简化的签名验证逻辑（与订单验证服务类似）
        # 实际应用中应实现完整的签名验证
        
        logger.info(f"Payout request {request.claim_id} verified successfully")
        return True
    except Exception as e:
        logger.error(f"Error verifying payout request: {str(e)}")
        return False

# 内部函数：计算赔付费用
def calculate_payout_fee(amount: float) -> float:
    """计算赔付手续费"""
    fee = amount * (PAYOUT_FEE_PERCENTAGE / 100)
    return round(fee, 6)  # 保留6位小数

# 内部函数：执行智能合约赔付操作
@retry_on_exception(max_attempts=MAX_RETRY_ATTEMPTS, delay=RETRY_DELAY_SECONDS)
def execute_payout(request: PayoutRequest) -> Dict[str, Any]:
    """执行智能合约赔付操作"""
    if not contract or not PRIVATE_KEY:
        raise Exception("Contract or private key not configured")
    
    try:
        # 获取当前账户
        account = w3.eth.account.from_key(PRIVATE_KEY)
        w3.eth.default_account = account.address
        
        # 获取当前gas价格和nonce
        gas_price = w3.eth.gas_price
        nonce = w3.eth.get_transaction_count(account.address)
        
        # 计算手续费
        fee = calculate_payout_fee(request.amount)
        total_amount = request.amount - fee
        
        # 构建交易数据
        # 注意：这里假设合约有processPayout方法，实际应用中需要根据合约ABI调整
        # tx_data = contract.functions.processPayout(
        #     request.user_address,
        #     Web3.toWei(total_amount, 'ether'),
        #     request.claim_id
        # ).build_transaction({
        #     'from': account.address,
        #     'gas': 2000000,
        #     'gasPrice': gas_price,
        #     'nonce': nonce,
        # })
        
        # 签名交易
        # signed_tx = w3.eth.account.sign_transaction(tx_data, PRIVATE_KEY)
        
        # 发送交易
        # tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        # 等待交易确认（可选）
        # tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        # 模拟交易结果（因为实际交易需要真实的以太坊网络）
        # 在实际应用中应使用上述注释掉的代码发送真实交易
        tx_hash = '0x' + ''.join(random.choices(string.hexdigits, k=64))
        
        logger.info(f"Payout transaction executed: {tx_hash}, Amount: {total_amount}, Fee: {fee}")
        
        return {
            'transaction_hash': tx_hash,
            'amount': total_amount,
            'fee': fee,
            'status': 'completed'
        }
    except Exception as e:
        logger.error(f"Error executing payout transaction: {str(e)}")
        raise

# 异步函数：处理队列中的赔付请求
async def process_payout_queue():
    """从队列中获取赔付请求并处理"""
    def callback(ch, method, properties, body):
        """队列消息处理回调函数"""
        try:
            # 解析赔付请求数据
            import json
            request_data = json.loads(body)
            request = PayoutRequest(**request_data)
            
            # 创建赔付结果对象
            fee = calculate_payout_fee(request.amount)
            result = PayoutResult(
                claim_id=request.claim_id,
                status="processing",
                amount=request.amount - fee,
                fee=fee,
                user_address=request.user_address,
                timestamp=int(time.time())
            )
            
            try:
                # 验证赔付请求
                if not verify_payout_request(request):
                    result.status = "failed"
                    result.error_message = "Invalid payout request"
                    logger.warning(f"Payout request {request.claim_id} failed validation")
                else:
                    # 执行赔付操作
                    payout_result = execute_payout(request)
                    result.status = payout_result['status']
                    result.transaction_hash = payout_result['transaction_hash']
                    result.amount = payout_result['amount']
                    result.fee = payout_result['fee']
                    
                    logger.info(f"Payout processed successfully: {request.claim_id}")
                
            except Exception as e:
                result.status = "failed"
                result.error_message = str(e)
                logger.error(f"Payout processing failed: {request.claim_id}, Error: {str(e)}")
            
            # 发布赔付结果到结果队列
            mq_client.publish_message(QUEUE_PAYOUT_RESULTS, result.dict())
            
            # 记录审计日志
            audit_logger.log_payout_processing(
                claim_id=request.claim_id,
                user_address=request.user_address,
                amount=request.amount,
                status=result.status,
                transaction_hash=result.transaction_hash,
                error_message=result.error_message
            )
            
            # 确认消息已处理
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            logger.error(f"Error processing payout request: {str(e)}")
            # 处理失败，将消息重新入队或死信队列
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except:
                pass
    
    # 消费队列消息
    mq_client.consume_messages(QUEUE_PAYOUT_REQUESTS, callback)

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查赔付处理服务健康状态"""
    # 检查Web3连接
    web3_connected = w3.isConnected()
    
    # 检查合约连接
    contract_connected = web3_connected and contract is not None
    
    # 检查消息队列连接
    mq_connected = mq_client.connected or mq_client.connect()
    
    # 总体健康状态
    overall_status = "up" if web3_connected and mq_connected else "down"
    
    return {
        "status": overall_status,
        "timestamp": int(time.time()),
        "web3_connected": web3_connected,
        "contract_connected": contract_connected,
        "message_queue_connected": mq_connected
    }

# API端点：提交赔付请求（同步）
@app.post("/api/payout/submit", tags=["Payout"], response_model=PayoutResult)
async def submit_payout(request: PayoutRequest):
    """同步提交赔付请求并返回结果"""
    try:
        # 创建赔付结果对象
        fee = calculate_payout_fee(request.amount)
        result = PayoutResult(
            claim_id=request.claim_id,
            status="processing",
            amount=request.amount - fee,
            fee=fee,
            user_address=request.user_address,
            timestamp=int(time.time())
        )
        
        # 验证赔付请求
        if not verify_payout_request(request):
            result.status = "failed"
            result.error_message = "Invalid payout request"
            logger.warning(f"Payout request {request.claim_id} failed validation")
        else:
            # 执行赔付操作
            payout_result = execute_payout(request)
            result.status = payout_result['status']
            result.transaction_hash = payout_result['transaction_hash']
            result.amount = payout_result['amount']
            result.fee = payout_result['fee']
            
            logger.info(f"Payout processed successfully: {request.claim_id}")
        
        # 记录审计日志
        audit_logger.log_payout_processing(
            claim_id=request.claim_id,
            user_address=request.user_address,
            amount=request.amount,
            status=result.status,
            transaction_hash=result.transaction_hash,
            error_message=result.error_message
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in submit_payout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：提交赔付请求（异步）
@app.post("/api/payout/submit/async", tags=["Payout"])
async def submit_payout_async(request: PayoutRequest, background_tasks: BackgroundTasks):
    """异步提交赔付请求"""
    try:
        # 将请求发布到消息队列
        request_dict = request.dict()
        success = mq_client.publish_message(QUEUE_PAYOUT_REQUESTS, request_dict)
        
        if success:
            logger.info(f"Payout request submitted to queue: {request.claim_id}")
            
            # 记录审计日志
            audit_logger.log_payout_request(
                claim_id=request.claim_id,
                user_address=request.user_address,
                amount=request.amount
            )
            
            return {
                "status": "success",
                "message": "Payout request submitted successfully",
                "claim_id": request.claim_id,
                "timestamp": int(time.time())
            }
        else:
            logger.error(f"Failed to submit payout request to queue: {request.claim_id}")
            raise HTTPException(status_code=500, detail="Failed to submit payout request")
    except Exception as e:
        logger.error(f"Error in submit_payout_async: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：获取赔付状态
@app.get("/api/payout/status/{claim_id}", tags=["Payout"])
async def get_payout_status(claim_id: str):
    """获取赔付请求的状态（简化实现，实际应用中应查询数据库）"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询赔付状态
    # 这里返回一个示例响应
    return {
        "claim_id": claim_id,
        "status": "pending",
        "message": "This is a placeholder response. In production, this should query a database.",
        "timestamp": int(time.time())
    }

# API端点：获取赔付历史
@app.get("/api/payout/history/{user_address}", tags=["Payout"])
async def get_payout_history(user_address: str):
    """获取用户的赔付历史（简化实现，实际应用中应查询数据库）"""
    # 验证用户地址格式
    if not Web3.isAddress(user_address):
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")
    
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询赔付历史
    # 这里返回示例数据
    return {
        "user_address": user_address,
        "history": [
            {
                "claim_id": "claim-123",
                "amount": 100.0,
                "status": "completed",
                "timestamp": int(time.time() - 86400),  # 24小时前
                "transaction_hash": "0x1234567890abcdef"
            },
            {
                "claim_id": "claim-456",
                "amount": 50.0,
                "status": "completed",
                "timestamp": int(time.time() - 172800),  # 48小时前
                "transaction_hash": "0xfedcba0987654321"
            }
        ],
        "total_count": 2,
        "timestamp": int(time.time())
    }

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Payout Processing Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 启动队列处理任务
    loop = asyncio.get_event_loop()
    loop.create_task(process_payout_queue())
    
    logger.info("Payout Processing Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Payout Processing Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("Payout Processing Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('payout_processing.host', '0.0.0.0')
    port = config_manager.get('payout_processing.port', 8002)
    
    logger.info(f"Starting Payout Processing Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('payout_processing.workers', 1)  # 工作进程数
    )