from typing import Any, Dict, Optional, Union, List, Generic, TypeVar
from pydantic import BaseModel, Field, validator
from fastapi import status, Response
from datetime import datetime
from enum import Enum

T = TypeVar('T')

class ResponseStatus(str, Enum):
    """响应状态枚举"""
    SUCCESS = "success"
    ERROR = "error"
    PENDING = "pending"
    PROCESSING = "processing"

class BaseResponse(BaseModel, Generic[T]):
    """基础响应模型"""
    status: ResponseStatus = Field(..., description="响应状态")
    code: int = Field(..., description="HTTP状态码")
    message: str = Field(..., description="响应消息")
    data: Optional[T] = Field(None, description="响应数据")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
    request_id: Optional[str] = Field(None, description="请求ID")
    
    @validator('timestamp', pre=True, always=True)
    def ensure_datetime(cls, v):
        """确保时间戳为datetime类型"""
        if isinstance(v, datetime):
            return v
        return datetime.now()

class SuccessResponse(BaseResponse[T]):
    """成功响应模型"""
    def __init__(self, 
                 data: Optional[T] = None, 
                 message: str = "操作成功", 
                 code: int = status.HTTP_200_OK,
                 request_id: Optional[str] = None):
        super().__init__(
            status=ResponseStatus.SUCCESS,
            code=code,
            message=message,
            data=data,
            request_id=request_id
        )

class ErrorResponse(BaseResponse[Dict[str, Any]]):
    """错误响应模型"""
    details: Optional[Dict[str, Any]] = Field(None, description="错误详情")
    error_code: Optional[str] = Field(None, description="错误码")
    
    def __init__(self, 
                 message: str = "操作失败", 
                 code: int = status.HTTP_400_BAD_REQUEST,
                 data: Optional[Dict[str, Any]] = None,
                 details: Optional[Dict[str, Any]] = None,
                 error_code: Optional[str] = None,
                 request_id: Optional[str] = None):
        super().__init__(
            status=ResponseStatus.ERROR,
            code=code,
            message=message,
            data=data,
            request_id=request_id
        )
        self.details = details
        self.error_code = error_code

class PaginationMetadata(BaseModel):
    """分页元数据模型"""
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页记录数")
    total_pages: int = Field(..., description="总页数")
    has_next: bool = Field(..., description="是否有下一页")
    has_prev: bool = Field(..., description="是否有上一页")

class PaginatedResponse(BaseResponse[List[T]]):
    """分页响应模型"""
    meta: PaginationMetadata = Field(..., description="分页元数据")
    
    def __init__(self, 
                 data: List[T],
                 total: int,
                 page: int,
                 page_size: int,
                 message: str = "查询成功",
                 code: int = status.HTTP_200_OK,
                 request_id: Optional[str] = None):
        # 计算总页数
        total_pages = (total + page_size - 1) // page_size
        
        super().__init__(
            status=ResponseStatus.SUCCESS,
            code=code,
            message=message,
            data=data,
            request_id=request_id
        )
        self.meta = PaginationMetadata(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )

