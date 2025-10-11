import time
import asyncio
import json
from typing import Any, Dict, Optional, Callable, Union, List, Tuple, TypeVar, Generic
from functools import wraps
import redis
import aioredis
from .errors import BaseError
from .config_manager import get_config
from .logging_system import logger

class CacheError(BaseError):
    """缓存相关异常基类"""
    
    def __init__(self,
                 message: str = "Cache error",
                 error_code: str = "CACHE_ERROR",
                 **kwargs):
        super().__init__(message, error_code, **kwargs)

class CacheConnectionError(CacheError):
    """缓存连接异常"""
    
    def __init__(self,
                 message: str = "Failed to connect to cache",
                 error_code: str = "CACHE_CONNECTION_ERROR",
                 **kwargs):
        super().__init__(message, error_code, **kwargs)

class CacheOperationError(CacheError):
    """缓存操作异常"""
    
    def __init__(self,
                 message: str = "Cache operation failed",
                 error_code: str = "CACHE_OPERATION_ERROR",
                 **kwargs):
        super().__init__(message, error_code, **kwargs)

class CacheConfig:
    """缓存配置类"""
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        socket_timeout: int = 30,
        retry_attempts: int = 3,
        retry_delay: float = 0.5,
        pool_size: int = 10,
        decode_responses: bool = True
    ):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.socket_timeout = socket_timeout
        self.retry_attempts = retry_attempts
        self.retry_delay = retry_delay
        self.pool_size = pool_size
        self.decode_responses = decode_responses

class CacheItem:
    """缓存项类"""
    
    def __init__(self,
                 value: Any,
                 ttl: Optional[int] = None,
                 created_at: Optional[float] = None):
        self.value = value
        self.ttl = ttl
        self.created_at = created_at or time.time()
        
    def is_expired(self) -> bool:
        """检查缓存项是否已过期"""
        if self.ttl is None:
            return False
        return time.time() > (self.created_at + self.ttl)

T = TypeVar('T')

class InMemoryCache(Generic[T]):
    """内存缓存实现"""
    
    def __init__(self):
        self._cache: Dict[str, CacheItem] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[T]:
        """获取缓存项"""
        async with self._lock:
            if key not in self._cache:
                return None
            
            item = self._cache[key]
            if item.is_expired():
                # 惰性删除过期项
                del self._cache[key]
                return None
            
            return item.value
    
    async def set(
        self,
        key: str,
        value: T,
        ttl: Optional[int] = None
    ) -> None:
        """设置缓存项"""
        async with self._lock:
            self._cache[key] = CacheItem(value, ttl)
    
    async def delete(self, key: str) -> bool:
        """删除缓存项"""
        async with self._lock:
            if key not in self._cache:
                return False
            
            del self._cache[key]
            return True
    
    async def exists(self, key: str) -> bool:
        """检查缓存项是否存在"""
        return await self.get(key) is not None
    
    async def clear(self) -> None:
        """清空缓存"""
        async with self._lock:
            self._cache.clear()
    
    async def keys(self) -> List[str]:
        """获取所有缓存键"""
        async with self._lock:
            # 先清理过期项
            for key in list(self._cache.keys()):
                if self._cache[key].is_expired():
                    del self._cache[key]
            
            return list(self._cache.keys())
    
    async def size(self) -> int:
        """获取缓存大小"""
        return len(await self.keys())
    
    async def get_with_ttl(self, key: str) -> Tuple[Optional[T], Optional[int]]:
        """获取缓存项及其剩余生存时间"""
        async with self._lock:
            if key not in self._cache:
                return None, None
            
            item = self._cache[key]
            if item.is_expired():
                del self._cache[key]
                return None, None
            
            if item.ttl is None:
                ttl = None
            else:
                ttl = int(item.created_at + item.ttl - time.time())
                if ttl < 0:
                    ttl = 0
            
            return item.value, ttl

