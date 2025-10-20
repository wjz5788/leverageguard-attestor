import time
import uuid
from typing import Any, Dict, Optional, Union, Tuple
import jwt
import bcrypt
from datetime import datetime, timedelta
from jose import JWTError, jwt as jose_jwt
from pydantic import BaseModel
from .errors import AuthenticationError, AuthorizationError
from .logging_system import logger
from .validators import validate_email

# JWT相关常量
ALGORITHM = "HS256"
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS = 7

class TokenData(BaseModel):
    """JWT令牌数据模型"""
    user_id: str
    email: Optional[str] = None
    role: Optional[str] = None
    scopes: Optional[List[str]] = None
    expires_at: Optional[int] = None

class TokenPair(BaseModel):
    """访问令牌和刷新令牌对"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int

class AuthConfig(BaseModel):
    """身份验证配置"""
    secret_key: str
    access_token_expire_minutes: int = DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES
    refresh_token_expire_days: int = DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS
    algorithm: str = ALGORITHM
    issuer: Optional[str] = None
    audience: Optional[List[str]] = None

class PasswordManager:
    """密码管理类"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """将密码哈希处理"""
        if not isinstance(password, str):
            raise ValueError("Password must be a string")
        if len(password) < 6:
            raise ValueError("Password must be at least 6 characters long")
        
        # 生成随机盐并哈希密码
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed_password.decode('utf-8')
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """验证密码是否匹配"""
        try:
            return bcrypt.checkpw(
                plain_password.encode('utf-8'),
                hashed_password.encode('utf-8')
            )
        except Exception as e:
            logger.error(f"Failed to verify password: {str(e)}")
            return False
    
    @staticmethod
    def is_strong_password(password: str) -> bool:
        """检查密码强度"""
        import re
        
        # 至少8个字符
        if len(password) < 8:
            return False
        
        # 至少包含一个大写字母
        if not re.search(r"[A-Z]", password):
            return False
        
        # 至少包含一个小写字母
        if not re.search(r"[a-z]", password):
            return False
        
        # 至少包含一个数字
        if not re.search(r"[0-9]", password):
            return False
        
        # 至少包含一个特殊字符
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return False
        
        return True
    
    @staticmethod
    def generate_secure_password(length: int = 12) -> str:
        """生成安全的随机密码"""
        import secrets
        import string
        
        if length < 8:
            length = 8
        
        # 定义字符集
        characters = string.ascii_letters + string.digits + string.punctuation
        
        # 确保密码包含所需的字符类型
        password = [
            secrets.choice(string.ascii_uppercase),
            secrets.choice(string.ascii_lowercase),
            secrets.choice(string.digits),
            secrets.choice(string.punctuation)
        ]
        
        # 填充剩余的字符
        password.extend(secrets.choice(characters) for _ in range(length - 4))
        
        # 打乱密码字符顺序
        secrets.SystemRandom().shuffle(password)
        
        return ''.join(password)

class JWTManager:
    """JWT令牌管理类"""
    
    def __init__(self, config: AuthConfig):
        """初始化JWT管理器"""
        self.config = config
    
    def create_access_token(
        self,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """创建访问令牌"""
        to_encode = data.copy()
        
        # 设置过期时间
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.config.access_token_expire_minutes)
        
        # 添加标准声明
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid.uuid4())
        })
        
        # 添加可选的标准声明
        if self.config.issuer:
            to_encode["iss"] = self.config.issuer
        if self.config.audience:
            to_encode["aud"] = self.config.audience
        
        # 编码令牌
        encoded_jwt = jose_jwt.encode(
            to_encode,
            self.config.secret_key,
            algorithm=self.config.algorithm
        )
        
        return encoded_jwt
    
    def create_refresh_token(
        self,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """创建刷新令牌"""
        to_encode = data.copy()
        
        # 设置过期时间
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=self.config.refresh_token_expire_days)
        
        # 添加标准声明
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid.uuid4()),
            "type": "refresh"
        })
        
        # 添加可选的标准声明
        if self.config.issuer:
            to_encode["iss"] = self.config.issuer
        if self.config.audience:
            to_encode["aud"] = self.config.audience
        
        # 编码令牌
        encoded_jwt = jose_jwt.encode(
            to_encode,
            self.config.secret_key,
            algorithm=self.config.algorithm
        )
        
        return encoded_jwt
    
    def create_token_pair(
        self,
        user_data: Dict[str, Any]
    ) -> TokenPair:
        """创建访问令牌和刷新令牌对"""
        # 为访问令牌准备数据
        access_token_data = user_data.copy()
        
        # 为刷新令牌准备数据（通常包含较少信息）
        refresh_token_data = {
            "sub": user_data.get("sub"),
            "email": user_data.get("email")
        }
        
        # 创建令牌
        access_token = self.create_access_token(access_token_data)
        refresh_token = self.create_refresh_token(refresh_token_data)
        
        # 计算过期时间（秒）
        access_token_expire_seconds = self.config.access_token_expire_minutes * 60
        refresh_token_expire_seconds = self.config.refresh_token_expire_days * 24 * 60 * 60
        
        # 返回令牌对
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=access_token_expire_seconds,
            refresh_expires_in=refresh_token_expire_seconds
        )
    
    def decode_token(
        self,
        token: str,
        verify: bool = True
    ) -> Dict[str, Any]:
        """解码JWT令牌"""
        try:
            options = {}
            if not verify:
                options = {
                    "verify_signature": False,
                    "verify_exp": False,
                    "verify_nbf": False,
                    "verify_iat": False,
                    "verify_aud": False,
                    "verify_iss": False
                }
            
            payload = jose_jwt.decode(
                token,
                self.config.secret_key,
                algorithms=[self.config.algorithm],
                audience=self.config.audience if verify else None,
                issuer=self.config.issuer if verify else None,
                options=options
            )
            
            return payload
        except JWTError as e:
            logger.error(f"Failed to decode JWT token: {str(e)}")
            raise AuthenticationError(
                message="Invalid or expired token",
                error_code="INVALID_TOKEN",
                details={"error": str(e)}
            )
    
    def get_token_data(self, token: str) -> TokenData:
        """从令牌中提取用户数据"""
        payload = self.decode_token(token)
        
        # 提取必要的字段
        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError(
                message="Token missing user identifier",
                error_code="INVALID_TOKEN"
            )
        
        # 创建令牌数据对象
        return TokenData(
            user_id=user_id,
            email=payload.get("email"),
            role=payload.get("role"),
            scopes=payload.get("scopes"),
            expires_at=payload.get("exp")
        )
    
    def refresh_access_token(self, refresh_token: str) -> TokenPair:
        """使用刷新令牌获取新的访问令牌"""
        try:
            # 解码刷新令牌
            payload = self.decode_token(refresh_token)
            
            # 检查是否是刷新令牌
            token_type = payload.get("type")
            if token_type != "refresh":
                raise AuthenticationError(
                    message="Invalid refresh token",
                    error_code="INVALID_REFRESH_TOKEN"
                )
            
            # 提取用户信息
            user_data = {
                "sub": payload.get("sub"),
                "email": payload.get("email")
            }
            
            # 创建新的令牌对
            return self.create_token_pair(user_data)
        except Exception as e:
            logger.error(f"Failed to refresh access token: {str(e)}")
            raise AuthenticationError(
                message="Failed to refresh access token",
                error_code="REFRESH_TOKEN_FAILED"
            )
    
    def is_token_expired(self, token: str) -> bool:
        """检查令牌是否已过期"""
        try:
            payload = self.decode_token(token, verify=False)
            exp = payload.get("exp")
            if exp:
                return int(time.time()) > exp
            return False
        except Exception:
            return True

class AuthManager:
    """身份验证管理器"""
    
    def __init__(self, config: AuthConfig):
        """初始化身份验证管理器"""
        self.config = config
        self.password_manager = PasswordManager()
        self.jwt_manager = JWTManager(config)
    
    def authenticate_user(
        self,
        email: str,
        password: str,
        user_fetcher: Callable[[str], Optional[Dict[str, Any]]]
    ) -> Optional[Dict[str, Any]]:
        """验证用户凭据"""
        # 验证电子邮件格式
        try:
            validate_email(email)
        except Exception:
            logger.warning(f"Invalid email format during authentication: {email}")
            return None
        
        # 获取用户信息
        user = user_fetcher(email)
        if not user:
            logger.warning(f"User not found during authentication: {email}")
            return None
        
        # 验证密码
        if not self.password_manager.verify_password(password, user.get("hashed_password", "")):
            logger.warning(f"Invalid password for user: {email}")
            return None
        
        # 验证通过，返回用户信息（不包含密码）
        user_info = user.copy()
        if "hashed_password" in user_info:
            del user_info["hashed_password"]
        
        return user_info
    
    def generate_tokens_for_user(self, user_info: Dict[str, Any]) -> TokenPair:
        """为用户生成令牌对"""
        # 准备JWT数据
        jwt_data = {
            "sub": user_info.get("user_id") or user_info.get("id"),
            "email": user_info.get("email"),
            "role": user_info.get("role"),
            "scopes": user_info.get("scopes")
        }
        
        # 确保必要字段存在
        if not jwt_data["sub"]:
            raise ValueError("User info must contain 'user_id' or 'id'")
        
        # 生成令牌对
        return self.jwt_manager.create_token_pair(jwt_data)
    
    def authorize_user(
        self,
        token_data: TokenData,
        required_role: Optional[str] = None,
        required_permissions: Optional[List[str]] = None
    ) -> bool:
        """检查用户是否有权限执行操作"""
        # 检查角色
        if required_role and token_data.role != required_role:
            logger.warning(f"User {token_data.user_id} lacks required role: {required_role}")
            return False
        
        # 检查权限
        if required_permissions and token_data.scopes:
            for permission in required_permissions:
                if permission not in token_data.scopes:
                    logger.warning(f"User {token_data.user_id} lacks required permission: {permission}")
                    return False
        
        return True
    
    def get_current_user(self, token: str) -> TokenData:
        """从令牌获取当前用户信息"""
        if not token:
            raise AuthenticationError(
                message="Authentication token missing",
                error_code="TOKEN_MISSING",
                status_code=401
            )
        
        # 移除可能的Bearer前缀
        if token.startswith("Bearer "):
            token = token[7:]
        
        # 解码令牌
        try:
            return self.jwt_manager.get_token_data(token)
        except AuthenticationError:
            raise
        except Exception as e:
            logger.error(f"Error getting current user: {str(e)}")
            raise AuthenticationError(
                message="Invalid authentication credentials",
                error_code="INVALID_CREDENTIALS",
                status_code=401
            )
    
    def require_authentication(self, token: str) -> TokenData:
        """要求用户必须已认证，否则抛出异常"""
        return self.get_current_user(token)
    
    def require_authorization(
        self,
        token: str,
        required_role: Optional[str] = None,
        required_permissions: Optional[List[str]] = None
    ) -> TokenData:
        """要求用户必须已认证且具有所需权限，否则抛出异常"""
        # 获取当前用户
        user = self.get_current_user(token)
        
        # 检查授权
        if not self.authorize_user(user, required_role, required_permissions):
            permission_str = ""
            if required_role:
                permission_str += f"role '{required_role}'"
            if required_role and required_permissions:
                permission_str += " and "
            if required_permissions:
                permission_str += f"permissions {required_permissions}"
            
            raise AuthorizationError(
                message=f"Insufficient permissions: requires {permission_str}",
                error_code="INSUFFICIENT_PERMISSIONS",
                status_code=403
            )
        
        return user

# 工具函数
def create_auth_manager(
    secret_key: str,
    access_token_expire_minutes: int = DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
    refresh_token_expire_days: int = DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS,
    algorithm: str = ALGORITHM,
    issuer: Optional[str] = None,
    audience: Optional[List[str]] = None
) -> AuthManager:
    """创建身份验证管理器实例"""
    config = AuthConfig(
        secret_key=secret_key,
        access_token_expire_minutes=access_token_expire_minutes,
        refresh_token_expire_days=refresh_token_expire_days,
        algorithm=algorithm,
        issuer=issuer,
        audience=audience
    )
    return AuthManager(config)

# 导出所有类和函数
__all__ = [
    'TokenData',
    'TokenPair',
    'AuthConfig',
    'PasswordManager',
    'JWTManager',
    'AuthManager',
    'create_auth_manager'
]