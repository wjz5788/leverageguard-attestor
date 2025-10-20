import asyncio
import time
from typing import Any, Dict, Optional, Union, List, Callable, TypeVar, Generic
import aiohttp
from pydantic import BaseModel
from urllib.parse import urljoin
from .errors import BaseError, ServiceUnavailableError, ValidationError, AuthenticationError
from .logging_system import logger, log_with_context

T = TypeVar('T')

class ApiClientError(BaseError):
    """API客户端异常基类"""
    pass

class ApiResponse(Generic[T]):
    """API响应模型"""
    
    def __init__(
        self,
        status_code: int,
        data: Optional[T] = None,
        headers: Optional[Dict[str, str]] = None,
        error: Optional[str] = None
    ):
        self.status_code = status_code
        self.data = data
        self.headers = headers or {}
        self.error = error
    
    @property
    def is_success(self) -> bool:
        """检查响应是否成功"""
        return 200 <= self.status_code < 300
    
    def __str__(self) -> str:
        return f"ApiResponse(status_code={self.status_code}, data={self.data}, error={self.error})"

class APIClient:
    """异步API客户端，用于微服务间通信"""
    
    def __init__(
        self,
        base_url: str,
        timeout: int = 30,
        retries: int = 3,
        retry_delay: float = 1.0,
        retry_backoff: float = 2.0,
        default_headers: Optional[Dict[str, str]] = None,
        auth_provider: Optional[Callable[[], Dict[str, str]]] = None,
        service_name: str = "api_client"
    ):
        """
        初始化API客户端
        
        Args:
            base_url: 基础URL
            timeout: 请求超时时间（秒）
            retries: 请求失败时的重试次数
            retry_delay: 初始重试延迟（秒）
            retry_backoff: 重试延迟的乘数因子
            default_headers: 默认请求头
            auth_provider: 认证提供者函数，返回认证头
            service_name: 服务名称，用于日志记录
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.retries = retries
        self.retry_delay = retry_delay
        self.retry_backoff = retry_backoff
        self.default_headers = default_headers or {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        self.auth_provider = auth_provider
        self.service_name = service_name
        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = asyncio.Lock()
    
    async def __aenter__(self):
        await self._ensure_session()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def _ensure_session(self):
        """确保aiohttp会话已创建"""
        if self._session is None or self._session.closed:
            async with self._lock:
                if self._session is None or self._session.closed:
                    self._session = aiohttp.ClientSession(
                        timeout=aiohttp.ClientTimeout(total=self.timeout),
                        headers=self.default_headers
                    )
    
    async def close(self):
        """关闭aiohttp会话"""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
    
    async def _get_auth_headers(self) -> Dict[str, str]:
        """获取认证头"""
        if self.auth_provider:
            try:
                auth_headers = await self.auth_provider() if asyncio.iscoroutinefunction(self.auth_provider) else self.auth_provider()
                return auth_headers
            except Exception as e:
                logger.error(f"Failed to get auth headers: {str(e)}")
        return {}
    
    def _prepare_headers(self, headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """准备请求头"""
        final_headers = self.default_headers.copy()
        if headers:
            final_headers.update(headers)
        return final_headers
    
    def _prepare_url(self, endpoint: str) -> str:
        """准备请求URL"""
        if endpoint.startswith('http://') or endpoint.startswith('https://'):
            return endpoint
        return urljoin(self.base_url, endpoint.lstrip('/'))
    
    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> ApiResponse:
        """带重试机制的请求方法"""
        retry_count = 0
        current_delay = self.retry_delay
        
        while retry_count <= self.retries:
            try:
                return await self._make_request(method, url, **kwargs)
            except aiohttp.ClientError as e:
                retry_count += 1
                
                # 判断是否应该重试
                if retry_count > self.retries:
                    logger.error(f"Request failed after {self.retries} retries: {str(e)}")
                    raise ServiceUnavailableError(
                        message=f"Failed to connect to {self.service_name}",
                        error_code="SERVICE_CONNECTION_ERROR",
                        details={"service": self.service_name, "url": url, "error": str(e)}
                    )
                
                # 记录重试信息
                logger.warning(
                    f"Request failed (attempt {retry_count}/{self.retries}), retrying in {current_delay:.2f}s: {str(e)}"
                )
                
                # 等待重试
                await asyncio.sleep(current_delay)
                current_delay *= self.retry_backoff
            except Exception as e:
                # 非连接错误，不重试
                logger.error(f"Unexpected error during request: {str(e)}")
                raise
    
    async def _make_request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> ApiResponse:
        """执行HTTP请求"""
        await self._ensure_session()
        
        # 获取认证头
        auth_headers = await self._get_auth_headers()
        headers = kwargs.get('headers', {})
        headers.update(auth_headers)
        kwargs['headers'] = headers
        
        # 准备请求参数
        request_data = kwargs.copy()
        if 'json' in request_data:
            # 确保JSON数据是可序列化的
            request_json = request_data['json']
            if isinstance(request_json, BaseModel):
                request_data['json'] = request_json.dict()
        
        # 记录请求开始时间
        start_time = time.time()
        
        try:
            # 执行请求
            async with self._session.request(method, url, **request_data) as response:
                # 计算请求耗时
                duration = (time.time() - start_time) * 1000
                
                # 构建日志上下文
                context = {
                    'service': self.service_name,
                    'method': method,
                    'url': url,
                    'status_code': response.status,
                    'duration_ms': duration
                }
                
                # 尝试解析响应数据
                try:
                    data = await response.json()
                except (aiohttp.ContentTypeError, ValueError):
                    data = await response.text()
                    if not data.strip():
                        data = None
                
                # 记录请求日志
                if response.status >= 400:
                    log_with_context(
                        logger,
                        logger.error,
                        f"API Request failed",
                        context={**context, 'error': data}
                    )
                else:
                    log_with_context(
                        logger,
                        logger.info,
                        f"API Request completed",
                        context=context
                    )
                
                # 处理错误响应
                if response.status >= 400:
                    error_message = str(data) if data else f"HTTP {response.status}"
                    
                    if response.status == 401:
                        raise AuthenticationError(
                            message="Authentication failed",
                            error_code="API_AUTH_FAILED",
                            details={"service": self.service_name, "url": url, "error": error_message}
                        )
                    elif response.status == 400:
                        raise ValidationError(
                            message="Invalid request data",
                            error_code="API_VALIDATION_ERROR",
                            details={"service": self.service_name, "url": url, "error": error_message}
                        )
                    elif response.status == 404:
                        raise ApiClientError(
                            message="Resource not found",
                            error_code="API_RESOURCE_NOT_FOUND",
                            status_code=404,
                            details={"service": self.service_name, "url": url}
                        )
                    else:
                        raise ApiClientError(
                            message=f"API request failed with status {response.status}",
                            error_code=f"API_ERROR_{response.status}",
                            status_code=response.status,
                            details={"service": self.service_name, "url": url, "error": error_message}
                        )
                
                # 返回成功响应
                return ApiResponse(
                    status_code=response.status,
                    data=data,
                    headers=dict(response.headers)
                )
        except Exception as e:
            # 记录请求失败日志
            duration = (time.time() - start_time) * 1000
            log_with_context(
                logger,
                logger.error,
                f"API Request failed with exception",
                context={
                    'service': self.service_name,
                    'method': method,
                    'url': url,
                    'duration_ms': duration,
                    'error': str(e)
                }
            )
            raise
    
    async def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> ApiResponse:
        """发送GET请求"""
        url = self._prepare_url(endpoint)
        request_headers = self._prepare_headers(headers)
        return await self._request_with_retry('GET', url, params=params, headers=request_headers, **kwargs)
    
    async def post(
        self,
        endpoint: str,
        data: Optional[Union[Dict, BaseModel, str]] = None,
        json: Optional[Union[Dict, BaseModel]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> ApiResponse:
        """发送POST请求"""
        url = self._prepare_url(endpoint)
        request_headers = self._prepare_headers(headers)
        
        # 处理请求数据
        request_data = {}
        if data is not None:
            request_data['data'] = data
        elif json is not None:
            request_data['json'] = json
        
        return await self._request_with_retry('POST', url, headers=request_headers, **request_data, **kwargs)
    
    async def put(
        self,
        endpoint: str,
        data: Optional[Union[Dict, BaseModel, str]] = None,
        json: Optional[Union[Dict, BaseModel]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> ApiResponse:
        """发送PUT请求"""
        url = self._prepare_url(endpoint)
        request_headers = self._prepare_headers(headers)
        
        # 处理请求数据
        request_data = {}
        if data is not None:
            request_data['data'] = data
        elif json is not None:
            request_data['json'] = json
        
        return await self._request_with_retry('PUT', url, headers=request_headers, **request_data, **kwargs)
    
    async def delete(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> ApiResponse:
        """发送DELETE请求"""
        url = self._prepare_url(endpoint)
        request_headers = self._prepare_headers(headers)
        return await self._request_with_retry('DELETE', url, params=params, headers=request_headers, **kwargs)
    
    async def patch(
        self,
        endpoint: str,
        data: Optional[Union[Dict, BaseModel, str]] = None,
        json: Optional[Union[Dict, BaseModel]] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> ApiResponse:
        """发送PATCH请求"""
        url = self._prepare_url(endpoint)
        request_headers = self._prepare_headers(headers)
        
        # 处理请求数据
        request_data = {}
        if data is not None:
            request_data['data'] = data
        elif json is not None:
            request_data['json'] = json
        
        return await self._request_with_retry('PATCH', url, headers=request_headers, **request_data, **kwargs)

# 服务客户端工厂函数
def create_service_client(
    service_name: str,
    base_url: Optional[str] = None,
    config_manager: Optional[Any] = None,
    **kwargs
) -> APIClient:
    """
    创建服务客户端实例
    
    Args:
        service_name: 服务名称
        base_url: 基础URL，如果为None则从配置中获取
        config_manager: 配置管理器实例
        **kwargs: 传递给APIClient的其他参数
    
    Returns:
        APIClient实例
    """
    # 从配置中获取服务URL
    if base_url is None and config_manager:
        # 尝试从配置中获取服务URL
        base_url = config_manager.get(f'services.{service_name}.url')
        
        # 如果配置中没有，则使用默认URL格式
        if not base_url:
            base_url = f'http://{service_name}:8000'
    elif base_url is None:
        # 使用默认URL格式
        base_url = f'http://{service_name}:8000'
    
    # 创建并返回客户端实例
    return APIClient(base_url=base_url, service_name=service_name, **kwargs)

# 导出所有类和函数
__all__ = [
    'ApiClientError',
    'ApiResponse',
    'APIClient',
    'create_service_client'
]