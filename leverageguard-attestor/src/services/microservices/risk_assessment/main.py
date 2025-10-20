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
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import uuid
import statistics
from collections import deque, defaultdict
import threading
from enum import Enum

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_RISK_ASSESSMENT, QUEUE_RISK_ALERTS, QUEUE_ORDER_VERIFICATION

# 初始化FastAPI应用
app = FastAPI(
    title="Risk Assessment Service",
    description="Service for real-time risk assessment and alerting in LeverageGuard",
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

# 风险等级定义
class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"

# 风险指标权重配置
RISK_METRICS_WEIGHTS = {
    "market_volatility": 0.25,
    "leverage_ratio": 0.30,
    "collateral_ratio": 0.20,
    "position_size": 0.15,
    "user_trading_history": 0.10
}

# 风险阈值配置
RISK_THRESHOLDS = {
    RiskLevel.LOW: 0.3,
    RiskLevel.MEDIUM: 0.6,
    RiskLevel.HIGH: 0.8,
    RiskLevel.EXTREME: 1.0
}

# 市场波动率阈值
MARKET_VOLATILITY_THRESHOLDS = {
    RiskLevel.LOW: 0.05,
    RiskLevel.MEDIUM: 0.15,
    RiskLevel.HIGH: 0.30,
    RiskLevel.EXTREME: 0.50
}

# 杠杆率阈值
LEVERAGE_RATIO_THRESHOLDS = {
    RiskLevel.LOW: 2.0,
    RiskLevel.MEDIUM: 5.0,
    RiskLevel.HIGH: 10.0,
    RiskLevel.EXTREME: 20.0
}

# 抵押率阈值
COLLATERAL_RATIO_THRESHOLDS = {
    RiskLevel.LOW: 0.5,
    RiskLevel.MEDIUM: 0.3,
    RiskLevel.HIGH: 0.2,
    RiskLevel.EXTREME: 0.1
}

# 交易对风险权重
TRADING_PAIR_RISK_WEIGHTS = {
    "BTC/USDT": 0.5,
    "ETH/USDT": 0.6,
    "SOL/USDT": 0.8,
    "AVAX/USDT": 0.7,
    "DOT/USDT": 0.6,
    "default": 1.0  # 默认风险权重
}

# 风险评估请求模型
class RiskAssessmentRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: f"risk-{uuid.uuid4()}", description="Unique request identifier")
    order_id: str = Field(..., description="Order ID to assess risk for")
    user_id: str = Field(..., description="User ID placing the order")
    user_address: str = Field(..., description="User's blockchain address")
    trading_pair: str = Field(..., description="Trading pair (e.g., BTC/USDT)")
    order_type: str = Field(..., description="Order type (e.g., market, limit)")
    leverage: confloat(ge=1.0) = Field(..., description="Leverage ratio")
    collateral_amount: confloat(gt=0) = Field(..., description="Collateral amount")
    order_amount: confloat(gt=0) = Field(..., description="Order amount")
    entry_price: confloat(gt=0) = Field(..., description="Entry price")
    liquidation_price: confloat(gt=0) = Field(..., description="Liquidation price")
    stop_loss_price: Optional[confloat(gt=0)] = Field(None, description="Stop loss price")
    take_profit_price: Optional[confloat(gt=0)] = Field(None, description="Take profit price")
    position_size_percentage: Optional[confloat(ge=0, le=100)] = Field(None, description="Position size as percentage of portfolio")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Request timestamp")

# 风险评估结果模型
class RiskAssessmentResult(BaseModel):
    request_id: str = Field(..., description="Corresponding request identifier")
    order_id: str = Field(..., description="Order ID that was assessed")
    user_id: str = Field(..., description="User ID")
    risk_score: confloat(ge=0, le=1) = Field(..., description="Overall risk score (0-1)")
    risk_level: RiskLevel = Field(..., description="Risk level")
    risk_factors: Dict[str, confloat(ge=0, le=1)] = Field(..., description="Individual risk factor scores")
    recommendations: List[str] = Field(..., description="Risk mitigation recommendations")
    is_approved: bool = Field(..., description="Whether the order is approved based on risk assessment")
    approval_reason: str = Field(..., description="Reason for approval or rejection")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Assessment timestamp")

