from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
import uvicorn
import time
import web3
import asyncio
from web3 import Web3
import eth_account.messages
from eth_utils import to_bytes
from eth_account import Account

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_VERIFICATION_REQUESTS, QUEUE_VERIFICATION_RESULTS

# 初始化FastAPI应用
app = FastAPI(
    title="Order Verification Service",
    description="Service for verifying LeverageGuard smart contract orders",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Web3配置
WEB3_PROVIDER_URL = config_manager.get('web3.provider_url', 'http://localhost:8545')
CONTRACT_ADDRESS = config_manager.get('contract.address', '')
CONTRACT_ABI = config_manager.get('contract.abi', [])

# 安全配置
MAX_LEVERAGE_RATIO = config_manager.get('security.max_leverage_ratio', 20.0)
MAX_ORDER_SIZE = config_manager.get('security.max_order_size', 1000000)
MIN_COLLATERAL_RATIO = config_manager.get('security.min_collateral_ratio', 0.05)
ALLOWED_TOKENS = config_manager.get('security.allowed_tokens', [])

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

# 订单验证模型
class Order(BaseModel):
    order_id: str = Field(..., description="Unique order identifier")
    user_address: str = Field(..., description="User wallet address")
    token_pair: str = Field(..., description="Trading token pair")
    leverage: float = Field(..., description="Leverage ratio")
    collateral: float = Field(..., description="Collateral amount")
    order_size: float = Field(..., description="Total order size")
    order_type: str = Field(..., description="Order type (market/limit)")
    price: Optional[float] = Field(None, description="Limit price for limit orders")
    timestamp: int = Field(..., description="Order creation timestamp")
    signature: str = Field(..., description="User signature for order validation")

    @validator('user_address')
    def validate_user_address(cls, v):
        """验证用户地址格式"""
        if not Web3.isAddress(v):
            raise ValueError("Invalid Ethereum address")
        return v.lower()

    @validator('leverage')
    def validate_leverage(cls, v):
        """验证杠杆比例"""
        if v <= 0 or v > MAX_LEVERAGE_RATIO:
            raise ValueError(f"Leverage must be between 1 and {MAX_LEVERAGE_RATIO}")
        return v

    @validator('order_size')
    def validate_order_size(cls, v):
        """验证订单大小"""
        if v <= 0 or v > MAX_ORDER_SIZE:
            raise ValueError(f"Order size must be positive and less than {MAX_ORDER_SIZE}")
        return v

    @validator('collateral')
    def validate_collateral(cls, v):
        """验证抵押金额"""
        if v <= 0:
            raise ValueError("Collateral must be positive")
        return v

# 验证结果模型
class VerificationResult(BaseModel):
    order_id: str
    is_valid: bool
    reason: Optional[str] = None
    risk_score: Optional[float] = None
    collateral_ratio: Optional[float] = None
    timestamp: int
    processed_by: str = "order_verification_service"

# 内部函数：验证订单签名
def verify_signature(order: Order) -> bool:
    """验证订单签名是否有效"""
    try:
        # 构建消息体用于签名验证
        message_data = {
            'order_id': order.order_id,
            'user_address': order.user_address,
            'token_pair': order.token_pair,
            'leverage': order.leverage,
            'collateral': order.collateral,
            'order_size': order.order_size,
            'timestamp': order.timestamp
        }
        
        # 将消息序列化为字符串
        message_str = str(message_data)
        
        # 构建EIP-191兼容的消息
        encoded_message = eth_account.messages.encode_defunct(text=message_str)
        
        # 验证签名
        recovered_address = Account.recover_message(encoded_message, signature=order.signature)
        
        # 比较恢复的地址和订单中的用户地址
        return recovered_address.lower() == order.user_address.lower()
    except Exception as e:
        logger.error(f"Error verifying signature: {str(e)}")
        return False

# 内部函数：计算风险评分
def calculate_risk_score(order: Order) -> float:
    """计算订单的风险评分（0-100，分数越高风险越大）"""
    risk_score = 0.0
    
    # 杠杆风险（占40%）
    leverage_ratio = order.leverage / MAX_LEVERAGE_RATIO
    risk_score += leverage_ratio * 40.0
    
    # 订单大小风险（占30%）
    size_ratio = min(order.order_size / MAX_ORDER_SIZE, 1.0)
    risk_score += size_ratio * 30.0
    
    # 抵押率风险（占30%）
    # 计算实际抵押率：抵押金额 / (订单大小 / 杠杆) = 抵押金额 * 杠杆 / 订单大小
    actual_collateral_ratio = order.collateral * order.leverage / order.order_size
    # 抵押率低于最小值的风险
    if actual_collateral_ratio < MIN_COLLATERAL_RATIO:
        collateral_risk = 1.0 - (actual_collateral_ratio / MIN_COLLATERAL_RATIO)
        risk_score += collateral_risk * 30.0
    
    # 确保分数在0-100范围内
    return min(max(risk_score, 0.0), 100.0)

# 内部函数：执行全面的订单验证
def verify_order(order: Order) -> VerificationResult:
    """执行订单的全面验证"""
    # 记录验证开始
    logger.info(f"Starting verification for order: {order.order_id}")
    
    # 验证签名
    if not verify_signature(order):
        logger.warning(f"Order {order.order_id} failed signature verification")
        return VerificationResult(
            order_id=order.order_id,
            is_valid=False,
            reason="Invalid signature",
            timestamp=int(time.time())
        )
    
    # 验证杠杆比例
    if order.leverage > MAX_LEVERAGE_RATIO:
        logger.warning(f"Order {order.order_id} has excessive leverage: {order.leverage}")
        return VerificationResult(
            order_id=order.order_id,
            is_valid=False,
            reason=f"Leverage exceeds maximum of {MAX_LEVERAGE_RATIO}",
            timestamp=int(time.time())
        )
    
    # 验证抵押率
    actual_collateral_ratio = order.collateral * order.leverage / order.order_size
    if actual_collateral_ratio < MIN_COLLATERAL_RATIO:
        logger.warning(f"Order {order.order_id} has insufficient collateral ratio: {actual_collateral_ratio:.4f}")
        return VerificationResult(
            order_id=order.order_id,
            is_valid=False,
            reason=f"Collateral ratio ({actual_collateral_ratio:.4f}) below minimum of {MIN_COLLATERAL_RATIO}",
            collateral_ratio=actual_collateral_ratio,
            timestamp=int(time.time())
        )
    
    # 验证交易对
    if ALLOWED_TOKENS and order.token_pair not in ALLOWED_TOKENS:
        logger.warning(f"Order {order.order_id} uses unsupported token pair: {order.token_pair}")
        return VerificationResult(
            order_id=order.order_id,
            is_valid=False,
            reason=f"Unsupported token pair: {order.token_pair}",
            timestamp=int(time.time())
        )
    
    # 检查时间戳（防止重放攻击）
    current_time = time.time()
    time_diff = current_time - order.timestamp
    if time_diff > 300:  # 5分钟有效期
        logger.warning(f"Order {order.order_id} has expired: time difference {time_diff:.2f}s")
        return VerificationResult(
            order_id=order.order_id,
            is_valid=False,
            reason="Order has expired",
            timestamp=int(current_time)
        )
    
    # 计算风险评分
    risk_score = calculate_risk_score(order)
    
    # 验证通过
    logger.info(f"Order {order.order_id} verified successfully with risk score: {risk_score:.2f}")
    
    return VerificationResult(
        order_id=order.order_id,
        is_valid=True,
        reason="Verification successful",
        risk_score=risk_score,
        collateral_ratio=actual_collateral_ratio,
        timestamp=int(current_time)
    )

# 异步函数：处理队列中的验证请求
async def process_verification_queue():
    """从队列中获取验证请求并处理"""
    def callback(ch, method, properties, body):
        """队列消息处理回调函数"""
        try:
            # 解析订单数据
            import json
            order_data = json.loads(body)
            order = Order(**order_data)
            
            # 验证订单
            result = verify_order(order)
            
            # 发布验证结果到结果队列
            mq_client.publish_message(QUEUE_VERIFICATION_RESULTS, result.dict())
            
            # 记录审计日志
            audit_logger.log_order_verification(
                order_id=order.order_id,
                user_address=order.user_address,
                is_valid=result.is_valid,
                risk_score=result.risk_score,
                reason=result.reason
            )
            
            # 确认消息已处理
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            logger.error(f"Error processing verification request: {str(e)}")
            # 处理失败，将消息重新入队或死信队列
            try:
                # 可以设置重新入队的逻辑或死信队列处理
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except:
                pass
    
    # 消费队列消息
    mq_client.consume_messages(QUEUE_VERIFICATION_REQUESTS, callback)

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查订单验证服务健康状态"""
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

# API端点：验证订单（同步）
@app.post("/api/verify/order", tags=["Order Verification"], response_model=VerificationResult)
async def verify_order_endpoint(order: Order):
    """同步验证订单"""
    try:
        # 执行验证
        result = verify_order(order)
        
        # 记录审计日志
        audit_logger.log_order_verification(
            order_id=order.order_id,
            user_address=order.user_address,
            is_valid=result.is_valid,
            risk_score=result.risk_score,
            reason=result.reason
        )
        
        return result
    except Exception as e:
        logger.error(f"Error in verify_order_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：提交验证请求（异步）
@app.post("/api/verify/order/async", tags=["Order Verification"])
async def submit_verification_request(order: Order, background_tasks: BackgroundTasks):
    """异步提交订单验证请求"""
    try:
        # 将订单发布到消息队列
        order_dict = order.dict()
        success = mq_client.publish_message(QUEUE_VERIFICATION_REQUESTS, order_dict)
        
        if success:
            logger.info(f"Order verification request submitted: {order.order_id}")
            
            # 记录审计日志
            audit_logger.log_verification_request(
                order_id=order.order_id,
                user_address=order.user_address
            )
            
            return {
                "status": "success",
                "message": "Verification request submitted successfully",
                "order_id": order.order_id,
                "timestamp": int(time.time())
            }
        else:
            logger.error(f"Failed to submit verification request: {order.order_id}")
            raise HTTPException(status_code=500, detail="Failed to submit verification request")
    except Exception as e:
        logger.error(f"Error in submit_verification_request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：获取验证结果
@app.get("/api/verify/result/{order_id}", tags=["Order Verification"])
async def get_verification_result(order_id: str):
    """获取订单验证结果（简化实现，实际应用中应查询数据库）"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询验证结果
    # 这里返回一个示例响应
    return {
        "order_id": order_id,
        "status": "pending",
        "message": "This is a placeholder response. In production, this should query a database.",
        "timestamp": int(time.time())
    }

# API端点：获取合约信息
@app.get("/api/contract/info", tags=["Contract"])
async def get_contract_info():
    """获取智能合约信息"""
    if not contract:
        raise HTTPException(status_code=503, detail="Contract not initialized")
    
    try:
        # 获取合约基本信息
        # 注意：这里假设合约有这些方法，实际应用中需要根据合约ABI调整
        # balance = contract.functions.getBalance().call()
        # total_supply = contract.functions.totalSupply().call()
        
        return {
            "address": CONTRACT_ADDRESS,
            "provider_url": WEB3_PROVIDER_URL,
            # "balance": balance,
            # "total_supply": total_supply,
            "connected": w3.isConnected(),
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error getting contract info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Order Verification Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 启动队列处理任务
    loop = asyncio.get_event_loop()
    loop.create_task(process_verification_queue())
    
    logger.info("Order Verification Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Order Verification Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("Order Verification Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('order_verification.host', '0.0.0.0')
    port = config_manager.get('order_verification.port', 8001)
    
    logger.info(f"Starting Order Verification Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('order_verification.workers', 1)  # 工作进程数
    )