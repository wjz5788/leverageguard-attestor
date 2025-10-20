import traceback
from typing import Any, Dict, Optional, Union
from fastapi import HTTPException, status
from pydantic import BaseModel
from .logging_system import log_error

class BaseError(Exception):
    """基础异常类，所有自定义异常都应继承此类"""
    
    def __init__(self,
                 message: str = "An unexpected error occurred",
                 error_code: str = "UNKNOWN_ERROR",
                 status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
                 details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        self.traceback = traceback.format_exc()
        super().__init__(self.message)

class ValidationError(BaseError):
    """数据验证错误"""
    
    def __init__(self,
                 message: str = "Validation failed",
                 error_code: str = "VALIDATION_ERROR",
                 status_code: int = status.HTTP_400_BAD_REQUEST,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class BusinessLogicError(BaseError):
    """业务逻辑错误"""
    
    def __init__(self,
                 message: str = "Business logic error",
                 error_code: str = "BUSINESS_LOGIC_ERROR",
                 status_code: int = status.HTTP_409_CONFLICT,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class ResourceNotFoundError(BaseError):
    """资源未找到错误"""
    
    def __init__(self,
                 message: str = "Resource not found",
                 error_code: str = "RESOURCE_NOT_FOUND",
                 status_code: int = status.HTTP_404_NOT_FOUND,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class AuthenticationError(BaseError):
    """认证错误"""
    
    def __init__(self,
                 message: str = "Authentication failed",
                 error_code: str = "AUTHENTICATION_ERROR",
                 status_code: int = status.HTTP_401_UNAUTHORIZED,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class AuthorizationError(BaseError):
    """授权错误"""
    
    def __init__(self,
                 message: str = "Unauthorized access",
                 error_code: str = "AUTHORIZATION_ERROR",
                 status_code: int = status.HTTP_403_FORBIDDEN,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class ServiceUnavailableError(BaseError):
    """服务不可用错误"""
    
    def __init__(self,
                 message: str = "Service unavailable",
                 error_code: str = "SERVICE_UNAVAILABLE",
                 status_code: int = status.HTTP_503_SERVICE_UNAVAILABLE,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class RateLimitExceededError(BaseError):
    """请求频率限制错误"""
    
    def __init__(self,
                 message: str = "Rate limit exceeded",
                 error_code: str = "RATE_LIMIT_EXCEEDED",
                 status_code: int = status.HTTP_429_TOO_MANY_REQUESTS,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message, error_code, status_code, details)

class ErrorResponse(BaseModel):
    """统一的错误响应模型"""
    
    error: str
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    
    class Config:
        schema_extra = {
            "example": {
                "error": "Bad Request",
                "error_code": "VALIDATION_ERROR",
                "message": "Invalid input data",
                "details": {
                    "field": "email",
                    "reason": "Invalid email format"
                }
            }
        }

def convert_exception_to_http_error(exception: Exception) -> HTTPException:
    """将自定义异常转换为FastAPI的HTTPException"""
    
    if isinstance(exception, BaseError):
        # 记录详细错误信息
        log_error(
            f"{exception.error_code}: {exception.message}",
            error_code=exception.error_code,
            details=exception.details,
            traceback=exception.traceback
        )
        
        # 返回对应的HTTP异常
        return HTTPException(
            status_code=exception.status_code,
            detail={
                "error": exception.__class__.__name__,
                "error_code": exception.error_code,
                "message": exception.message,
                "details": exception.details
            }
        )
    elif isinstance(exception, HTTPException):
        # 如果已经是HTTPException，直接返回
        return exception
    else:
        # 未知异常，记录并返回500错误
        log_error(
            f"Unexpected error: {str(exception)}",
            error_code="UNKNOWN_ERROR",
            traceback=traceback.format_exc()
        )
        
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "InternalServerError",
                "error_code": "UNKNOWN_ERROR",
                "message": "An unexpected error occurred",
                "details": {"original_error": str(exception)}
            }
        )

def handle_error(func):
    """错误处理装饰器，用于包装API端点函数"""
    
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            raise convert_exception_to_http_error(e)
    
    # 保留原函数的名称和文档
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper

# 导出所有错误类和函数
__all__ = [
    'BaseError',
    'ValidationError',
    'BusinessLogicError',
    'ResourceNotFoundError',
    'AuthenticationError',
    'AuthorizationError',
    'ServiceUnavailableError',
    'RateLimitExceededError',
    'ErrorResponse',
    'convert_exception_to_http_error',
    'handle_error'
]