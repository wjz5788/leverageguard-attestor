from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any, Tuple
import uvicorn
import time
import web3
from web3 import Web3
import asyncio
from datetime import datetime, timedelta
import math

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_FUND_EVENTS, QUEUE_RISK_ALERTS

# 初始化FastAPI应用
app = FastAPI(
    title="Fund Management Service",
    description="Service for managing LeverageGuard funds, balances, and risk control",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Web3配置
WEB3_PROVIDER_URL = config_manager.get('web3.provider_url', 'http://localhost:8545')
CONTRACT_ADDRESS = config_manager.get('contract.address', '')
CONTRACT_ABI = config_manager.get('contract.abi', [])

# 资金池配置
MIN_RESERVE_RATIO = config_manager.get('funds.min_reserve_ratio', 0.2)  # 20%
MAX_EXPOSURE_RATIO = config_manager.get('funds.max_exposure_ratio', 0.8)  # 80%
MAX_SINGLE_PAYOUT_RATIO = config_manager.get('funds.max_single_payout_ratio', 0.05)  # 5%
DAILY_WITHDRAWAL_LIMIT = config_manager.get('funds.daily_withdrawal_limit', 100000.0)

# 风险阈值配置
RISK_THRESHOLD_HIGH = config_manager.get('risk.threshold_high', 0.7)  # 70%
RISK_THRESHOLD_MEDIUM = config_manager.get('risk.threshold_medium', 0.5)  # 50%

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

# 资金池模型
class FundPool(BaseModel):
    pool_id: str = Field(..., description="Unique pool identifier")
    total_balance: float = Field(..., description="Total balance in the pool")
    available_balance: float = Field(..., description="Available balance for operations")
    reserved_balance: float = Field(..., description="Reserved balance for obligations")
    asset_type: str = Field(..., description="Asset type of the pool")
    last_updated: int = Field(..., description="Last update timestamp")

# 资金转移请求模型
class FundTransfer(BaseModel):
    transfer_id: str = Field(..., description="Unique transfer identifier")
    from_pool: str = Field(..., description="Source fund pool")
    to_pool: str = Field(..., description="Target fund pool")
    amount: float = Field(..., description="Transfer amount")
    reason: str = Field(..., description="Reason for transfer")
    timestamp: int = Field(..., description="Transfer timestamp")

    @validator('amount')
    def validate_amount(cls, v):
        """验证转移金额"""
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

# 资金事件模型
class FundEvent(BaseModel):
    event_id: str = Field(..., description="Unique event identifier")
    event_type: str = Field(..., description="Event type (deposit, withdrawal, transfer, payout)")
    amount: float = Field(..., description="Amount involved")
    asset_type: str = Field(..., description="Asset type")
    source: str = Field(..., description="Source of funds")
    destination: str = Field(..., description="Destination of funds")
    timestamp: int = Field(..., description="Event timestamp")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

# 风险评估结果模型
class RiskAssessment(BaseModel):
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: int = Field(..., description="Assessment timestamp")
    exposure_ratio: float = Field(..., description="Current exposure ratio")
    reserve_ratio: float = Field(..., description="Current reserve ratio")
    risk_level: str = Field(..., description="Risk level (low, medium, high)")
    recommendations: List[str] = Field(..., description="Risk mitigation recommendations")
    fund_status: Dict[str, Any] = Field(..., description="Detailed fund status")

# 内部函数：获取资金池信息（简化实现）
def get_fund_pool(pool_id: str) -> Optional[FundPool]:
    """获取资金池信息"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询资金池信息
    # 这里返回示例数据
    if pool_id == "main_pool":
        return FundPool(
            pool_id=pool_id,
            total_balance=1000000.0,
            available_balance=800000.0,
            reserved_balance=200000.0,
            asset_type="ETH",
            last_updated=int(time.time())
        )
    elif pool_id == "payout_pool":
        return FundPool(
            pool_id=pool_id,
            total_balance=500000.0,
            available_balance=400000.0,
            reserved_balance=100000.0,
            asset_type="ETH",
            last_updated=int(time.time())
        )
    elif pool_id == "reserve_pool":
        return FundPool(
            pool_id=pool_id,
            total_balance=300000.0,
            available_balance=0.0,  # 准备金池通常不直接用于操作
            reserved_balance=300000.0,
            asset_type="ETH",
            last_updated=int(time.time())
        )
    else:
        logger.warning(f"Fund pool not found: {pool_id}")
        return None

# 内部函数：更新资金池信息（简化实现）
def update_fund_pool(pool: FundPool) -> bool:
    """更新资金池信息"""
    # 注意：这是一个简化的实现。在实际应用中，应该更新数据库中的资金池信息
    logger.info(f"Updating fund pool: {pool.pool_id}, Balance: {pool.total_balance}")
    return True

# 内部函数：执行资金转移
def execute_fund_transfer(transfer: FundTransfer) -> bool:
    """执行资金转移操作"""
    try:
        # 获取源资金池和目标资金池
        source_pool = get_fund_pool(transfer.from_pool)
        target_pool = get_fund_pool(transfer.to_pool)
        
        if not source_pool or not target_pool:
            logger.error(f"Source or target pool not found for transfer: {transfer.transfer_id}")
            return False
        
        # 检查源资金池是否有足够的可用余额
        if source_pool.available_balance < transfer.amount:
            logger.error(f"Insufficient funds in source pool: {transfer.from_pool}, Required: {transfer.amount}, Available: {source_pool.available_balance}")
            return False
        
        # 更新源资金池
        source_pool.available_balance -= transfer.amount
        source_pool.last_updated = int(time.time())
        update_fund_pool(source_pool)
        
        # 更新目标资金池
        target_pool.available_balance += transfer.amount
        target_pool.total_balance += transfer.amount
        target_pool.last_updated = int(time.time())
        update_fund_pool(target_pool)
        
        # 创建资金事件
        fund_event = FundEvent(
            event_id=f"event-{int(time.time())}-{transfer.transfer_id}",
            event_type="transfer",
            amount=transfer.amount,
            asset_type=source_pool.asset_type,
            source=transfer.from_pool,
            destination=transfer.to_pool,
            timestamp=int(time.time()),
            metadata={
                "transfer_id": transfer.transfer_id,
                "reason": transfer.reason
            }
        )
        
        # 发布资金事件到消息队列
        mq_client.publish_message(QUEUE_FUND_EVENTS, fund_event.dict())
        
        # 记录审计日志
        audit_logger.log_fund_transfer(
            transfer_id=transfer.transfer_id,
            from_pool=transfer.from_pool,
            to_pool=transfer.to_pool,
            amount=transfer.amount,
            reason=transfer.reason
        )
        
        logger.info(f"Fund transfer completed: {transfer.transfer_id}, Amount: {transfer.amount}")
        return True
    except Exception as e:
        logger.error(f"Error executing fund transfer: {str(e)}")
        return False

# 内部函数：执行风险评估
def assess_system_risk() -> RiskAssessment:
    """评估系统资金风险"""
    try:
        # 获取所有资金池信息
        main_pool = get_fund_pool("main_pool")
        payout_pool = get_fund_pool("payout_pool")
        reserve_pool = get_fund_pool("reserve_pool")
        
        # 计算总资金和使用情况
        total_funds = sum(pool.total_balance for pool in [main_pool, payout_pool, reserve_pool] if pool)
        total_reserved = sum(pool.reserved_balance for pool in [main_pool, payout_pool, reserve_pool] if pool)
        total_available = sum(pool.available_balance for pool in [main_pool, payout_pool] if pool)
        
        # 计算比率
        exposure_ratio = 1 - (total_reserved / total_funds) if total_funds > 0 else 0
        reserve_ratio = total_reserved / total_funds if total_funds > 0 else 0
        
        # 确定风险等级
        if exposure_ratio >= RISK_THRESHOLD_HIGH:
            risk_level = "high"
        elif exposure_ratio >= RISK_THRESHOLD_MEDIUM:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # 生成建议
        recommendations = []
        if exposure_ratio >= RISK_THRESHOLD_HIGH:
            recommendations.append("Reduce exposure immediately by increasing reserves")
            recommendations.append("Limit new positions and payouts")
            recommendations.append("Consider raising additional funds")
        elif exposure_ratio >= RISK_THRESHOLD_MEDIUM:
            recommendations.append("Monitor exposure closely")
            recommendations.append("Consider increasing reserve ratio")
        
        # 检查准备金比率是否低于最小要求
        if reserve_ratio < MIN_RESERVE_RATIO:
            recommendations.append(f"Reserve ratio ({reserve_ratio:.2%}) below minimum requirement ({MIN_RESERVE_RATIO:.2%})")
        
        # 创建风险评估结果
        assessment = RiskAssessment(
            assessment_id=f"risk-{int(time.time())}",
            timestamp=int(time.time()),
            exposure_ratio=exposure_ratio,
            reserve_ratio=reserve_ratio,
            risk_level=risk_level,
            recommendations=recommendations,
            fund_status={
                "total_funds": total_funds,
                "total_reserved": total_reserved,
                "total_available": total_available,
                "main_pool": main_pool.dict() if main_pool else None,
                "payout_pool": payout_pool.dict() if payout_pool else None,
                "reserve_pool": reserve_pool.dict() if reserve_pool else None
            }
        )
        
        # 如果风险等级为高，发送风险警报
        if risk_level == "high":
            alert_message = {
                "alert_id": f"alert-{int(time.time())}",
                "alert_type": "high_risk",
                "message": f"System at high risk! Exposure ratio: {exposure_ratio:.2%}",
                "severity": "critical",
                "timestamp": int(time.time()),
                "assessment_id": assessment.assessment_id
            }
            mq_client.publish_message(QUEUE_RISK_ALERTS, alert_message)
            
        logger.info(f"Risk assessment completed: {assessment.assessment_id}, Risk level: {risk_level}")
        return assessment
    except Exception as e:
        logger.error(f"Error during risk assessment: {str(e)}")
        # 返回默认的风险评估结果
        return RiskAssessment(
            assessment_id=f"risk-failed-{int(time.time())}",
            timestamp=int(time.time()),
            exposure_ratio=0.0,
            reserve_ratio=0.0,
            risk_level="unknown",
            recommendations=["Risk assessment failed, check system logs"],
            fund_status={}
        )

# 异步函数：定期执行风险评估
async def periodic_risk_assessment():
    """定期执行系统风险评估"""
    assessment_interval = config_manager.get('risk.assessment_interval', 3600)  # 默认1小时
    
    while True:
        try:
            # 执行风险评估
            assess_system_risk()
        except Exception as e:
            logger.error(f"Periodic risk assessment failed: {str(e)}")
        
        # 等待下一次评估
        await asyncio.sleep(assessment_interval)

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查资金管理服务健康状态"""
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

# API端点：获取资金池信息
@app.get("/api/fund/pool/{pool_id}", tags=["Fund Pools"], response_model=FundPool)
async def get_pool_info(pool_id: str):
    """获取指定资金池的详细信息"""
    pool = get_fund_pool(pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail=f"Fund pool not found: {pool_id}")
    
    return pool

# API端点：获取所有资金池信息
@app.get("/api/fund/pools", tags=["Fund Pools"])
async def get_all_pools():
    """获取所有资金池的摘要信息"""
    pools = [
        get_fund_pool("main_pool"),
        get_fund_pool("payout_pool"),
        get_fund_pool("reserve_pool")
    ]
    
    # 过滤掉None值
    valid_pools = [pool for pool in pools if pool]
    
    # 计算总计
    total_funds = sum(pool.total_balance for pool in valid_pools)
    total_reserved = sum(pool.reserved_balance for pool in valid_pools)
    total_available = sum(pool.available_balance for pool in valid_pools)
    
    return {
        "pools": valid_pools,
        "total_funds": total_funds,
        "total_reserved": total_reserved,
        "total_available": total_available,
        "timestamp": int(time.time())
    }

# API端点：执行资金转移
@app.post("/api/fund/transfer", tags=["Fund Transfers"], response_model=Dict[str, Any])
async def transfer_funds(transfer: FundTransfer):
    """在资金池之间转移资金"""
    try:
        # 执行资金转移
        success = execute_fund_transfer(transfer)
        
        if success:
            return {
                "status": "success",
                "message": "Fund transfer completed successfully",
                "transfer_id": transfer.transfer_id,
                "timestamp": int(time.time())
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to complete fund transfer")
    except Exception as e:
        logger.error(f"Error in transfer_funds: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：执行风险评估
@app.get("/api/fund/risk-assessment", tags=["Risk Management"], response_model=RiskAssessment)
async def get_risk_assessment():
    """执行并获取系统风险评估"""
    try:
        return assess_system_risk()
    except Exception as e:
        logger.error(f"Error in get_risk_assessment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API端点：检查资金可用性
@app.post("/api/fund/check-availability", tags=["Fund Management"])
async def check_fund_availability(pool_id: str, amount: float):
    """检查指定资金池是否有足够的可用资金"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    pool = get_fund_pool(pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail=f"Fund pool not found: {pool_id}")
    
    # 检查资金可用性
    is_available = pool.available_balance >= amount
    
    # 检查是否超过单笔支付限额
    max_single_payout = pool.total_balance * MAX_SINGLE_PAYOUT_RATIO
    exceeds_single_limit = amount > max_single_payout
    
    return {
        "pool_id": pool_id,
        "amount_requested": amount,
        "available_balance": pool.available_balance,
        "is_available": is_available and not exceeds_single_limit,
        "exceeds_single_limit": exceeds_single_limit,
        "max_single_payout": max_single_payout,
        "timestamp": int(time.time())
    }

# API端点：获取资金事件历史
@app.get("/api/fund/events", tags=["Fund Events"])
async def get_fund_events(
    event_type: Optional[str] = None,
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    limit: int = 100
):
    """获取资金事件历史（简化实现）"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询资金事件历史
    # 这里返回示例数据
    sample_events = [
        FundEvent(
            event_id="event-1",
            event_type="deposit",
            amount=50000.0,
            asset_type="ETH",
            source="external_wallet",
            destination="main_pool",
            timestamp=int(time.time() - 86400),
            metadata={"transaction_hash": "0x123456"}
        ),
        FundEvent(
            event_id="event-2",
            event_type="transfer",
            amount=20000.0,
            asset_type="ETH",
            source="main_pool",
            destination="payout_pool",
            timestamp=int(time.time() - 43200),
            metadata={"transfer_id": "transfer-1", "reason": "payout preparation"}
        ),
        FundEvent(
            event_id="event-3",
            event_type="payout",
            amount=15000.0,
            asset_type="ETH",
            source="payout_pool",
            destination="user_wallet",
            timestamp=int(time.time() - 21600),
            metadata={"claim_id": "claim-123", "user_address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"}
        )
    ]
    
    # 应用过滤条件
    filtered_events = sample_events
    if event_type:
        filtered_events = [event for event in filtered_events if event.event_type == event_type]
    if start_time:
        filtered_events = [event for event in filtered_events if event.timestamp >= start_time]
    if end_time:
        filtered_events = [event for event in filtered_events if event.timestamp <= end_time]
    
    # 限制返回数量
    limited_events = filtered_events[:limit]
    
    return {
        "events": limited_events,
        "total_count": len(filtered_events),
        "returned_count": len(limited_events),
        "timestamp": int(time.time())
    }

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Fund Management Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 启动定期风险评估任务
    loop = asyncio.get_event_loop()
    loop.create_task(periodic_risk_assessment())
    
    logger.info("Fund Management Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Fund Management Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("Fund Management Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('fund_management.host', '0.0.0.0')
    port = config_manager.get('fund_management.port', 8003)
    
    logger.info(f"Starting Fund Management Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('fund_management.workers', 1)  # 工作进程数
    )