# 风险预警模型
class RiskAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: f"alert-{uuid.uuid4()}", description="Unique alert identifier")
    user_id: Optional[str] = Field(None, description="User ID associated with the alert")
    user_address: Optional[str] = Field(None, description="User's blockchain address")
    alert_type: str = Field(..., description="Type of alert")
    risk_level: RiskLevel = Field(..., description="Risk level")
    alert_message: str = Field(..., description="Alert message")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Alert timestamp")
    is_read: bool = Field(default=False, description="Whether the alert has been read")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

# 风险指标配置模型
class RiskMetricConfig(BaseModel):
    metric_name: str = Field(..., description="Name of the risk metric")
    weight: confloat(ge=0, le=1) = Field(..., description="Weight of the metric in overall risk score")
    thresholds: Dict[str, confloat(ge=0)] = Field(..., description="Threshold values for risk levels")

# 实时市场数据模型
class MarketData(BaseModel):
    trading_pair: str = Field(..., description="Trading pair")
    price: confloat(gt=0) = Field(..., description="Current price")
    volatility: confloat(ge=0) = Field(..., description="Market volatility")
    volume: confloat(ge=0) = Field(..., description="Trading volume")
    timestamp: int = Field(default_factory=lambda: int(time.time()), description="Data timestamp")

# 用户交易历史模型
class UserTradeHistory(BaseModel):
    user_id: str = Field(..., description="User ID")
    successful_trades: conint(ge=0) = Field(..., description="Number of successful trades")
    failed_trades: conint(ge=0) = Field(..., description="Number of failed trades")
    total_trades: conint(ge=0) = Field(..., description="Total number of trades")
    win_rate: confloat(ge=0, le=1) = Field(..., description="Win rate (0-1)")
    avg_profit_percent: Optional[float] = Field(None, description="Average profit percentage")
    avg_loss_percent: Optional[float] = Field(None, description="Average loss percentage")
    max_drawdown: Optional[confloat(ge=0)] = Field(None, description="Maximum drawdown")
    risk_score: confloat(ge=0, le=1) = Field(..., description="User risk score")