class RedisCache:
    """Redis缓存实现"""
    
    def __init__(self, config: Optional[CacheConfig] = None):
        self.config = config or CacheConfig()
        self._client = None
        self._async_client = None
        self._lock = asyncio.Lock()
    
    def _get_sync_client(self) -> redis.Redis:
        """获取同步Redis客户端"""
        if self._client is None:
            try:
                self._client = redis.Redis(
                    host=self.config.host,
                    port=self.config.port,
                    db=self.config.db,
                    password=self.config.password,
                    socket_timeout=self.config.socket_timeout,
                    decode_responses=self.config.decode_responses,
                    health_check_interval=30
                )
                # 测试连接
                self._client.ping()
                logger.info(f"Successfully connected to Redis at {self.config.host}:{self.config.port}")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {str(e)}")
                raise CacheConnectionError(details={"error": str(e)})
        
        return self._client
    
    async def _get_async_client(self) -> aioredis.Redis:
        """获取异步Redis客户端"""
        if self._async_client is None:
            async with self._lock:
                if self._async_client is None:
                    try:
                        # 创建连接URL
                        url = f"redis://{self.config.host}:{self.config.port}/{self.config.db}"
                        if self.config.password:
                            url = f"redis://:{self.config.password}@{self.config.host}:{self.config.port}/{self.config.db}"
                        
                        # 连接到Redis
                        self._async_client = await aioredis.from_url(
                            url,
                            socket_timeout=self.config.socket_timeout,
                            decode_responses=self.config.decode_responses
                        )
                        # 测试连接
                        await self._async_client.ping()
                        logger.info(f"Successfully connected to Redis (async) at {self.config.host}:{self.config.port}")
                    except Exception as e:
                        logger.error(f"Failed to connect to Redis (async): {str(e)}")
                        raise CacheConnectionError(details={"error": str(e)})
        
        return self._async_client
    
    def get_sync(self, key: str) -> Optional[Any]:
        """同步获取缓存项"""
        try:
            client = self._get_sync_client()
            value = client.get(key)
            return value
        except Exception as e:
            logger.error(f"Failed to get cache item: {str(e)}")
            raise CacheOperationError(details={"operation": "get", "error": str(e)})
    
    def set_sync(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> None:
        """同步设置缓存项"""
        try:
            client = self._get_sync_client()
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            client.set(key, value, ex=ttl)
        except Exception as e:
            logger.error(f"Failed to set cache item: {str(e)}")
            raise CacheOperationError(details={"operation": "set", "error": str(e)})
    
    def delete_sync(self, key: str) -> bool:
        """同步删除缓存项"""
        try:
            client = self._get_sync_client()
            return client.delete(key) > 0
        except Exception as e:
            logger.error(f"Failed to delete cache item: {str(e)}")
            raise CacheOperationError(details={"operation": "delete", "error": str(e)})
    
    async def get(self, key: str) -> Optional[Any]:
        """异步获取缓存项"""
        try:
            client = await self._get_async_client()
            value = await client.get(key)
            return value
        except Exception as e:
            logger.error(f"Failed to get cache item (async): {str(e)}")
            raise CacheOperationError(details={"operation": "get", "error": str(e)})
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> None:
        """异步设置缓存项"""
        try:
            client = await self._get_async_client()
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            await client.set(key, value, ex=ttl)
        except Exception as e:
            logger.error(f"Failed to set cache item (async): {str(e)}")
            raise CacheOperationError(details={"operation": "set", "error": str(e)})
    
    async def delete(self, key: str) -> bool:
        """异步删除缓存项"""
        try:
            client = await self._get_async_client()
            return await client.delete(key) > 0
        except Exception as e:
            logger.error(f"Failed to delete cache item (async): {str(e)}")
            raise CacheOperationError(details={"operation": "delete", "error": str(e)})
    
    async def exists(self, key: str) -> bool:
        """异步检查缓存项是否存在"""
        try:
            client = await self._get_async_client()
            return await client.exists(key) > 0
        except Exception as e:
            logger.error(f"Failed to check cache item existence (async): {str(e)}")
            raise CacheOperationError(details={"operation": "exists", "error": str(e)})
    
    async def clear(self) -> None:
        """异步清空缓存"""
        try:
            client = await self._get_async_client()
            await client.flushdb()
        except Exception as e:
            logger.error(f"Failed to clear cache (async): {str(e)}")
            raise CacheOperationError(details={"operation": "clear", "error": str(e)})
    
    async def keys(self, pattern: str = "*") -> List[str]:
        """异步获取所有匹配的缓存键"""
        try:
            client = await self._get_async_client()
            return await client.keys(pattern)
        except Exception as e:
            logger.error(f"Failed to get cache keys (async): {str(e)}")
            raise CacheOperationError(details={"operation": "keys", "error": str(e)})
    
    async def size(self) -> int:
        """异步获取缓存大小"""
        try:
            client = await self._get_async_client()
            return await client.dbsize()
        except Exception as e:
            logger.error(f"Failed to get cache size (async): {str(e)}")
            raise CacheOperationError(details={"operation": "size", "error": str(e)})
    
    async def get_with_ttl(self, key: str) -> Tuple[Optional[Any], Optional[int]]:
        """异步获取缓存项及其剩余生存时间"""
        try:
            client = await self._get_async_client()
            value = await client.get(key)
            if value is None:
                return None, None
            
            ttl = await client.ttl(key)
            # ttl 为 -1 表示永不过期，-2 表示键不存在
            if ttl == -1:
                ttl = None
            elif ttl == -2:
                return None, None
            
            return value, ttl
        except Exception as e:
            logger.error(f"Failed to get cache item with ttl (async): {str(e)}")
            raise CacheOperationError(details={"operation": "get_with_ttl", "error": str(e)})
    
    async def hget(self, key: str, field: str) -> Optional[Any]:
        """异步获取哈希表中的字段值"""
        try:
            client = await self._get_async_client()
            value = await client.hget(key, field)
            return value
        except Exception as e:
            logger.error(f"Failed to get hash field (async): {str(e)}")
            raise CacheOperationError(details={"operation": "hget", "error": str(e)})
    
    async def hset(
        self,
        key: str,
        field: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> None:
        """异步设置哈希表中的字段值"""
        try:
            client = await self._get_async_client()
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            await client.hset(key, field, value)
            
            # 设置TTL
            if ttl is not None:
                await client.expire(key, ttl)
        except Exception as e:
            logger.error(f"Failed to set hash field (async): {str(e)}")
            raise CacheOperationError(details={"operation": "hset", "error": str(e)})
    
    async def hdel(self, key: str, field: str) -> bool:
        """异步删除哈希表中的字段"""
        try:
            client = await self._get_async_client()
            return await client.hdel(key, field) > 0
        except Exception as e:
            logger.error(f"Failed to delete hash field (async): {str(e)}")
            raise CacheOperationError(details={"operation": "hdel", "error": str(e)})

class CacheManager:
    """缓存管理器，支持多级缓存"""
    
    def __init__(self):
        self._caches: Dict[str, Union[InMemoryCache, RedisCache]] = {}
        self._default_cache = None
    
    def register_cache(
        self,
        name: str,
        cache: Union[InMemoryCache, RedisCache],
        is_default: bool = False
    ) -> None:
        """注册缓存实例"""
        self._caches[name] = cache
        if is_default:
            self._default_cache = name
    
    def get_cache(self, name: Optional[str] = None) -> Union[InMemoryCache, RedisCache]:
        """获取缓存实例"""
        if name is None:
            if self._default_cache is None:
                raise CacheError(message="No default cache registered")
            name = self._default_cache
        
        if name not in self._caches:
            raise CacheError(message=f"Cache '{name}' not registered")
        
        return self._caches[name]
    
    def has_cache(self, name: str) -> bool:
        """检查缓存是否已注册"""
        return name in self._caches
    
    def unregister_cache(self, name: str) -> None:
        """取消注册缓存"""
        if name in self._caches:
            del self._caches[name]
            if self._default_cache == name:
                self._default_cache = None

# 缓存装饰器

def cache_result(
    ttl: int = 3600,
    key: Optional[str] = None,
    cache_name: Optional[str] = None
):
    """缓存函数结果的装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # 获取缓存键
            cache_key = key
            if cache_key is None:
                # 生成基于函数名和参数的缓存键
                args_repr = [repr(arg) for arg in args]
                kwargs_repr = [f"{k}={repr(v)}" for k, v in kwargs.items()]
                cache_key = f"{func.__module__}.{func.__name__}({', '.join(args_repr + kwargs_repr)})"
            
            # 获取缓存实例
            cache = cache_manager.get_cache(cache_name)
            
            # 尝试从缓存获取结果
            result = await cache.get(cache_key)
            if result is not None:
                logger.debug(f"Cache hit for key: {cache_key}")
                # 如果结果是JSON字符串，尝试解析
                if isinstance(result, str) and (result.startswith('{') or result.startswith('[')):
                    try:
                        return json.loads(result)
                    except json.JSONDecodeError:
                        pass
                return result
            
            # 缓存未命中，执行函数
            logger.debug(f"Cache miss for key: {cache_key}")
            result = await func(*args, **kwargs)
            
            # 将结果存入缓存
            if isinstance(result, (dict, list)):
                await cache.set(cache_key, json.dumps(result), ttl)
            else:
                await cache.set(cache_key, result, ttl)
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # 同步版本的包装器
            cache_key = key
            if cache_key is None:
                # 生成基于函数名和参数的缓存键
                args_repr = [repr(arg) for arg in args]
                kwargs_repr = [f"{k}={repr(v)}" for k, v in kwargs.items()]
                cache_key = f"{func.__module__}.{func.__name__}({', '.join(args_repr + kwargs_repr)})"
            
            # 获取缓存实例
            cache = cache_manager.get_cache(cache_name)
            
            # 尝试从缓存获取结果
            if isinstance(cache, RedisCache):
                result = cache.get_sync(cache_key)
                if result is not None:
                    logger.debug(f"Cache hit for key: {cache_key}")
                    # 如果结果是JSON字符串，尝试解析
                    if isinstance(result, str) and (result.startswith('{') or result.startswith('[')):
                        try:
                            return json.loads(result)
                        except json.JSONDecodeError:
                            pass
                    return result
            
            # 缓存未命中，执行函数
            logger.debug(f"Cache miss for key: {cache_key}")
            result = func(*args, **kwargs)
            
            # 将结果存入缓存
            if isinstance(cache, RedisCache):
                if isinstance(result, (dict, list)):
                    cache.set_sync(cache_key, json.dumps(result), ttl)
                else:
                    cache.set_sync(cache_key, result, ttl)
            
            return result
        
        # 根据函数是同步还是异步选择合适的包装器
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

# 全局缓存管理器实例
cache_manager = CacheManager()

# 创建默认缓存实例
async def init_default_caches():
    """初始化默认缓存实例"""
    # 创建内存缓存
    memory_cache = InMemoryCache()
    cache_manager.register_cache("memory", memory_cache)
    
    # 从配置中获取Redis配置
    redis_config = get_config("redis", {})
    
    # 创建Redis缓存
    try:
        config = CacheConfig(
            host=redis_config.get("host", "localhost"),
            port=redis_config.get("port", 6379),
            db=redis_config.get("db", 0),
            password=redis_config.get("password"),
            socket_timeout=redis_config.get("socket_timeout", 30),
            retry_attempts=redis_config.get("retry_attempts", 3),
            retry_delay=redis_config.get("retry_delay", 0.5),
            pool_size=redis_config.get("pool_size", 10),
            decode_responses=True
        )
        
        redis_cache = RedisCache(config)
        # 尝试连接以验证配置
        await redis_cache._get_async_client()
        cache_manager.register_cache("redis", redis_cache, is_default=True)
        logger.info("Default Redis cache initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize Redis cache, using memory cache as fallback: {str(e)}")
        cache_manager.register_cache("redis", memory_cache)
        cache_manager.register_cache("memory", memory_cache, is_default=True)

# 导出所有类和函数
__all__ = [
    'CacheError',
    'CacheConnectionError',
    'CacheOperationError',
    'CacheConfig',
    'CacheItem',
    'InMemoryCache',
    'RedisCache',
    'CacheManager',
    'cache_result',
    'cache_manager',
    'init_default_caches'
]