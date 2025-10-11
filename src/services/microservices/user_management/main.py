from fastapi import FastAPI, HTTPException, Depends, Request, Security
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Dict, Optional, Any, Union
import uvicorn
import time
import asyncio
import os
import json
import bcrypt
import jwt
import secrets
import re
from datetime import datetime, timedelta
import uuid

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_USER_EVENTS

# 初始化FastAPI应用
app = FastAPI(
    title="User Management Service",
    description="Service for managing LeverageGuard users and authentication",
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
SECRET_KEY = config_manager.get('auth.secret_key', secrets.token_urlsafe(32))
ALGORITHM = config_manager.get('auth.algorithm', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = config_manager.get('auth.access_token_expire_minutes', 30)
REFRESH_TOKEN_EXPIRE_DAYS = config_manager.get('auth.refresh_token_expire_days', 7)

# OAuth2配置
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
bearer_scheme = HTTPBearer()

# 用户角色定义
USER_ROLES = {
    "USER": {"permissions": ["read_profile", "update_profile", "create_order", "view_reports"]},
    "ADMIN": {"permissions": ["all_permissions"]},
    "MANAGER": {"permissions": ["read_profile", "update_profile", "view_users", "view_reports", "manage_orders"]},
    "AUDITOR": {"permissions": ["read_profile", "view_reports", "audit_logs"]}
}

# 最小密码长度
MIN_PASSWORD_LENGTH = config_manager.get('auth.min_password_length', 8)

# 用户注册模型
class UserRegistration(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")
    full_name: str = Field(..., description="User's full name")
    user_address: str = Field(..., description="User's blockchain address")
    phone_number: Optional[str] = Field(None, description="User's phone number")
    referral_code: Optional[str] = Field(None, description="Referral code")

    @validator('password')
    def validate_password(cls, v):
        """验证密码强度"""
        if len(v) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @validator('user_address')
    def validate_address(cls, v):
        """验证区块链地址格式"""
        # 简单的以太坊地址验证
        if not re.match(r"^0x[0-9a-fA-F]{40}$", v):
            raise ValueError("Invalid blockchain address format")
        return v.lower()  # 转为小写以保持一致性

# 用户模型
class User(BaseModel):
    user_id: str = Field(..., description="Unique user identifier")
    email: EmailStr = Field(..., description="User's email address")
    full_name: str = Field(..., description="User's full name")
    user_address: str = Field(..., description="User's blockchain address")
    role: str = Field(default="USER", description="User role")
    phone_number: Optional[str] = Field(None, description="User's phone number")
    is_verified: bool = Field(default=False, description="Whether the user is verified")
    is_active: bool = Field(default=True, description="Whether the user account is active")
    created_at: int = Field(..., description="Account creation timestamp")
    last_login: Optional[int] = Field(None, description="Last login timestamp")
    failed_login_attempts: int = Field(default=0, description="Number of failed login attempts")
    locked_until: Optional[int] = Field(None, description="Account locked until timestamp")
    referral_code: Optional[str] = Field(None, description="Referral code used during registration")
    two_factor_enabled: bool = Field(default=False, description="Whether two-factor authentication is enabled")

# 用户更新模型
class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, description="User's full name")
    phone_number: Optional[str] = Field(None, description="User's phone number")
    two_factor_enabled: Optional[bool] = Field(None, description="Whether to enable two-factor authentication")

# 密码更新模型
class PasswordUpdate(BaseModel):
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., description="New password")
    confirm_new_password: str = Field(..., description="Confirmation of new password")

    @validator('new_password')
    def validate_new_password(cls, v):
        """验证新密码强度"""
        if len(v) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @validator('confirm_new_password')
    def validate_password_match(cls, v, values):
        """验证两次输入的新密码是否匹配"""
        if 'new_password' in values and v != values['new_password']:
            raise ValueError("New passwords do not match")
        return v

# 令牌响应模型
class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Access token expiration in seconds")

# 验证响应模型
class VerificationResponse(BaseModel):
    status: str = Field(..., description="Verification status")
    message: str = Field(..., description="Status message")
    verification_code: Optional[str] = Field(None, description="Verification code")

# 角色权限模型
class RolePermission(BaseModel):
    role: str = Field(..., description="User role")
    permissions: List[str] = Field(..., description="List of permissions")

# 内部函数：哈希密码
def hash_password(password: str) -> str:
    """将密码哈希化"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

# 内部函数：验证密码
def verify_password(password: str, hashed_password: str) -> bool:
    """验证密码是否匹配哈希密码"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

# 内部函数：创建访问令牌
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT访问令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 内部函数：创建刷新令牌
def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建JWT刷新令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 内部函数：解码令牌
def decode_token(token: str) -> dict:
    """解码JWT令牌"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# 内部函数：生成验证码
def generate_verification_code(length: int = 6) -> str:
    """生成数字验证码"""
    return ''.join([str(secrets.randbelow(10)) for _ in range(length)])

# 内部函数：检查用户是否存在（简化实现）
def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """根据邮箱获取用户信息"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询用户信息
    # 这里返回示例数据，假设用户存在
    if email == "example@example.com":
        return {
            "user_id": "user-12345",
            "email": email,
            "password_hash": hash_password("Password123!"),
            "full_name": "John Doe",
            "user_address": "0x742d35cc6634c0532925a3b844bc454e4438f44e",
            "role": "USER",
            "is_verified": True,
            "is_active": True,
            "created_at": int(time.time()) - 86400,  # 1天前创建
            "last_login": int(time.time()) - 3600,  # 1小时前登录
            "failed_login_attempts": 0,
            "locked_until": None,
            "referral_code": None,
            "two_factor_enabled": False
        }
    return None

# 内部函数：创建新用户（简化实现）
def create_user(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """创建新用户"""
    # 注意：这是一个简化的实现。在实际应用中，应该将用户信息存储到数据库中
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    now = int(time.time())
    
    user = {
        "user_id": user_id,
        "email": user_data["email"],
        "password_hash": hash_password(user_data["password"]),
        "full_name": user_data["full_name"],
        "user_address": user_data["user_address"],
        "role": "USER",
        "is_verified": False,
        "is_active": True,
        "created_at": now,
        "last_login": None,
        "failed_login_attempts": 0,
        "locked_until": None,
        "referral_code": user_data.get("referral_code"),
        "two_factor_enabled": False
    }
    
    # 发布用户创建事件到消息队列
    user_event = {
        "event_type": "USER_CREATED",
        "user_id": user_id,
        "email": user["email"],
        "user_address": user["user_address"],
        "timestamp": now
    }
    mq_client.publish_message(QUEUE_USER_EVENTS, user_event)
    
    # 记录审计日志
    audit_logger.log_user_creation(
        user_id=user_id,
        email=user["email"],
        user_address=user["user_address"]
    )
    
    return user

# 内部函数：更新用户信息（简化实现）
def update_user(user_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """更新用户信息"""
    # 注意：这是一个简化的实现。在实际应用中，应该从数据库中查询并更新用户信息
    # 这里假设用户存在并返回示例数据
    if user_id == "user-12345":
        user = {
            "user_id": user_id,
            "email": "example@example.com",
            "password_hash": hash_password("Password123!"),
            "full_name": update_data.get("full_name", "John Doe"),
            "user_address": "0x742d35cc6634c0532925a3b844bc454e4438f44e",
            "role": "USER",
            "is_verified": True,
            "is_active": True,
            "created_at": int(time.time()) - 86400,
            "last_login": int(time.time()) - 3600,
            "failed_login_attempts": 0,
            "locked_until": None,
            "referral_code": None,
            "two_factor_enabled": update_data.get("two_factor_enabled", False)
        }
        
        # 发布用户更新事件到消息队列
        user_event = {
            "event_type": "USER_UPDATED",
            "user_id": user_id,
            "updated_fields": list(update_data.keys()),
            "timestamp": int(time.time())
        }
        mq_client.publish_message(QUEUE_USER_EVENTS, user_event)
        
        # 记录审计日志
        audit_logger.log_user_update(
            user_id=user_id,
            updated_fields=list(update_data.keys())
        )
        
        return user
    return None

# 内部函数：检查用户是否有指定权限
def check_permission(user_role: str, permission: str) -> bool:
    """检查用户角色是否有指定权限"""
    # 如果角色不存在，返回False
    if user_role not in USER_ROLES:
        return False
    
    # 如果角色有'all_permissions'权限，直接返回True
    if "all_permissions" in USER_ROLES[user_role]["permissions"]:
        return True
    
    # 检查是否有指定权限
    return permission in USER_ROLES[user_role]["permissions"]

# 依赖项：获取当前用户
def get_current_user(credentials: HTTPAuthorizationCredentials = Security(bearer_scheme)) -> Dict[str, Any]:
    """获取当前已认证的用户"""
    try:
        # 解码令牌
        payload = decode_token(credentials.credentials)
        
        # 从令牌中获取用户信息
        user_id = payload.get("sub")
        email = payload.get("email")
        
        # 在实际应用中，应该从数据库中获取用户信息
        # 这里使用示例数据
        if user_id == "user-12345" or email == "example@example.com":
            user = {
                "user_id": "user-12345",
                "email": "example@example.com",
                "full_name": "John Doe",
                "user_address": "0x742d35cc6634c0532925a3b844bc454e4438f44e",
                "role": "USER",
                "is_verified": True,
                "is_active": True
            }
            return user
        
        raise HTTPException(status_code=401, detail="User not found")
    except Exception as e:
        logger.error(f"Error in get_current_user: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# 依赖项：检查用户权限
def check_user_permission(permission: str):
    """检查当前用户是否有指定权限"""
    def permission_dependency(user: Dict[str, Any] = Depends(get_current_user)):
        if not check_permission(user["role"], permission):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return permission_dependency

# API端点：健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查用户管理服务健康状态"""
    # 检查消息队列连接
    mq_connected = mq_client.connected or mq_client.connect()
    
    # 总体健康状态
    overall_status = "up" if mq_connected else "down"
    
    return {
        "status": overall_status,
        "timestamp": int(time.time()),
        "message_queue_connected": mq_connected
    }

# API端点：用户注册
@app.post("/api/auth/register", tags=["Authentication"], response_model=Dict[str, Any])
async def register_user(user_data: UserRegistration):
    """注册新用户"""
    try:
        logger.info(f"User registration attempt: {user_data.email}")
        
        # 检查用户是否已存在
        if get_user_by_email(user_data.email):
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # 创建新用户
        user_dict = user_data.dict()
        new_user = create_user(user_dict)
        
        # 生成验证代码（在实际应用中，应该发送验证邮件）
        verification_code = generate_verification_code()
        
        # 记录注册成功日志
        logger.info(f"User registered successfully: {user_data.email}")
        
        # 返回用户信息（不包含敏感数据）
        return {
            "status": "success",
            "message": "User registered successfully. Please verify your email.",
            "user_id": new_user["user_id"],
            "email": new_user["email"],
            "verification_code": verification_code,  # 在实际应用中不应该返回此值
            "timestamp": int(time.time())
        }
    except HTTPException as e:
        logger.error(f"User registration failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in register_user: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：用户登录
@app.post("/api/auth/token", tags=["Authentication"], response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """用户登录并获取令牌"""
    try:
        logger.info(f"User login attempt: {form_data.username}")
        
        # 获取用户信息
        user = get_user_by_email(form_data.username)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # 检查账户是否被锁定
        now = int(time.time())
        if user["locked_until"] and user["locked_until"] > now:
            remaining_minutes = (user["locked_until"] - now) // 60
            raise HTTPException(
                status_code=401, 
                detail=f"Account locked. Try again in {remaining_minutes} minutes."
            )
        
        # 检查账户是否活跃
        if not user["is_active"]:
            raise HTTPException(status_code=401, detail="Account is inactive")
        
        # 验证密码
        if not verify_password(form_data.password, user["password_hash"]):
            # 增加失败登录尝试次数
            user["failed_login_attempts"] += 1
            
            # 如果失败次数达到阈值，锁定账户
            if user["failed_login_attempts"] >= 5:
                user["locked_until"] = now + (15 * 60)  # 锁定15分钟
                logger.warning(f"Account locked due to multiple failed attempts: {form_data.username}")
                raise HTTPException(status_code=401, detail="Account locked due to multiple failed login attempts")
            
            logger.warning(f"Invalid password for user: {form_data.username}")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # 重置失败登录尝试次数
        user["failed_login_attempts"] = 0
        
        # 更新最后登录时间
        user["last_login"] = now
        
        # 创建访问令牌和刷新令牌
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["user_id"], "email": user["email"], "role": user["role"]},
            expires_delta=access_token_expires
        )
        
        refresh_token = create_refresh_token(
            data={"sub": user["user_id"], "email": user["email"]}
        )
        
        # 发布用户登录事件到消息队列
        login_event = {
            "event_type": "USER_LOGIN",
            "user_id": user["user_id"],
            "email": user["email"],
            "ip_address": "127.0.0.1",  # 在实际应用中应该获取真实IP
            "timestamp": now
        }
        mq_client.publish_message(QUEUE_USER_EVENTS, login_event)
        
        # 记录审计日志
        audit_logger.log_user_login(
            user_id=user["user_id"],
            email=user["email"]
        )
        
        logger.info(f"User logged in successfully: {form_data.username}")
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": access_token_expires.seconds
        }
    except HTTPException as e:
        logger.error(f"User login failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：刷新令牌
@app.post("/api/auth/refresh", tags=["Authentication"], response_model=TokenResponse)
async def refresh_token(request: Request):
    """使用刷新令牌获取新的访问令牌"""
    try:
        # 从请求头中获取刷新令牌
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
        
        refresh_token = auth_header[len("Bearer "):]
        
        # 解码刷新令牌
        payload = decode_token(refresh_token)
        
        # 验证令牌类型
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        # 获取用户信息
        user_id = payload.get("sub")
        email = payload.get("email")
        
        # 在实际应用中，应该从数据库中获取用户信息
        # 这里使用示例数据
        user = {
            "user_id": user_id,
            "email": email,
            "role": "USER",
            "is_active": True
        }
        
        # 检查账户是否活跃
        if not user["is_active"]:
            raise HTTPException(status_code=401, detail="Account is inactive")
        
        # 创建新的访问令牌
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["user_id"], "email": user["email"], "role": user["role"]},
            expires_delta=access_token_expires
        )
        
        # 创建新的刷新令牌
        new_refresh_token = create_refresh_token(
            data={"sub": user["user_id"], "email": user["email"]}
        )
        
        logger.info(f"Token refreshed for user: {email}")
        
        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": access_token_expires.seconds
        }
    except HTTPException as e:
        logger.error(f"Token refresh failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in refresh_token: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：用户登出
@app.post("/api/auth/logout", tags=["Authentication"])
async def logout(user: Dict[str, Any] = Depends(get_current_user)):
    """用户登出"""
    try:
        # 在实际应用中，应该将令牌添加到黑名单或执行其他登出操作
        
        # 发布用户登出事件到消息队列
        logout_event = {
            "event_type": "USER_LOGOUT",
            "user_id": user["user_id"],
            "email": user["email"],
            "timestamp": int(time.time())
        }
        mq_client.publish_message(QUEUE_USER_EVENTS, logout_event)
        
        # 记录审计日志
        audit_logger.log_user_logout(
            user_id=user["user_id"],
            email=user["email"]
        )
        
        logger.info(f"User logged out: {user['email']}")
        
        return {
            "status": "success",
            "message": "Successfully logged out",
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in logout: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：获取当前用户信息
@app.get("/api/users/me", tags=["User Management"], response_model=User)
async def get_current_user_info(user: Dict[str, Any] = Depends(get_current_user)):
    """获取当前已认证用户的详细信息"""
    try:
        # 在实际应用中，应该从数据库中获取用户信息
        # 这里使用示例数据
        user_info = User(
            user_id="user-12345",
            email="example@example.com",
            full_name="John Doe",
            user_address="0x742d35cc6634c0532925a3b844bc454e4438f44e",
            role="USER",
            is_verified=True,
            is_active=True,
            created_at=int(time.time()) - 86400,
            last_login=int(time.time()) - 3600,
            failed_login_attempts=0,
            locked_until=None,
            referral_code=None,
            two_factor_enabled=False
        )
        
        logger.info(f"User profile accessed: {user['email']}")
        
        return user_info
    except Exception as e:
        logger.error(f"Error in get_current_user_info: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：更新用户信息
@app.put("/api/users/me", tags=["User Management"], response_model=User)
async def update_current_user(user_data: UserUpdate, user: Dict[str, Any] = Depends(get_current_user)):
    """更新当前用户信息"""
    try:
        logger.info(f"User update attempt: {user['email']}")
        
        # 更新用户信息
        updated_user = update_user(user["user_id"], user_data.dict(exclude_unset=True))
        
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # 将字典转换为User模型
        user_model = User(
            user_id=updated_user["user_id"],
            email=updated_user["email"],
            full_name=updated_user["full_name"],
            user_address=updated_user["user_address"],
            role=updated_user["role"],
            is_verified=updated_user["is_verified"],
            is_active=updated_user["is_active"],
            created_at=updated_user["created_at"],
            last_login=updated_user["last_login"],
            failed_login_attempts=updated_user["failed_login_attempts"],
            locked_until=updated_user["locked_until"],
            referral_code=updated_user["referral_code"],
            two_factor_enabled=updated_user["two_factor_enabled"]
        )
        
        logger.info(f"User profile updated: {user['email']}")
        
        return user_model
    except HTTPException as e:
        logger.error(f"User update failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in update_current_user: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：更新用户密码
@app.put("/api/users/me/password", tags=["User Management"])
async def update_password(password_data: PasswordUpdate, user: Dict[str, Any] = Depends(get_current_user)):
    """更新当前用户密码"""
    try:
        logger.info(f"Password update attempt: {user['email']}")
        
        # 获取用户信息（包含密码哈希）
        user_details = get_user_by_email(user["email"])
        
        if not user_details:
            raise HTTPException(status_code=404, detail="User not found")
        
        # 验证当前密码
        if not verify_password(password_data.current_password, user_details["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        # 检查新密码是否与当前密码相同
        if password_data.current_password == password_data.new_password:
            raise HTTPException(status_code=400, detail="New password cannot be the same as current password")
        
        # 在实际应用中，应该更新数据库中的密码哈希
        # 这里只记录日志
        logger.info(f"Password updated for user: {user['email']}")
        
        # 发布密码更新事件到消息队列
        password_event = {
            "event_type": "PASSWORD_UPDATED",
            "user_id": user["user_id"],
            "email": user["email"],
            "timestamp": int(time.time())
        }
        mq_client.publish_message(QUEUE_USER_EVENTS, password_event)
        
        # 记录审计日志
        audit_logger.log_password_change(
            user_id=user["user_id"],
            email=user["email"]
        )
        
        return {
            "status": "success",
            "message": "Password updated successfully",
            "timestamp": int(time.time())
        }
    except HTTPException as e:
        logger.error(f"Password update failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in update_password: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：发送验证邮件
@app.post("/api/users/me/verify", tags=["User Management"], response_model=VerificationResponse)
async def send_verification_email(user: Dict[str, Any] = Depends(get_current_user)):
    """发送邮箱验证邮件"""
    try:
        logger.info(f"Verification email requested: {user['email']}")
        
        # 检查用户是否已经验证
        if user["is_verified"]:
            return {
                "status": "success",
                "message": "Email already verified",
                "verification_code": None
            }
        
        # 生成验证代码
        verification_code = generate_verification_code()
        
        # 在实际应用中，应该发送验证邮件
        # 这里只记录日志
        logger.info(f"Verification code generated for user: {user['email']}")
        
        # 发布验证事件到消息队列
        verify_event = {
            "event_type": "VERIFICATION_EMAIL_SENT",
            "user_id": user["user_id"],
            "email": user["email"],
            "timestamp": int(time.time())
        }
        mq_client.publish_message(QUEUE_USER_EVENTS, verify_event)
        
        # 记录审计日志
        audit_logger.log_email_verification(
            user_id=user["user_id"],
            email=user["email"]
        )
        
        return {
            "status": "success",
            "message": "Verification email sent",
            "verification_code": verification_code  # 在实际应用中不应该返回此值
        }
    except Exception as e:
        logger.error(f"Error in send_verification_email: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：验证邮箱
@app.post("/api/users/me/verify/{code}", tags=["User Management"], response_model=VerificationResponse)
async def verify_email(code: str, user: Dict[str, Any] = Depends(get_current_user)):
    """验证用户邮箱"""
    try:
        logger.info(f"Email verification attempt: {user['email']}")
        
        # 检查用户是否已经验证
        if user["is_verified"]:
            return {
                "status": "success",
                "message": "Email already verified"
            }
        
        # 在实际应用中，应该验证代码是否有效
        # 这里假设验证代码为"123456"时验证成功
        if code == "123456":
            # 更新用户验证状态
            # 在实际应用中，应该更新数据库中的用户信息
            logger.info(f"Email verified successfully: {user['email']}")
            
            # 发布验证成功事件到消息队列
            verify_event = {
                "event_type": "EMAIL_VERIFIED",
                "user_id": user["user_id"],
                "email": user["email"],
                "timestamp": int(time.time())
            }
            mq_client.publish_message(QUEUE_USER_EVENTS, verify_event)
            
            # 记录审计日志
            audit_logger.log_email_verification_success(
                user_id=user["user_id"],
                email=user["email"]
            )
            
            return {
                "status": "success",
                "message": "Email verified successfully"
            }
        else:
            logger.warning(f"Invalid verification code: {user['email']}")
            raise HTTPException(status_code=400, detail="Invalid verification code")
    except HTTPException as e:
        logger.error(f"Email verification failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error in verify_email: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：获取角色权限列表
@app.get("/api/roles", tags=["Role Management"], response_model=List[RolePermission])
async def get_roles():
    """获取所有可用角色及其权限"""
    try:
        # 转换角色权限字典为列表
        roles_list = [
            RolePermission(role=role, permissions=details["permissions"])
            for role, details in USER_ROLES.items()
        ]
        
        logger.info("Roles and permissions list accessed")
        
        return roles_list
    except Exception as e:
        logger.error(f"Error in get_roles: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# API端点：检查当前用户角色权限
@app.get("/api/users/me/permissions", tags=["User Management"])
async def get_user_permissions(user: Dict[str, Any] = Depends(get_current_user)):
    """获取当前用户的权限列表"""
    try:
        # 获取用户角色的权限
        permissions = USER_ROLES.get(user["role"], {}).get("permissions", [])
        
        logger.info(f"User permissions accessed: {user['email']}")
        
        return {
            "role": user["role"],
            "permissions": permissions,
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Error in get_user_permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("User Management Service starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.error("Failed to connect to message queue")
        # 在实际应用中，可能需要根据配置决定是否继续启动服务
    
    logger.info("User Management Service started successfully")

# 应用关闭事件
@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("User Management Service shutting down...")
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("User Management Service shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('user_management.host', '0.0.0.0')
    port = config_manager.get('user_management.port', 8005)
    
    logger.info(f"Starting User Management Service on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('user_management.workers', 1)  # 工作进程数
    )