# 内部状态：用户风险数据缓存
class UserRiskDataCache:
    """用户风险数据缓存"""
    def __init__(self):
        self._cache = {}  # 用户ID -> 风险数据
        self._lock = threading.RLock()  # 可重入锁，用于线程安全
        
    def get(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取用户风险数据"""
        with self._lock:
            return self._cache.get(user_id)
    
    def set(self, user_id: str, data: Dict[str, Any]) -> None:
        """设置用户风险数据"""
        with self._lock:
            self._cache[user_id] = data
    
    def delete(self, user_id: str) -> None:
        """删除用户风险数据"""
        with self._lock:
            if user_id in self._cache:
                del self._cache[user_id]

# 内部状态：市场数据缓存
class MarketDataCache:
    """市场数据缓存"""
    def __init__(self):
        self._cache = {}  # 交易对 -> 市场数据
        self._lock = threading.RLock()
        self._historical_data = defaultdict(lambda: deque(maxlen=100))  # 交易对 -> 历史数据队列
        
    def get(self, trading_pair: str) -> Optional[Dict[str, Any]]:
        """获取交易对的市场数据"""
        with self._lock:
            return self._cache.get(trading_pair)
    
    def set(self, trading_pair: str, data: Dict[str, Any]) -> None:
        """设置交易对的市场数据"""
        with self._lock:
            self._cache[trading_pair] = data
            # 更新历史数据
            self._historical_data[trading_pair].append({
                "price": data["price"],
                "timestamp": data["timestamp"],
                "volatility": data["volatility"]
            })
    
    def get_historical_data(self, trading_pair: str) -> List[Dict[str, Any]]:
        """获取交易对的历史数据"""
        with self._lock:
            return list(self._historical_data[trading_pair])

# 创建缓存实例
user_risk_cache = UserRiskDataCache()
market_data_cache = MarketDataCache()

# 内部函数：获取市场波动率
def get_market_volatility(trading_pair: str) -> float:
    """计算指定交易对的市场波动率"""
    # 注意：这是一个简化的实现。在实际应用中，应该使用真实的市场数据计算波动率
    historical_data = market_data_cache.get_historical_data(trading_pair)
    
    if len(historical_data) < 2:
        # 如果没有足够的历史数据，返回默认值
        return 0.10  # 10% 波动率
    
    # 计算价格变化百分比
    price_changes = []
    for i in range(1, len(historical_data)):
        prev_price = historical_data[i-1]["price"]
        current_price = historical_data[i]["price"]
        change = abs((current_price - prev_price) / prev_price)
        price_changes.append(change)
    
    # 计算波动率（标准差）
    volatility = statistics.stdev(price_changes) if len(price_changes) > 1 else 0
    
    return min(max(volatility, 0), 2)  # 限制在0-2之间

# 内部函数：评估市场风险
def assess_market_risk(trading_pair: str) -> Tuple[float, str]:
    """评估市场风险"""
    # 获取市场波动率
    volatility = get_market_volatility(trading_pair)
    
    # 根据交易对获取风险权重
    pair_risk_weight = TRADING_PAIR_RISK_WEIGHTS.get(trading_pair, TRADING_PAIR_RISK_WEIGHTS["default"])
    
    # 综合计算市场风险得分
    market_risk_score = min(volatility * pair_risk_weight, 1.0)
    
    # 确定风险等级
    risk_level = RiskLevel.LOW
    for level in [RiskLevel.EXTREME, RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW]:
        if market_risk_score >= RISK_THRESHOLDS[level]:
            risk_level = level
            break
    
    # 生成风险描述
    if market_risk_score < 0.3:
        risk_description = "Market conditions are stable."
    elif market_risk_score < 0.6:
        risk_description = "Market shows moderate volatility."
    elif market_risk_score < 0.8:
        risk_description = "Market volatility is high."
    else:
        risk_description = "Market is extremely volatile. Trading is highly risky."
    
    return market_risk_score, risk_description

# 内部函数：评估杠杆风险
def assess_leverage_risk(leverage: float) -> Tuple[float, str]:
    """评估杠杆风险"""
    # 计算杠杆风险得分
    if leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.LOW]:
        leverage_risk_score = 0.1
    elif leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.MEDIUM]:
        leverage_risk_score = 0.3
    elif leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.HIGH]:
        leverage_risk_score = 0.6
    elif leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.EXTREME]:
        leverage_risk_score = 0.8
    else:
        leverage_risk_score = 1.0
    
    # 生成风险描述
    if leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.LOW]:
        risk_description = f"Leverage ratio {leverage}x is considered low risk."
    elif leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.MEDIUM]:
        risk_description = f"Leverage ratio {leverage}x is moderate risk. Monitor position closely."
    elif leverage <= LEVERAGE_RATIO_THRESHOLDS[RiskLevel.HIGH]:
        risk_description = f"Leverage ratio {leverage}x is high risk. Consider reducing leverage."
    else:
        risk_description = f"Leverage ratio {leverage}x is extremely high risk. Strongly recommend reducing leverage."
    
    return leverage_risk_score, risk_description

# 内部函数：评估抵押风险
def assess_collateral_risk(collateral_ratio: float) -> Tuple[float, str]:
    """评估抵押风险"""
    # 计算抵押风险得分（抵押率越低，风险越高）
    if collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.LOW]:
        collateral_risk_score = 0.1
    elif collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.MEDIUM]:
        collateral_risk_score = 0.3
    elif collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.HIGH]:
        collateral_risk_score = 0.6
    elif collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.EXTREME]:
        collateral_risk_score = 0.8
    else:
        collateral_risk_score = 1.0
    
    # 生成风险描述
    if collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.LOW]:
        risk_description = "Collateral ratio is sufficient."
    elif collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.MEDIUM]:
        risk_description = "Collateral ratio is moderate. Consider adding more collateral."
    elif collateral_ratio > COLLATERAL_RATIO_THRESHOLDS[RiskLevel.HIGH]:
        risk_description = "Collateral ratio is low. Immediate action needed to avoid liquidation."
    else:
        risk_description = "Collateral ratio is extremely low. High risk of immediate liquidation."
    
    return collateral_risk_score, risk_description

# 内部函数：评估仓位大小风险
def assess_position_size_risk(position_size_percentage: Optional[float]) -> Tuple[float, str]:
    """评估仓位大小风险"""
    # 默认假设仓位大小适中
    if position_size_percentage is None:
        return 0.3, "Position size information not available."
    
    # 计算仓位大小风险得分
    if position_size_percentage < 10:
        position_risk_score = 0.1
    elif position_size_percentage < 30:
        position_risk_score = 0.3
    elif position_size_percentage < 50:
        position_risk_score = 0.6
    elif position_size_percentage < 80:
        position_risk_score = 0.8
    else:
        position_risk_score = 1.0
    
    # 生成风险描述
    if position_size_percentage < 10:
        risk_description = "Position size is small relative to portfolio."
    elif position_size_percentage < 30:
        risk_description = "Position size is moderate relative to portfolio."
    elif position_size_percentage < 50:
        risk_description = "Position size is large relative to portfolio. Consider reducing."
    elif position_size_percentage < 80:
        risk_description = "Position size is very large relative to portfolio. Strongly recommend reducing."
    else:
        risk_description = "Position size exceeds portfolio value. Extremely high risk."
    
    return position_risk_score, risk_description

# 内部函数：评估用户交易历史风险
def assess_user_trading_history_risk(user_id: str) -> Tuple[float, str]:
    """评估用户交易历史风险"""
    # 从缓存获取用户交易历史风险数据
    user_data = user_risk_cache.get(user_id)
    
    # 如果没有用户数据，返回默认值
    if not user_data or "trading_history_risk_score" not in user_data:
        return 0.5, "No trading history available. Assuming average risk profile."
    
    # 获取用户交易历史风险得分
    trading_history_risk_score = user_data["trading_history_risk_score"]
    
    # 生成风险描述
    if trading_history_risk_score < 0.3:
        risk_description = "User has a conservative trading history."
    elif trading_history_risk_score < 0.6:
        risk_description = "User has an average risk trading history."
    elif trading_history_risk_score < 0.8:
        risk_description = "User has an aggressive trading history."
    else:
        risk_description = "User has a very high-risk trading history."
    
    return trading_history_risk_score, risk_description

# 内部函数：计算综合风险得分
def calculate_overall_risk_score(risk_factors: Dict[str, float]) -> float:
    """计算综合风险得分"""
    # 确保所有风险因素都有对应的权重
    total_weight = 0.0
    weighted_sum = 0.0
    
    for factor_name, factor_score in risk_factors.items():
        if factor_name in RISK_METRICS_WEIGHTS:
            weight = RISK_METRICS_WEIGHTS[factor_name]
            weighted_sum += factor_score * weight
            total_weight += weight
    
    # 如果没有有效的权重，返回0
    if total_weight == 0:
        return 0.0
    
    # 计算加权平均得分
    overall_score = weighted_sum / total_weight
    
    # 确保得分在0-1之间
    return min(max(overall_score, 0.0), 1.0)

# 内部函数：确定风险等级
def determine_risk_level(risk_score: float) -> RiskLevel:
    """根据风险得分确定风险等级"""
    if risk_score >= RISK_THRESHOLDS[RiskLevel.EXTREME]:
        return RiskLevel.EXTREME
    elif risk_score >= RISK_THRESHOLDS[RiskLevel.HIGH]:
        return RiskLevel.HIGH
    elif risk_score >= RISK_THRESHOLDS[RiskLevel.MEDIUM]:
        return RiskLevel.MEDIUM
    else:
        return RiskLevel.LOW

# 内部函数：生成风险缓解建议
def generate_recommendations(risk_factors: Dict[str, float], risk_level: RiskLevel) -> List[str]:
    """生成风险缓解建议"""
    recommendations = []
    
    # 根据市场风险提供建议
    if risk_factors.get("market_volatility", 0) > 0.6:
        recommendations.append("Reduce position size due to high market volatility.")
        recommendations.append("Consider setting tighter stop-loss levels.")
    
    # 根据杠杆风险提供建议
    if risk_factors.get("leverage_ratio", 0) > 0.6:
        recommendations.append("Reduce leverage to lower risk exposure.")
    
    # 根据抵押风险提供建议
    if risk_factors.get("collateral_ratio", 0) > 0.6:
        recommendations.append("Add more collateral to improve collateral ratio.")
    
    # 根据仓位大小风险提供建议
    if risk_factors.get("position_size", 0) > 0.6:
        recommendations.append("Reduce position size to limit potential losses.")
    
    # 根据整体风险等级提供建议
    if risk_level == RiskLevel.EXTREME:
        recommendations.append("Strongly consider canceling this order due to extreme risk.")
        recommendations.append("Review your risk management strategy.")
    elif risk_level == RiskLevel.HIGH:
        recommendations.append("Proceed with caution and monitor the position closely.")
        recommendations.append("Ensure you have sufficient funds to cover potential margin calls.")
    
    # 去重建议
    return list(dict.fromkeys(recommendations))

# 内部函数：决定是否批准订单
def determine_approval(risk_level: RiskLevel, risk_score: float) -> Tuple[bool, str]:
    """决定是否批准订单"""
    if risk_level == RiskLevel.EXTREME or risk_score >= 0.9:
        return False, "Order rejected due to extreme risk level."
    elif risk_level == RiskLevel.HIGH and risk_score >= 0.75:
        return False, "Order rejected due to high risk level."
    elif risk_level == RiskLevel.HIGH:
        return True, "Order approved with high risk warning."
    elif risk_level == RiskLevel.MEDIUM:
        return True, "Order approved with moderate risk level."
    else:
        return True, "Order approved with low risk level."

# 内部函数：执行风险评估
def perform_risk_assessment(request: RiskAssessmentRequest) -> RiskAssessmentResult:
    """执行完整的风险评估"""
    try:
        logger.info(f"Performing risk assessment for order: {request.order_id}")
        
        # 计算抵押率
        collateral_ratio = request.collateral_amount / (request.order_amount * request.leverage)
        
        # 评估各项风险因素
        market_risk_score, _ = assess_market_risk(request.trading_pair)
        leverage_risk_score, _ = assess_leverage_risk(request.leverage)
        collateral_risk_score, _ = assess_collateral_risk(collateral_ratio)
        position_risk_score, _ = assess_position_size_risk(request.position_size_percentage)
        trading_history_risk_score, _ = assess_user_trading_history_risk(request.user_id)
        
        # 汇总风险因素得分
        risk_factors = {
            "market_volatility": market_risk_score,
            "leverage_ratio": leverage_risk_score,
            "collateral_ratio": collateral_risk_score,
            "position_size": position_risk_score,
            "user_trading_history": trading_history_risk_score
        }
        
        # 计算综合风险得分
        overall_risk_score = calculate_overall_risk_score(risk_factors)
        
        # 确定风险等级
        risk_level = determine_risk_level(overall_risk_score)
        
        # 生成风险缓解建议
        recommendations = generate_recommendations(risk_factors, risk_level)
        
        # 决定是否批准订单
        is_approved, approval_reason = determine_approval(risk_level, overall_risk_score)
        
        # 创建风险评估结果
        result = RiskAssessmentResult(
            request_id=request.request_id,
            order_id=request.order_id,
            user_id=request.user_id,
            risk_score=overall_risk_score,
            risk_level=risk_level,
            risk_factors=risk_factors,
            recommendations=recommendations,
            is_approved=is_approved,
            approval_reason=approval_reason
        )
        
        # 如果风险等级为高或极端，发送风险预警
        if risk_level in [RiskLevel.HIGH, RiskLevel.EXTREME]:
            send_risk_alert(request, result)
        
        # 记录审计日志
        audit_logger.log_risk_assessment(
            order_id=request.order_id,
            user_id=request.user_id,
            risk_score=overall_risk_score,
            risk_level=risk_level,
            is_approved=is_approved
        )
        
        logger.info(f"Risk assessment completed for order: {request.order_id}, Risk Level: {risk_level}")
        
        # 发布风险评估结果到消息队列，用于其他服务处理
        mq_client.publish_message(QUEUE_ORDER_VERIFICATION, {
            "event_type": "RISK_ASSESSMENT_COMPLETED",
            "order_id": request.order_id,
            "assessment_result": result.dict()
        })
        
        return result
    except Exception as e:
        logger.error(f"Error performing risk assessment: {str(e)}")
        # 如果评估过程出错，返回默认拒绝结果
        return RiskAssessmentResult(
            request_id=request.request_id,
            order_id=request.order_id,
            user_id=request.user_id,
            risk_score=1.0,  # 默认最高风险
            risk_level=RiskLevel.EXTREME,
            risk_factors={},
            recommendations=["Risk assessment could not be completed. Please try again later."],
            is_approved=False,
            approval_reason="Risk assessment failed."
        )

# 内部函数：发送风险预警
def send_risk_alert(request: RiskAssessmentRequest, assessment: RiskAssessmentResult) -> None:
    """发送风险预警"""
    try:
        # 创建风险预警
        alert = RiskAlert(
            user_id=request.user_id,
            user_address=request.user_address,
            alert_type="ORDER_RISK",
            risk_level=assessment.risk_level,
            alert_message=f"High risk detected for order {request.order_id}. Risk score: {assessment.risk_score:.2f}",
            metadata={
                "order_id": request.order_id,
                "trading_pair": request.trading_pair,
                "leverage": request.leverage,
                "risk_score": assessment.risk_score,
                "recommendations": assessment.recommendations
            }
        )
        
        # 发布风险预警到消息队列
        mq_client.publish_message(QUEUE_RISK_ALERTS, alert.dict())
        
        logger.info(f"Risk alert sent for order: {request.order_id}, User: {request.user_id}")
        
    except Exception as e:
        logger.error(f"Error sending risk alert: {str(e)}")

# 内部函数：更新用户风险数据
def update_user_risk_data(user_id: str, risk_data: Dict[str, Any]) -> None:
    """更新用户风险数据"""
    try:
        # 获取现有用户风险数据
        existing_data = user_risk_cache.get(user_id) or {}
        
        # 更新用户风险数据
        existing_data.update(risk_data)
        existing_data["last_updated"] = int(time.time())
        
        # 保存更新后的数据到缓存
        user_risk_cache.set(user_id, existing_data)
        
        logger.info(f"User risk data updated: {user_id}")
        
    except Exception as e:
        logger.error(f"Error updating user risk data: {str(e)}")

# 内部函数：更新市场数据
def update_market_data(trading_pair: str, market_data: Dict[str, Any]) -> None:
    """更新市场数据"""
    try:
        # 确保包含必要的字段
        data_to_save = {
            "price": market_data.get("price", 0),
            "volatility": market_data.get("volatility", 0),
            "volume": market_data.get("volume", 0),
            "timestamp": int(time.time())
        }
        
        # 保存市场数据到缓存
        market_data_cache.set(trading_pair, data_to_save)
        
        logger.info(f"Market data updated: {trading_pair}")
        
    except Exception as e:
        logger.error(f"Error updating market data: {str(e)}")

# 异步函数：处理队列中的风险评估请求
async def process_risk_assessment_queue():
    """从队列中获取风险评估请求并处理"""
    def callback(ch, method, properties, body):
        """队列消息处理回调函数"""
        try:
            # 解析风险评估请求数据
            import json
            request_data = json.loads(body)
            
            # 检查是否包含order_data
            if "order_data" in request_data:
                # 这是从订单验证服务转发的订单数据
                order_data = request_data["order_data"]
                
                # 创建风险评估请求
                request = RiskAssessmentRequest(
                    order_id=order_data["order_id"],
                    user_id=order_data["user_id"],
                    user_address=order_data["user_address"],
                    trading_pair=order_data["trading_pair"],
                    order_type=order_data["order_type"],
                    leverage=order_data["leverage"],
                    collateral_amount=order_data["collateral_amount"],
                    order_amount=order_data["order_amount"],
                    entry_price=order_data["entry_price"],
                    liquidation_price=order_data["liquidation_price"],
                    stop_loss_price=order_data.get("stop_loss_price"),
                    take_profit_price=order_data.get("take_profit_price"),
                    position_size_percentage=order_data.get("position_size_percentage")
                )
            else:
                # 这是直接的风险评估请求
                request = RiskAssessmentRequest(**request_data)
            
            # 执行风险评估
            result = perform_risk_assessment(request)
            
            # 确认消息已处理
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as e:
            logger.error(f"Error processing risk assessment request: {str(e)}")
            # 处理失败，将消息重新入队或死信队列
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except:
                pass
    
    # 消费队列消息
    mq_client.consume_messages(QUEUE_RISK_ASSESSMENT, callback)

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
    """检查风险评估服务健康状态"""
    # 检查消息队列连接
    mq_connected = mq_client.connected or mq_client.connect()
    
    # 检查缓存状态
    cache_status = "up" if len(user_risk_cache._cache) >= 0 and len(market_data_cache._cache) >= 0 else "down"
    
    # 总体健康状态
    overall_status = "up" if mq_connected and cache_status == "up" else "down"
    
    return {
        "status": overall_status,
        "timestamp": int(time.time()),
        "message_queue_connected": mq_connected,
        "cache_status": cache_status,
        "cached_users_count": len(user_risk_cache._cache),
        "cached_market_pairs_count": len(market_data_cache._cache)
    }

# API端点：执行风险评估
@app.post("/api/risk/assess", tags=["Risk Assessment"], response_model=RiskAssessmentResult)
async def assess_risk(request: RiskAssessmentRequest):
    """执行实时风险评估"""
    try:
        logger.info(f"Received risk assessment request: {request.request_id}")
        
        # 执行风险评估
        result = perform_risk_assessment(request)
        
        return result
    except Exception as e:
        logger.error(f"Error in assess_risk: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to perform risk assessment")

# API端点：获取风险评估结果
@app.get("/api/risk/assessment/{request_id}", tags=["Risk Assessment"])
async def get_assessment_result(request_id: str):
    """获取风险评估结果"""
    try:
        logger.info(f"Fetching risk assessment result: {request_id}")
        
        # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询风险评估结果
        # 这里返回示例数据
        return {
            "request_id": request_id,
            "order_id": "order-12345",
            "user_id": "user-12345",
            "risk_score": 0.45,
            "risk_level": "medium",
            "risk_factors": {
                "market_volatility": 0.3,
                "leverage_ratio": 0.5,
                "collateral_ratio": 0.2,
                "position_size": 0.4,
                "user_trading_history": 0.6
            },
            "recommendations": ["Consider reducing leverage to lower risk exposure."],
            "is_approved": True,
            "approval_reason": "Order approved with moderate risk level.",
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in get_assessment_result: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch risk assessment result")

# API端点：设置风险指标配置
@app.put("/api/risk/config/metrics", tags=["Risk Configuration"])
async def set_risk_metrics_config(metrics: List[RiskMetricConfig], user: Dict[str, Any] = Depends(get_current_user)):
    """设置风险指标配置（需要管理员权限）"""
    try:
        # 检查用户权限（简化实现）
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        logger.info("Updating risk metrics configuration")
        
        # 在实际应用中，应该更新数据库中的配置
        # 这里只记录日志
        for metric in metrics:
            logger.info(f"Updated metric: {metric.metric_name}, Weight: {metric.weight}")
        
        # 记录审计日志
        audit_logger.log_config_change(
            user_id=user["user_id"],
            config_type="risk_metrics",
            changes={"metrics_updated": len(metrics)}
        )
        
        return {
            "status": "success",
            "message": "Risk metrics configuration updated",
            "updated_metrics_count": len(metrics),
            "timestamp": int(time.time())
        }
    except HTTPException as e:
        logger.error(f"Failed to update risk metrics configuration: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in set_risk_metrics_config: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update risk metrics configuration")

# API端点：获取风险指标配置
@app.get("/api/risk/config/metrics", tags=["Risk Configuration"])
async def get_risk_metrics_config(user: Dict[str, Any] = Depends(get_current_user)):
    """获取风险指标配置"""
    try:
        logger.info("Fetching risk metrics configuration")
        
        # 转换风险指标权重配置为响应格式
        metrics_config = [
            {
                "metric_name": metric_name,
                "weight": weight,
                "description": get_metric_description(metric_name)
            }
            for metric_name, weight in RISK_METRICS_WEIGHTS.items()
        ]
        
        return {
            "status": "success",
            "metrics": metrics_config,
            "total_metrics": len(metrics_config),
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in get_risk_metrics_config: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch risk metrics configuration")

# 内部函数：获取指标描述
def get_metric_description(metric_name: str) -> str:
    """获取风险指标描述"""
    descriptions = {
        "market_volatility": "Measures the volatility of the trading pair's market price.",
        "leverage_ratio": "Measures the risk associated with the leverage used in the order.",
        "collateral_ratio": "Measures the risk based on the ratio of collateral to the leveraged position size.",
        "position_size": "Measures the risk based on the size of the position relative to the user's portfolio.",
        "user_trading_history": "Measures the risk based on the user's historical trading behavior."
    }
    
    return descriptions.get(metric_name, "No description available.")

# API端点：更新市场数据
@app.post("/api/risk/market-data", tags=["Market Data"])
async def update_market_data_endpoint(market_data: MarketData):
    """更新市场数据"""
    try:
        logger.info(f"Updating market data for: {market_data.trading_pair}")
        
        # 更新市场数据
        update_market_data(market_data.trading_pair, market_data.dict())
        
        return {
            "status": "success",
            "message": "Market data updated",
            "trading_pair": market_data.trading_pair,
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in update_market_data_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update market data")

# API端点：获取市场数据
@app.get("/api/risk/market-data/{trading_pair}", tags=["Market Data"])
async def get_market_data(trading_pair: str):
    """获取交易对的市场数据"""
    try:
        logger.info(f"Fetching market data for: {trading_pair}")
        
        # 获取市场数据
        data = market_data_cache.get(trading_pair)
        
        if not data:
            # 如果没有缓存数据，返回默认值
            return {
                "status": "success",
                "trading_pair": trading_pair,
                "data": {
                    "price": 0,
                    "volatility": 0.1,
                    "volume": 0,
                    "timestamp": int(time.time())
                }
            }
        
        return {
            "status": "success",
            "trading_pair": trading_pair,
            "data": data
        }
    except Exception as e:
        logger.error(f"Error in get_market_data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch market data")

# API端点：更新用户交易历史风险数据
@app.post("/api/risk/user-trading-history", tags=["User Data"])
async def update_user_trading_history(history: UserTradeHistory):
    """更新用户交易历史风险数据"""
    try:
        logger.info(f"Updating trading history risk data for user: {history.user_id}")
        
        # 更新用户风险数据
        update_user_risk_data(history.user_id, {
            "trading_history": {
                "successful_trades": history.successful_trades,
                "failed_trades": history.failed_trades,
                "total_trades": history.total_trades,
                "win_rate": history.win_rate,
                "avg_profit_percent": history.avg_profit_percent,
                "avg_loss_percent": history.avg_loss_percent,
                "max_drawdown": history.max_drawdown
            },
            "trading_history_risk_score": history.risk_score
        })
        
        return {
            "status": "success",
            "message": "User trading history risk data updated",
            "user_id": history.user_id,
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in update_user_trading_history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user trading history")

# API端点：获取用户风险数据
@app.get("/api/risk/user/{user_id}", tags=["User Data"])
async def get_user_risk_data(user_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """获取用户风险数据"""
    try:
        # 检查用户权限（简化实现）
        if user_id != user["user_id"] and user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        logger.info(f"Fetching risk data for user: {user_id}")
        
        # 获取用户风险数据
        risk_data = user_risk_cache.get(user_id)
        
        if not risk_data:
            # 如果没有缓存数据，返回默认值
            return {
                "status": "success",
                "user_id": user_id,
                "risk_data": {
                    "risk_score": 0.5,
                    "risk_level": "medium",
                    "last_updated": int(time.time())
                }
            }
        
        return {
            "status": "success",
            "user_id": user_id,
            "risk_data": risk_data
        }
    except HTTPException as e:
        logger.error(f"Failed to fetch user risk data: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in get_user_risk_data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user risk data")

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("Risk Assessment Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    # 启动队列处理任务
    loop = asyncio.get_event_loop()
    loop.create_task(process_risk_assessment_queue())
    
    # 初始化一些示例市场数据
    initialize_sample_market_data()
    
    logger.info("Risk Assessment Service started successfully")

# 内部函数：初始化示例市场数据
def initialize_sample_market_data():
    """初始化示例市场数据"""
    sample_data = [
        {
            "trading_pair": "BTC/USDT",
            "price": 35000.0,
            "volatility": 0.08,
            "volume": 15000000
        },
        {
            "trading_pair": "ETH/USDT",
            "price": 2200.0,
            "volatility": 0.12,
            "volume": 8000000
        },
        {
            "trading_pair": "SOL/USDT",
            "price": 65.0,
            "volatility": 0.18,
            "volume": 3000000
        },
        {
            "trading_pair": "AVAX/USDT",
            "price": 40.0,
            "volatility": 0.15,
            "volume": 1500000
        },
        {
            "trading_pair": "DOT/USDT",
            "price": 7.5,
            "volatility": 0.13,
            "volume": 1000000
        }
    ]
    
    for data in sample_data:
        update_market_data(data["trading_pair"], data)

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("Risk Assessment Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("Risk Assessment Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('risk_assessment.host', '0.0.0.0')
    port = config_manager.get('risk_assessment.port', 8006)
    
    logger.info(f"Starting Risk Assessment Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('risk_assessment.workers', 1)  # 工作进程数
    )