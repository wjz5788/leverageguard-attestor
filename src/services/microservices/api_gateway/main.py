from fastapi import FastAPI, Request, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import httpx
import time
import asyncio
from datetime import datetime, timedelta
from uuid import uuid4
from typing import Any, Dict, List, Optional

from eth_account import Account
from eth_account.messages import encode_defunct
from jose import JWTError
from pydantic import BaseModel, Field, validator
from web3 import Web3

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_VERIFICATION_REQUESTS
from ..common.authentication import AuthConfig, JWTManager, TokenPair
from ..common.errors import AuthenticationError

# 初始化FastAPI应用
app = FastAPI(
    title="LeverageGuard API Gateway",
    description="API Gateway for LeverageGuard Microservices",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 服务配置 - 微服务的基础URL
SERVICES = {
    'order_verification': config_manager.get('services.order_verification.url', 'http://order_verification:8001'),
    'payout_processing': config_manager.get('services.payout_processing.url', 'http://payout_processing:8002'),
    'fund_management': config_manager.get('services.fund_management.url', 'http://fund_management:8003'),
    'report_generation': config_manager.get('services.report_generation.url', 'http://report_generation:8004'),
}

# 身份验证配置
auth_secret = config_manager.get('auth.secret_key', 'dev-secret-change-me')
auth_access_expire_minutes = config_manager.get('auth.access_token_expire_minutes', 30)
auth_refresh_expire_days = config_manager.get('auth.refresh_token_expire_days', 7)
auth_issuer = config_manager.get('auth.issuer')
auth_audience = config_manager.get('auth.audience')
if isinstance(auth_audience, str):
    auth_audience = [auth_audience]

auth_config = AuthConfig(
    secret_key=auth_secret,
    access_token_expire_minutes=auth_access_expire_minutes,
    refresh_token_expire_days=auth_refresh_expire_days,
    issuer=auth_issuer,
    audience=auth_audience,
)
jwt_manager = JWTManager(auth_config)

# 内存态存储，后续可替换为数据库
nonce_store: Dict[str, Dict[str, Any]] = {}
session_store: Dict[str, Dict[str, Any]] = {}
orders_store: Dict[str, Dict[str, Any]] = {}
verification_tasks_store: Dict[str, Dict[str, Any]] = {}
appeals_store: Dict[str, Dict[str, Any]] = {}
evidence_sync_log: List[Dict[str, Any]] = []

# 并发锁，确保在多协程环境下数据安全
nonce_lock = asyncio.Lock()
session_lock = asyncio.Lock()
orders_lock = asyncio.Lock()
verification_lock = asyncio.Lock()
appeals_lock = asyncio.Lock()
evidence_lock = asyncio.Lock()

# HTTP客户端配置
HTTP_CLIENT_TIMEOUT = 30.0  # 30秒超时
HTTP_CLIENT_MAX_RETRIES = 3  # 最多重试3次

# 创建HTTP客户端（带连接池）
http_client = httpx.AsyncClient(
    timeout=HTTP_CLIENT_TIMEOUT,
    follow_redirects=True
)

# 安全认证
security = HTTPBearer()

async def verify_token(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """验证访问令牌，并将用户信息附加到请求上下文"""
    token = credentials.credentials

    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        payload = jwt_manager.decode_token(token)
    except AuthenticationError as auth_error:
        raise HTTPException(status_code=auth_error.status_code, detail=auth_error.message) from auth_error
    except JWTError as jwt_error:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from jwt_error

    wallet_address = payload.get("wallet_address") or payload.get("sub")
    if not wallet_address:
        raise HTTPException(status_code=401, detail="Token missing wallet address")

    normalized_address = Web3.to_checksum_address(wallet_address)

    async with session_lock:
        session = session_store.get(normalized_address)

    if not session or session.get("access_token") != token:
        raise HTTPException(status_code=401, detail="Session has expired or been revoked")

    user_context = {
        "wallet_address": normalized_address,
        "binance_uid": session.get("binance_uid"),
        "scopes": session.get("scopes", []),
        "user_id": normalized_address,
    }

    request.state.user = user_context
    return user_context


def _build_timeline_entry(event: str, status: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """创建统一的时间线事件记录"""
    return {
        "event": event,
        "status": status,
        "timestamp": datetime.utcnow(),
        "metadata": metadata or {},
    }


def _normalize_wallet(address: str) -> str:
    """校验并返回标准的校验和地址"""
    if not Web3.is_address(address):
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    return Web3.to_checksum_address(address)


class NonceResponse(BaseModel):
    wallet_address: str
    nonce: str
    message: str
    expires_at: datetime


class SessionRequest(BaseModel):
    wallet_address: str = Field(..., description="Ethereum wallet address used for authentication")
    signature: str = Field(..., description="Signature of the issued nonce")
    nonce: str = Field(..., description="Nonce previously issued by the server")
    binance_uid: Optional[str] = Field(None, description="Associated Binance UID")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Optional client context metadata")

    @validator("wallet_address")
    def validate_wallet_address(cls, value: str) -> str:
        return _normalize_wallet(value)

    @validator("signature")
    def validate_signature(cls, value: str) -> str:
        if not value or not value.startswith("0x"):
            raise ValueError("Signature must be a valid hex string")
        return value


class SessionResponse(TokenPair):
    wallet_address: str
    binance_uid: Optional[str] = None
    issued_at: datetime


class SessionRefreshRequest(BaseModel):
    wallet_address: str = Field(..., description="Checksum wallet address of the session owner")
    refresh_token: str = Field(..., description="Refresh token issued by the gateway")

    @validator("wallet_address")
    def validate_wallet(cls, value: str) -> str:
        return _normalize_wallet(value)

    @validator("refresh_token")
    def validate_refresh_token(cls, value: str) -> str:
        if not value:
            raise ValueError("Refresh token is required")
        return value


class SessionRevokeResponse(BaseModel):
    wallet_address: str
    revoked: bool = True
    timestamp: datetime


class OrderTimelineEntry(BaseModel):
    event: str
    status: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None


class OrderCreateRequest(BaseModel):
    product_id: str = Field(..., min_length=1)
    wallet_address: str = Field(..., description="Checksum wallet address of the purchaser")
    exchange: str = Field(..., min_length=1)
    premium_amount: float = Field(..., gt=0)
    coverage_amount: float = Field(..., gt=0)
    currency: str = Field("USDC", min_length=2, max_length=10)
    leverage: Optional[float] = Field(None, gt=0)
    binance_order_id: Optional[str] = Field(None, min_length=1)
    metadata: Optional[Dict[str, Any]] = None

    @validator("wallet_address")
    def validate_wallet_address(cls, value: str) -> str:
        return _normalize_wallet(value)

    @validator("currency")
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class OrderResponse(OrderCreateRequest):
    order_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    verification_tasks: List[str] = []
    appeals: List[str] = []
    timeline: List[OrderTimelineEntry] = []


class OrderListResponse(BaseModel):
    orders: List[OrderResponse]
    total: int


class VerificationRequest(BaseModel):
    order_id: str = Field(..., description="Order identifier")
    binance_api_key: str = Field(..., min_length=8)
    binance_api_secret: str = Field(..., min_length=8)
    additional_evidence: Optional[List[str]] = Field(None, description="Supporting documents or transaction hashes")
    note: Optional[str] = Field(None, description="Optional context provided by the customer")

    @validator("binance_api_key", "binance_api_secret")
    def validate_credentials(cls, value: str) -> str:
        if " " in value:
            raise ValueError("Credentials cannot contain whitespace")
        return value


class VerificationTaskResponse(BaseModel):
    task_id: str
    order_id: str
    status: str
    submitted_at: datetime


class VerificationTaskDetailResponse(VerificationTaskResponse):
    submitted_by: str
    evidence: List[str] = []
    note: Optional[str] = None


class AppealRequest(BaseModel):
    order_id: str
    reason: str = Field(..., min_length=5)
    attachments: Optional[List[str]] = None
    preferred_channel: Optional[str] = Field(None, description="Email, Telegram, etc.")


class AppealResponse(BaseModel):
    appeal_id: str
    order_id: str
    status: str
    submitted_at: datetime


class AppealDetailResponse(AppealResponse):
    submitted_by: str
    reason: str
    attachments: List[str] = []
    preferred_channel: Optional[str] = None


class ExchangeKeyValidationRequest(BaseModel):
    api_key: str = Field(..., description="Binance API key")
    api_secret: str = Field(..., description="Binance API secret")
    passphrase: Optional[str] = Field(None, description="Optional passphrase if required by the exchange")
    permissions: Optional[List[str]] = Field(None, description="Permissions reported by the client UI")

    @validator("api_key", "api_secret")
    def validate_not_empty(cls, value: str) -> str:
        if not value or len(value) < 8:
            raise ValueError("API credentials must be at least 8 characters long")
        if any(char.isspace() for char in value):
            raise ValueError("API credentials cannot contain whitespace")
        return value


class ExchangeKeyValidationResponse(BaseModel):
    is_valid: bool
    is_read_only: bool
    permissions: List[str]
    message: str
    provider: str = "binance"


class EvidenceSyncRequest(BaseModel):
    order_id: str
    merkle_root: str
    onchain_tx_hash: str
    snapshot_uri: Optional[str] = None
    synced_by: Optional[str] = None


class EvidenceSyncResponse(BaseModel):
    event_id: str
    order_id: str
    status: str
    recorded_at: datetime


async def _cleanup_expired_nonces(current_time: datetime) -> None:
    """清理过期的nonce，避免内存占用"""
    async with nonce_lock:
        expired = [nonce for nonce, record in nonce_store.items() if record["expires_at"] <= current_time]
        for nonce in expired:
            nonce_store.pop(nonce, None)


async def _append_order_timeline(order_id: str, entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """向订单添加时间线事件并返回更新后的订单"""
    async with orders_lock:
        order = orders_store.get(order_id)
        if not order:
            return None

        timeline = order.setdefault("timeline", [])
        timeline.append(entry)
        order["updated_at"] = entry["timestamp"]
        return order


async def _get_order_for_wallet(order_id: str, wallet_address: str) -> Optional[Dict[str, Any]]:
    """获取属于指定钱包的订单副本"""
    async with orders_lock:
        order = orders_store.get(order_id)
        if not order:
            return None
        if order.get("wallet_address") != wallet_address:
            return None
        return {**order}


@app.get("/api/auth/nonce", response_model=NonceResponse, tags=["Authentication"])
async def issue_nonce(wallet_address: str = Query(..., description="Wallet address requesting a login nonce")):
    """生成登录所需的nonce，供前端发起钱包签名"""
    normalized_address = _normalize_wallet(wallet_address)
    await _cleanup_expired_nonces(datetime.utcnow())

    nonce = uuid4().hex
    message = f"Sign this message to authenticate with LeverageGuard: {nonce}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)

    async with nonce_lock:
        nonce_store[nonce] = {
            "wallet_address": normalized_address,
            "message": message,
            "expires_at": expires_at,
        }

    logger.info(f"Issued nonce for wallet {normalized_address}")
    return NonceResponse(wallet_address=normalized_address, nonce=nonce, message=message, expires_at=expires_at)


@app.post("/api/auth/session", response_model=SessionResponse, tags=["Authentication"])
async def create_session(payload: SessionRequest):
    """校验签名并颁发访问令牌"""
    async with nonce_lock:
        nonce_record = nonce_store.pop(payload.nonce, None)

    if not nonce_record:
        raise HTTPException(status_code=400, detail="Nonce is invalid or has expired")

    if nonce_record["wallet_address"] != payload.wallet_address:
        raise HTTPException(status_code=400, detail="Nonce does not match wallet address")

    if nonce_record["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Nonce has expired")

    message = encode_defunct(text=nonce_record["message"])
    try:
        recovered_address = Account.recover_message(message, signature=payload.signature)
    except ValueError as exc:
        logger.warning(f"Failed to recover address for nonce {payload.nonce}: {exc}")
        raise HTTPException(status_code=400, detail="Invalid wallet signature") from exc

    if _normalize_wallet(recovered_address) != payload.wallet_address:
        raise HTTPException(status_code=400, detail="Signature does not match wallet address")

    scopes = ["orders:create", "verification:submit", "appeals:create"]
    token_payload = {
        "sub": payload.wallet_address,
        "wallet_address": payload.wallet_address,
        "binance_uid": payload.binance_uid,
        "scopes": scopes,
    }

    token_pair: TokenPair = jwt_manager.create_token_pair(token_payload)
    issued_at = datetime.utcnow()

    async with session_lock:
        session_store[payload.wallet_address] = {
            "access_token": token_pair.access_token,
            "refresh_token": token_pair.refresh_token,
            "binance_uid": payload.binance_uid,
            "scopes": scopes,
            "metadata": payload.metadata or {},
            "issued_at": issued_at,
        }

    audit_logger.log_event(
        event_type="USER_LOGIN",
        user_id=payload.wallet_address,
        details={"method": "wallet_signature"},
        metadata={"binance_uid": payload.binance_uid},
    )

    return SessionResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        expires_in=token_pair.expires_in,
        refresh_expires_in=token_pair.refresh_expires_in,
        wallet_address=payload.wallet_address,
        binance_uid=payload.binance_uid,
        issued_at=issued_at,
    )


@app.post("/api/auth/session/refresh", response_model=SessionResponse, tags=["Authentication"])
async def refresh_session(payload: SessionRefreshRequest):
    """刷新会话令牌，维持登录状态"""
    normalized_address = payload.wallet_address

    async with session_lock:
        session = session_store.get(normalized_address)

    if not session or session.get("refresh_token") != payload.refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token is invalid or has been rotated")

    try:
        refresh_payload = jwt_manager.decode_token(payload.refresh_token)
    except AuthenticationError as auth_error:
        raise HTTPException(status_code=auth_error.status_code, detail=auth_error.message) from auth_error
    except JWTError as jwt_error:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from jwt_error

    token_type = refresh_payload.get("type")
    if token_type != "refresh":
        raise HTTPException(status_code=401, detail="Provided token is not a refresh token")

    refresh_subject = refresh_payload.get("sub") or refresh_payload.get("wallet_address")
    if not refresh_subject:
        raise HTTPException(status_code=401, detail="Refresh token subject does not match session")

    try:
        subject_normalized = _normalize_wallet(refresh_subject)
    except HTTPException as exc:
        raise HTTPException(status_code=401, detail="Refresh token subject does not match session") from exc

    if subject_normalized != normalized_address:
        raise HTTPException(status_code=401, detail="Refresh token subject does not match session")

    scopes = session.get("scopes", [])
    binance_uid = session.get("binance_uid")
    new_payload = {
        "sub": normalized_address,
        "wallet_address": normalized_address,
        "binance_uid": binance_uid,
        "scopes": scopes,
    }

    token_pair = jwt_manager.create_token_pair(new_payload)
    issued_at = datetime.utcnow()

    async with session_lock:
        session_store[normalized_address] = {
            **session,
            "access_token": token_pair.access_token,
            "refresh_token": token_pair.refresh_token,
            "issued_at": issued_at,
        }

    audit_logger.log_event(
        event_type="USER_SESSION_REFRESHED",
        user_id=normalized_address,
        details={"scopes": scopes},
        metadata={"binance_uid": binance_uid},
    )

    return SessionResponse(
        access_token=token_pair.access_token,
        refresh_token=token_pair.refresh_token,
        expires_in=token_pair.expires_in,
        refresh_expires_in=token_pair.refresh_expires_in,
        wallet_address=normalized_address,
        binance_uid=binance_uid,
        issued_at=issued_at,
    )


@app.post("/api/auth/session/revoke", response_model=SessionRevokeResponse, tags=["Authentication"], dependencies=[Depends(verify_token)])
async def revoke_session(request: Request):
    """注销当前用户的会话"""
    user = getattr(request.state, "user", {})
    wallet_address = user.get("wallet_address")
    if not wallet_address:
        raise HTTPException(status_code=400, detail="Missing wallet context")

    async with session_lock:
        session_store.pop(wallet_address, None)

    audit_logger.log_event(
        event_type="USER_LOGOUT",
        user_id=wallet_address,
        details={},
    )

    return SessionRevokeResponse(wallet_address=wallet_address, revoked=True, timestamp=datetime.utcnow())


@app.post("/api/orders", response_model=OrderResponse, tags=["Orders"])
async def create_order(order: OrderCreateRequest, user: Dict[str, Any] = Depends(verify_token)):
    """创建新的保单订单并推送到验证队列"""
    now = datetime.utcnow()
    order_id = uuid4().hex
    timeline_entry = _build_timeline_entry(
        event="order_created",
        status="pending_verification",
        metadata={"submitted_by": user["wallet_address"]},
    )

    order_record = {
        **order.dict(),
        "order_id": order_id,
        "status": "pending_verification",
        "created_at": now,
        "updated_at": now,
        "verification_tasks": [],
        "appeals": [],
        "timeline": [timeline_entry],
    }

    async with orders_lock:
        orders_store[order_id] = order_record

    try:
        mq_client.publish_message(
            QUEUE_VERIFICATION_REQUESTS,
            {
                "order_id": order_id,
                "wallet_address": order.wallet_address,
                "product_id": order.product_id,
                "exchange": order.exchange,
                "premium_amount": order.premium_amount,
                "coverage_amount": order.coverage_amount,
                "metadata": order.metadata or {},
            },
        )
    except Exception as exc:
        logger.warning(f"Failed to enqueue order {order_id} for verification: {exc}")

    audit_logger.log_event(
        event_type="ORDER_CREATED",
        user_id=user["wallet_address"],
        details={
            "order_id": order_id,
            "product_id": order.product_id,
            "exchange": order.exchange,
        },
        metadata=order.metadata or {},
    )

    return OrderResponse(**order_record)


@app.get("/api/orders", response_model=OrderListResponse, tags=["Orders"])
async def list_orders(
    status: Optional[str] = Query(None, description="Filter by order status"),
    limit: int = Query(25, ge=1, le=100, description="Maximum number of orders to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    user: Dict[str, Any] = Depends(verify_token),
):
    """列出当前钱包的订单"""
    normalized_address = user["wallet_address"]

    async with orders_lock:
        owned_orders = [
            {**order}
            for order in orders_store.values()
            if order.get("wallet_address") == normalized_address
            and (status is None or order.get("status") == status)
        ]

    owned_orders.sort(key=lambda item: item.get("created_at", datetime.min), reverse=True)

    sliced = owned_orders[offset : offset + limit]
    response_orders = [OrderResponse(**order) for order in sliced]
    return OrderListResponse(orders=response_orders, total=len(owned_orders))


@app.get("/api/orders/{order_id}/timeline", response_model=List[OrderTimelineEntry], tags=["Orders"])
async def get_order_timeline(order_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """查看订单的时间线事件"""
    order = await _get_order_for_wallet(order_id, user["wallet_address"])
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    timeline_entries = order.get("timeline", [])
    return [
        entry if isinstance(entry, OrderTimelineEntry) else OrderTimelineEntry(**entry)
        for entry in timeline_entries
    ]


@app.get("/api/orders/{order_id}/appeals", response_model=List[AppealDetailResponse], tags=["Appeals"])
async def list_order_appeals(order_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """列出订单相关的所有申诉"""
    order = await _get_order_for_wallet(order_id, user["wallet_address"])
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    appeal_ids = order.get("appeals", [])
    async with appeals_lock:
        appeals = [
            AppealDetailResponse(**record)
            for appeal_id in appeal_ids
            if (record := appeals_store.get(appeal_id))
        ]

    appeals.sort(key=lambda entry: entry.submitted_at, reverse=True)
    return appeals


@app.get("/api/verification", response_model=List[VerificationTaskDetailResponse], tags=["Order Verification"])
async def list_verification_tasks(user: Dict[str, Any] = Depends(verify_token)):
    """列出当前用户提交的所有验证任务"""
    normalized_address = user["wallet_address"]

    async with verification_lock:
        tasks = [
            VerificationTaskDetailResponse(**task)
            for task in verification_tasks_store.values()
            if task.get("submitted_by") == normalized_address
        ]

    tasks.sort(key=lambda task: task.submitted_at, reverse=True)
    return tasks


@app.get(
    "/api/verification/{task_id}",
    response_model=VerificationTaskDetailResponse,
    tags=["Order Verification"],
)
async def get_verification_task(task_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """查看单个验证任务的状态"""
    async with verification_lock:
        task = verification_tasks_store.get(task_id)

    if not task or task.get("submitted_by") != user["wallet_address"]:
        raise HTTPException(status_code=404, detail="Verification task not found")

    return VerificationTaskDetailResponse(**task)


@app.get("/api/orders/{order_id}", response_model=OrderResponse, tags=["Orders"])
async def get_order(order_id: str, user: Dict[str, Any] = Depends(verify_token)):
    """查询订单状态"""
    order = await _get_order_for_wallet(order_id, user["wallet_address"])

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    logger.info(f"Order {order_id} retrieved by {user['wallet_address']}")

    return OrderResponse(**order)


@app.post("/api/verification", response_model=VerificationTaskResponse, tags=["Order Verification"])
async def submit_verification(payload: VerificationRequest, user: Dict[str, Any] = Depends(verify_token)):
    """提交订单验证请求"""
    async with orders_lock:
        order = orders_store.get(payload.order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    task_id = uuid4().hex
    submitted_at = datetime.utcnow()
    task_record = {
        "task_id": task_id,
        "order_id": payload.order_id,
        "status": "received",
        "submitted_at": submitted_at,
        "submitted_by": user["wallet_address"],
        "evidence": payload.additional_evidence or [],
        "note": payload.note,
    }

    async with verification_lock:
        verification_tasks_store[task_id] = task_record

    async with orders_lock:
        order = orders_store.get(payload.order_id)
        if order:
            order.setdefault("verification_tasks", []).append(task_id)
            order["status"] = "under_review"
            order.setdefault("timeline", []).append(
                _build_timeline_entry(
                    event="verification_submitted",
                    status="under_review",
                    metadata={"task_id": task_id, "submitted_by": user["wallet_address"]},
                )
            )
            order["updated_at"] = submitted_at

    try:
        mq_client.publish_message(
            QUEUE_VERIFICATION_REQUESTS,
            {
                "task_id": task_id,
                "order_id": payload.order_id,
                "binance_api_key": payload.binance_api_key,
                "binance_api_secret": payload.binance_api_secret,
                "additional_evidence": payload.additional_evidence or [],
                "note": payload.note,
            },
        )
    except Exception as exc:
        logger.warning(f"Failed to enqueue verification task {task_id}: {exc}")

    audit_logger.log_event(
        event_type="VERIFICATION_SUBMITTED",
        user_id=user["wallet_address"],
        details={"order_id": payload.order_id, "task_id": task_id},
    )

    return VerificationTaskResponse(task_id=task_id, order_id=payload.order_id, status="received", submitted_at=submitted_at)


@app.post("/api/appeals", response_model=AppealResponse, tags=["Appeals"])
async def submit_appeal(payload: AppealRequest, user: Dict[str, Any] = Depends(verify_token)):
    """提交申诉信息，供人工或半自动流程处理"""
    async with orders_lock:
        order = orders_store.get(payload.order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    appeal_id = uuid4().hex
    submitted_at = datetime.utcnow()
    appeal_record = {
        "appeal_id": appeal_id,
        "order_id": payload.order_id,
        "status": "pending",
        "submitted_at": submitted_at,
        "submitted_by": user["wallet_address"],
        "reason": payload.reason,
        "attachments": payload.attachments or [],
        "preferred_channel": payload.preferred_channel,
    }

    async with appeals_lock:
        appeals_store[appeal_id] = appeal_record

    async with orders_lock:
        order = orders_store.get(payload.order_id)
        if order:
            order.setdefault("appeals", []).append(appeal_id)
            order.setdefault("timeline", []).append(
                _build_timeline_entry(
                    event="appeal_submitted",
                    status="appeal_pending",
                    metadata={"appeal_id": appeal_id, "submitted_by": user["wallet_address"]},
                )
            )
            order["updated_at"] = submitted_at

    audit_logger.log_event(
        event_type="APPEAL_SUBMITTED",
        user_id=user["wallet_address"],
        details={"order_id": payload.order_id, "appeal_id": appeal_id},
        metadata={"preferred_channel": payload.preferred_channel},
    )

    return AppealResponse(appeal_id=appeal_id, order_id=payload.order_id, status="pending", submitted_at=submitted_at)


@app.post("/api/exchange/validate-key", response_model=ExchangeKeyValidationResponse, tags=["Exchange"])
async def validate_exchange_key(payload: ExchangeKeyValidationRequest, user: Dict[str, Any] = Depends(verify_token)):
    """对用户提交的Binance API Key进行基础格式校验"""
    detected_permissions = [perm.lower() for perm in (payload.permissions or [])]

    read_only_indicators = {"read", "read_only", "read-only", "query"}
    is_read_only = bool(detected_permissions) and all(perm in read_only_indicators for perm in detected_permissions)

    if not detected_permissions:
        # 简单启发式：密钥以 "ro" 开头视为只读
        is_read_only = payload.api_key.lower().startswith("ro")

    message = "API key format is valid"
    if not is_read_only:
        message = "API key should be scoped to read-only permissions"

    audit_logger.log_event(
        event_type="EXCHANGE_KEY_VALIDATED",
        user_id=user["wallet_address"],
        details={"is_read_only": is_read_only},
        metadata={"permissions": detected_permissions or []},
    )

    return ExchangeKeyValidationResponse(
        is_valid=True,
        is_read_only=is_read_only,
        permissions=detected_permissions or (["read_only"] if is_read_only else []),
        message=message,
    )


@app.post("/internal/sync/evidence", response_model=EvidenceSyncResponse, tags=["Internal"])
async def record_evidence_sync(payload: EvidenceSyncRequest, user: Dict[str, Any] = Depends(verify_token)):
    """记录与日本节点同步的链上证据信息"""
    async with orders_lock:
        if payload.order_id not in orders_store:
            raise HTTPException(status_code=404, detail="Order not found")

    event_id = uuid4().hex
    recorded_at = datetime.utcnow()
    record = {
        "event_id": event_id,
        "order_id": payload.order_id,
        "merkle_root": payload.merkle_root,
        "onchain_tx_hash": payload.onchain_tx_hash,
        "snapshot_uri": payload.snapshot_uri,
        "synced_by": payload.synced_by or user.get("wallet_address"),
        "recorded_at": recorded_at,
    }

    async with evidence_lock:
        evidence_sync_log.append(record)

    await _append_order_timeline(
        payload.order_id,
        _build_timeline_entry(
            event="evidence_synced",
            status="synced",
            metadata={
                "event_id": event_id,
                "merkle_root": payload.merkle_root,
                "onchain_tx_hash": payload.onchain_tx_hash,
            },
        ),
    )

    audit_logger.log_event(
        event_type="EVIDENCE_SYNC_RECORDED",
        user_id=user.get("wallet_address"),
        details={
            "order_id": payload.order_id,
            "event_id": event_id,
            "merkle_root": payload.merkle_root,
            "onchain_tx_hash": payload.onchain_tx_hash,
        },
    )

    return EvidenceSyncResponse(event_id=event_id, order_id=payload.order_id, status="recorded", recorded_at=recorded_at)

# 请求计时和日志中间件
@app.middleware("http")
async def log_request_middleware(request: Request, call_next):
    """记录请求信息和处理时间"""
    start_time = time.time()
    
    # 记录请求开始
    path = request.url.path
    method = request.method
    client_ip = request.client.host if request.client else "unknown"
    
    logger.debug(f"Request started: {method} {path} from {client_ip}")
    
    try:
        # 处理请求
        response = await call_next(request)
        
        # 计算处理时间
        process_time = (time.time() - start_time) * 1000  # 转换为毫秒
        
        # 记录请求完成
        status_code = response.status_code
        logger.debug(f"Request completed: {method} {path} - {status_code} ({process_time:.2f}ms)")
        
        # 记录审计日志
        try:
            user_id = "anonymous"
            # 尝试从请求中获取用户信息
            if hasattr(request.state, "user"):
                user_info = getattr(request.state, "user", {})
                if isinstance(user_info, dict):
                    user_id = user_info.get("user_id") or user_info.get("wallet_address", "anonymous")

            audit_logger.log_api_request(
                user_id=user_id,
                endpoint=path,
                method=method,
                status_code=status_code,
                duration_ms=process_time
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {str(e)}")
        
        return response
    except Exception as e:
        # 记录异常
        process_time = (time.time() - start_time) * 1000
        logger.error(f"Request failed: {method} {path} - {str(e)} ({process_time:.2f}ms)")
        
        # 返回统一的错误响应
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )

# 服务健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查API网关健康状态"""
    # 检查各服务连接状态
    services_status = {}
    for service_name, service_url in SERVICES.items():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{service_url}/health")
                services_status[service_name] = {
                    "status": "up" if response.status_code == 200 else "down",
                    "status_code": response.status_code
                }
        except Exception as e:
            services_status[service_name] = {
                "status": "down",
                "error": str(e)
            }
    
    # 检查消息队列连接
    mq_status = "up" if mq_client.connected or mq_client.connect() else "down"
    
    # 总体健康状态
    overall_status = "up" if all(s["status"] == "up" for s in services_status.values()) and mq_status == "up" else "down"
    
    return {
        "status": overall_status,
        "timestamp": time.time(),
        "services": services_status,
        "message_queue": mq_status
    }

# 通用的服务代理函数
async def proxy_request(service_name: str, path: str, method: str, request: Request):
    """代理请求到指定的微服务"""
    if service_name not in SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")
    
    service_url = SERVICES[service_name]
    target_url = f"{service_url}{path}"
    
    # 获取请求头和请求体
    headers = dict(request.headers)
    # 移除host头，让httpx自动设置
    headers.pop("host", None)
    
    try:
        # 读取请求体
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            
        # 转发请求到目标服务
        response = await http_client.request(
            method=method,
            url=target_url,
            headers=headers,
            content=body,
            params=request.query_params
        )
        
        # 返回目标服务的响应
        return JSONResponse(
            content=response.json(),
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except httpx.TimeoutException:
        logger.error(f"Request to {service_name} timed out: {target_url}")
        raise HTTPException(status_code=504, detail=f"Service '{service_name}' timeout")
    except httpx.HTTPError as e:
        logger.error(f"HTTP error when calling {service_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calling service '{service_name}'")
    except Exception as e:
        logger.error(f"Unexpected error when proxying to {service_name}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# 订单验证服务代理路由
@app.api_route("/api/verify/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Order Verification"])
async def proxy_order_verification(request: Request, path: str):
    """代理请求到订单验证服务"""
    return await proxy_request("order_verification", f"/api/verify/{path}", request.method, request)

# 赔付处理服务代理路由
@app.api_route("/api/payout/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Payout Processing"])
async def proxy_payout_processing(request: Request, path: str):
    """代理请求到赔付处理服务"""
    return await proxy_request("payout_processing", f"/api/payout/{path}", request.method, request)

# 资金管理服务代理路由
@app.api_route("/api/fund/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Fund Management"])
async def proxy_fund_management(request: Request, path: str):
    """代理请求到资金管理服务"""
    return await proxy_request("fund_management", f"/api/fund/{path}", request.method, request)

# 报告生成服务代理路由
@app.api_route("/api/report/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Report Generation"])
async def proxy_report_generation(request: Request, path: str):
    """代理请求到报告生成服务"""
    return await proxy_request("report_generation", f"/api/report/{path}", request.method, request)

# 直接发布消息到消息队列的端点（用于演示）
@app.post("/api/message/{queue_name}", tags=["Message Queue"], dependencies=[Depends(verify_token)])
async def publish_message(queue_name: str, message: dict, request: Request):
    """发布消息到指定的消息队列（需要认证）"""
    try:
        success = mq_client.publish_message(queue_name, message)
        if success:
            logger.info(f"Message published to queue '{queue_name}' via API Gateway")
            return {"status": "success", "message": f"Message published to queue '{queue_name}'"}
        else:
            raise HTTPException(status_code=500, detail="Failed to publish message")
    except Exception as e:
        logger.error(f"Error publishing message to queue '{queue_name}': {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 应用启动和关闭事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("API Gateway starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.warning("Failed to connect to message queue during startup")
    
    # 预热HTTP客户端连接池
    for service_name, service_url in SERVICES.items():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.get(f"{service_url}/health")
                logger.info(f"Connected to {service_name} service at {service_url}")
        except Exception as e:
            logger.warning(f"Failed to connect to {service_name} service at startup: {str(e)}")
    
    logger.info("API Gateway started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("API Gateway shutting down...")
    
    # 关闭HTTP客户端
    await http_client.aclose()
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("API Gateway shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('api_gateway.host', '0.0.0.0')
    port = config_manager.get('api_gateway.port', 8000)
    
    logger.info(f"Starting API Gateway on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('api_gateway.workers', 1)  # 工作进程数
    )