class ResponseFormatter:
    """响应格式化工具类"""
    
    @staticmethod
    def success(
        data: Optional[Any] = None,
        message: str = "操作成功",
        code: int = status.HTTP_200_OK,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """格式化成功响应"""
        return SuccessResponse(
            data=data,
            message=message,
            code=code,
            request_id=request_id
        ).dict()
    
    @staticmethod
    def error(
        message: str = "操作失败",
        code: int = status.HTTP_400_BAD_REQUEST,
        data: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """格式化错误响应"""
        return ErrorResponse(
            message=message,
            code=code,
            data=data,
            details=details,
            error_code=error_code,
            request_id=request_id
        ).dict()
    
    @staticmethod
    def paginated(
        data: List[Any],
        total: int,
        page: int,
        page_size: int,
        message: str = "查询成功",
        code: int = status.HTTP_200_OK,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """格式化分页响应"""
        return PaginatedResponse(
            data=data,
            total=total,
            page=page,
            page_size=page_size,
            message=message,
            code=code,
            request_id=request_id
        ).dict()
    
    @staticmethod
    def create_response(
        response: Response,
        data: Optional[Any] = None,
        message: str = "操作成功",
        code: int = status.HTTP_200_OK,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """创建FastAPI响应"""
        # 设置HTTP状态码
        response.status_code = code
        
        # 设置响应头
        if headers:
            for key, value in headers.items():
                response.headers[key] = value
        
        # 格式化响应数据
        return ResponseFormatter.success(
            data=data,
            message=message,
            code=code
        )
    
    @staticmethod
    def create_error_response(
        response: Response,
        message: str = "操作失败",
        code: int = status.HTTP_400_BAD_REQUEST,
        data: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """创建错误响应"""
        # 设置HTTP状态码
        response.status_code = code
        
        # 设置响应头
        if headers:
            for key, value in headers.items():
                response.headers[key] = value
        
        # 格式化错误响应
        return ResponseFormatter.error(
            message=message,
            code=code,
            data=data,
            details=details,
            error_code=error_code
        )
    
    @staticmethod
    def from_pagination_result(
        result: Dict[str, Any],
        message: str = "查询成功",
        code: int = status.HTTP_200_OK,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """从分页结果创建响应"""
        return ResponseFormatter.paginated(
            data=result['items'],
            total=result['total'],
            page=result['page'],
            page_size=result['page_size'],
            message=message,
            code=code,
            request_id=request_id
        )

# 常用响应快捷函数
def success_response(
    data: Optional[Any] = None,
    message: str = "操作成功",
    code: int = status.HTTP_200_OK,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """成功响应快捷函数"""
    return ResponseFormatter.success(
        data=data,
        message=message,
        code=code,
        request_id=request_id
    )

def error_response(
    message: str = "操作失败",
    code: int = status.HTTP_400_BAD_REQUEST,
    data: Optional[Dict[str, Any]] = None,
    details: Optional[Dict[str, Any]] = None,
    error_code: Optional[str] = None,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """错误响应快捷函数"""
    return ResponseFormatter.error(
        message=message,
        code=code,
        data=data,
        details=details,
        error_code=error_code,
        request_id=request_id
    )

def paginated_response(
    data: List[Any],
    total: int,
    page: int,
    page_size: int,
    message: str = "查询成功",
    code: int = status.HTTP_200_OK,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """分页响应快捷函数"""
    return ResponseFormatter.paginated(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        message=message,
        code=code,
        request_id=request_id
    )

# HTTP状态码与消息映射
HTTP_STATUS_MESSAGES = {
    status.HTTP_200_OK: "操作成功",
    status.HTTP_201_CREATED: "创建成功",
    status.HTTP_202_ACCEPTED: "请求已接受",
    status.HTTP_204_NO_CONTENT: "无内容",
    status.HTTP_400_BAD_REQUEST: "请求参数错误",
    status.HTTP_401_UNAUTHORIZED: "未授权",
    status.HTTP_403_FORBIDDEN: "拒绝访问",
    status.HTTP_404_NOT_FOUND: "资源不存在",
    status.HTTP_405_METHOD_NOT_ALLOWED: "方法不允许",
    status.HTTP_406_NOT_ACCEPTABLE: "不接受的请求格式",
    status.HTTP_408_REQUEST_TIMEOUT: "请求超时",
    status.HTTP_409_CONFLICT: "请求冲突",
    status.HTTP_422_UNPROCESSABLE_ENTITY: "无法处理的实体",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "服务器内部错误",
    status.HTTP_501_NOT_IMPLEMENTED: "未实现",
    status.HTTP_502_BAD_GATEWAY: "网关错误",
    status.HTTP_503_SERVICE_UNAVAILABLE: "服务不可用",
    status.HTTP_504_GATEWAY_TIMEOUT: "网关超时"
}

def get_status_message(status_code: int) -> str:
    """根据HTTP状态码获取默认消息"""
    return HTTP_STATUS_MESSAGES.get(status_code, "未知状态")

# 导出所有类和函数
__all__ = [
    'ResponseStatus',
    'BaseResponse',
    'SuccessResponse',
    'ErrorResponse',
    'PaginationMetadata',
    'PaginatedResponse',
    'ResponseFormatter',
    'success_response',
    'error_response',
    'paginated_response',
    'get_status_message'
]