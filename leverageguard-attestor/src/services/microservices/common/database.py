import asyncio
import json
import time
from typing import Any, Dict, Optional, Callable, Union, List, Tuple, TypeVar, Generic
from functools import wraps
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session, relationship, backref
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, DatabaseError
from sqlalchemy.sql import text as sql_text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from .errors import BaseError
from .config_manager import get_config
from .logging_system import logger

class DatabaseError(BaseError):
    """数据库相关异常基类"""
    
    def __init__(
        self,
        message: str = "Database error",
        error_code: str = "DATABASE_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class DatabaseConnectionError(DatabaseError):
    """数据库连接异常"""
    
    def __init__(
        self,
        message: str = "Failed to connect to database",
        error_code: str = "DB_CONNECTION_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class DatabaseOperationError(DatabaseError):
    """数据库操作异常"""
    
    def __init__(
        self,
        message: str = "Database operation failed",
        error_code: str = "DB_OPERATION_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class DatabaseConfig:
    """数据库配置类"""
    
    def __init__(
        self,
        url: Optional[str] = None,
        dialect: str = "postgresql",
        driver: Optional[str] = None,
        host: str = "localhost",
        port: int = 5432,
        database: str = "postgres",
        username: str = "postgres",
        password: Optional[str] = None,
        pool_size: int = 20,
        max_overflow: int = 10,
        pool_timeout: int = 30,
        pool_recycle: int = 3600,
        echo: bool = False,
        echo_pool: bool = False
    ):
        self.url = url
        self.dialect = dialect
        self.driver = driver
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.pool_timeout = pool_timeout
        self.pool_recycle = pool_recycle
        self.echo = echo
        self.echo_pool = echo_pool
    
    def get_url(self) -> str:
        """获取数据库连接URL"""
        if self.url:
            return self.url
        
        # 构建连接URL
        driver_part = f"+{self.driver}" if self.driver else ""
        password_part = f":{self.password}" if self.password else ""
        
        return f"{self.dialect}{driver_part}://{self.username}{password_part}@{self.host}:{self.port}/{self.database}"

class DatabaseManager:
    """数据库管理器"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        """单例模式实现"""
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """初始化数据库管理器"""
        self._engine = None
        self._async_engine = None
        self._session_factory = None
        self._async_session_factory = None
        self._scoped_session = None
        self._config = None
        self._initialized = False
    
    def init_sync(self, config: Optional[DatabaseConfig] = None) -> None:
        """初始化同步数据库连接"""
        if self._initialized:
            return
        
        try:
            # 加载配置
            if config is None:
                config = self._load_config()
            self._config = config
            
            # 创建引擎
            self._engine = create_engine(
                config.get_url(),
                pool_size=config.pool_size,
                max_overflow=config.max_overflow,
                pool_timeout=config.pool_timeout,
                pool_recycle=config.pool_recycle,
                echo=config.echo,
                echo_pool=config.echo_pool
            )
            
            # 创建会话工厂
            self._session_factory = sessionmaker(bind=self._engine)
            
            # 创建线程本地会话
            self._scoped_session = scoped_session(self._session_factory)
            
            # 测试连接
            with self._engine.connect() as conn:
                conn.execute(sql_text("SELECT 1"))
            
            self._initialized = True
            logger.info(f"Successfully connected to database: {config.get_url().split('@')[1]}")
        except Exception as e:
            logger.error(f"Failed to initialize database connection: {str(e)}")
            raise DatabaseConnectionError(details={"error": str(e)})
    
    async def init_async(self, config: Optional[DatabaseConfig] = None) -> None:
        """初始化异步数据库连接"""
        if self._async_engine is not None:
            return
        
        try:
            # 加载配置
            if config is None:
                config = self._load_config()
            self._config = config
            
            # 确保驱动支持异步操作
            if not config.driver or "asyncpg" not in config.driver:
                if config.dialect == "postgresql":
                    config.driver = "asyncpg"
                elif config.dialect == "mysql":
                    config.driver = "aiomysql"
                else:
                    raise DatabaseError(message=f"Unsupported dialect for async operations: {config.dialect}")
            
            # 创建异步引擎
            self._async_engine = create_async_engine(
                config.get_url(),
                pool_size=config.pool_size,
                max_overflow=config.max_overflow,
                pool_timeout=config.pool_timeout,
                pool_recycle=config.pool_recycle,
                echo=config.echo,
                echo_pool=config.echo_pool
            )
            
            # 创建异步会话工厂
            self._async_session_factory = sessionmaker(
                bind=self._async_engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            
            # 测试连接
            async with self._async_engine.connect() as conn:
                await conn.execute(sql_text("SELECT 1"))
            
            logger.info(f"Successfully connected to database (async): {config.get_url().split('@')[1]}")
        except Exception as e:
            logger.error(f"Failed to initialize async database connection: {str(e)}")
            raise DatabaseConnectionError(details={"error": str(e)})
    
    def _load_config(self) -> DatabaseConfig:
        """从配置管理器加载数据库配置"""
        db_config = get_config("database", {})
        
        return DatabaseConfig(
            url=db_config.get("url"),
            dialect=db_config.get("dialect", "postgresql"),
            driver=db_config.get("driver"),
            host=db_config.get("host", "localhost"),
            port=db_config.get("port", 5432),
            database=db_config.get("database", "postgres"),
            username=db_config.get("username", "postgres"),
            password=db_config.get("password"),
            pool_size=db_config.get("pool_size", 20),
            max_overflow=db_config.get("max_overflow", 10),
            pool_timeout=db_config.get("pool_timeout", 30),
            pool_recycle=db_config.get("pool_recycle", 3600),
            echo=db_config.get("echo", False),
            echo_pool=db_config.get("echo_pool", False)
        )
    
    def get_session(self) -> scoped_session:
        """获取同步数据库会话"""
        if not self._initialized:
            self.init_sync()
        
        return self._scoped_session()
    
    def get_engine(self):
        """获取同步数据库引擎"""
        if not self._initialized:
            self.init_sync()
        
        return self._engine
    
    async def get_async_session(self) -> AsyncSession:
        """获取异步数据库会话"""
        if self._async_engine is None:
            await self.init_async()
        
        return self._async_session_factory()
    
    async def get_async_engine(self):
        """获取异步数据库引擎"""
        if self._async_engine is None:
            await self.init_async()
        
        return self._async_engine
    
    def close(self) -> None:
        """关闭数据库连接"""
        if self._scoped_session:
            self._scoped_session.remove()
        
        if self._engine:
            self._engine.dispose()
            self._engine = None
        
        self._initialized = False
        logger.info("Database connection closed")
    
    async def close_async(self) -> None:
        """关闭异步数据库连接"""
        if self._async_engine:
            await self._async_engine.dispose()
            self._async_engine = None
        
        logger.info("Async database connection closed")

# 声明式基类
Base = declarative_base()

# 数据库会话上下文管理器
def session_scope():
    """提供一个数据库会话的上下文管理器"""
    session = db_manager.get_session()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        raise DatabaseOperationError(details={"error": str(e)})
    finally:
        session.close()

async def async_session_scope():
    """提供一个异步数据库会话的上下文管理器"""
    session = await db_manager.get_async_session()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise DatabaseOperationError(details={"error": str(e)})
    finally:
        await session.close()

# 数据库操作装饰器
def with_db_session(func: Callable) -> Callable:
    """为函数提供数据库会话的装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        with session_scope() as session:
            # 如果kwargs中没有session参数，添加它
            if 'session' not in kwargs:
                kwargs['session'] = session
            
            try:
                result = func(*args, **kwargs)
                return result
            except SQLAlchemyError as e:
                logger.error(f"Database error in function {func.__name__}: {str(e)}")
                raise DatabaseOperationError(details={"function": func.__name__, "error": str(e)})
    
    return wrapper

async def async_with_db_session(func: Callable) -> Callable:
    """为异步函数提供数据库会话的装饰器"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        async with async_session_scope() as session:
            # 如果kwargs中没有session参数，添加它
            if 'session' not in kwargs:
                kwargs['session'] = session
            
            try:
                result = await func(*args, **kwargs)
                return result
            except SQLAlchemyError as e:
                logger.error(f"Database error in async function {func.__name__}: {str(e)}")
                raise DatabaseOperationError(details={"function": func.__name__, "error": str(e)})
    
    return wrapper

# 通用模型基类
class BaseModel(Base):
    """数据库模型基类"""
    __abstract__ = True
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime, default=lambda: time.strftime('%Y-%m-%d %H:%M:%S'))
    updated_at = Column(DateTime, default=lambda: time.strftime('%Y-%m-%d %H:%M:%S'), onupdate=lambda: time.strftime('%Y-%m-%d %H:%M:%S'))
    is_deleted = Column(Boolean, default=False)
    
    def to_dict(self) -> Dict[str, Any]:
        """将模型转换为字典格式"""
        result = {}
        for column in self.__table__.columns:
            value = getattr(self, column.name)
            # 处理日期时间对象
            if hasattr(value, 'isoformat'):
                value = value.isoformat()
            result[column.name] = value
        return result
    
    @classmethod
    @with_db_session
    def get_by_id(cls, id: int, session=None) -> Optional['BaseModel']:
        """通过ID获取记录"""
        return session.query(cls).filter(cls.id == id, cls.is_deleted == False).first()
    
    @classmethod
    @with_db_session
    def get_all(cls, session=None) -> List['BaseModel']:
        """获取所有记录"""
        return session.query(cls).filter(cls.is_deleted == False).all()
    
    @classmethod
    @with_db_session
    def count(cls, session=None) -> int:
        """获取记录总数"""
        return session.query(cls).filter(cls.is_deleted == False).count()
    
    @with_db_session
    def save(self, session=None) -> 'BaseModel':
        """保存记录"""
        try:
            session.add(self)
            session.flush()
            return self
        except IntegrityError as e:
            logger.error(f"Integrity error when saving {self.__class__.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "save", "error": str(e)})
    
    @with_db_session
    def update(self, **kwargs) -> 'BaseModel':
        """更新记录"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        
        try:
            session.add(self)
            session.flush()
            return self
        except IntegrityError as e:
            logger.error(f"Integrity error when updating {self.__class__.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "update", "error": str(e)})
    
    @with_db_session
    def soft_delete(self, session=None) -> None:
        """软删除记录"""
        self.is_deleted = True
        session.add(self)
        session.flush()
    
    @with_db_session
    def hard_delete(self, session=None) -> None:
        """硬删除记录"""
        session.delete(self)
        session.flush()
    
    # 异步方法
    @classmethod
    async def async_get_by_id(cls, id: int) -> Optional['BaseModel']:
        """异步通过ID获取记录"""
        async with async_session_scope() as session:
            return await session.get(cls, id)
    
    @classmethod
    async def async_get_all(cls) -> List['BaseModel']:
        """异步获取所有记录"""
        async with async_session_scope() as session:
            result = await session.execute(
                sql_text(f"SELECT * FROM {cls.__tablename__} WHERE is_deleted = false")
            )
            return result.fetchall()
    
    async def async_save(self) -> 'BaseModel':
        """异步保存记录"""
        async with async_session_scope() as session:
            session.add(self)
            await session.flush()
            return self
    
    async def async_update(self, **kwargs) -> 'BaseModel':
        """异步更新记录"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        
        async with async_session_scope() as session:
            session.add(self)
            await session.flush()
            return self
    
    async def async_soft_delete(self) -> None:
        """异步软删除记录"""
        self.is_deleted = True
        async with async_session_scope() as session:
            session.add(self)
            await session.flush()
    
    async def async_hard_delete(self) -> None:
        """异步硬删除记录"""
        async with async_session_scope() as session:
            await session.delete(self)
            await session.flush()

# 分页查询辅助函数
def paginate_query(query, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """对查询结果进行分页"""
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 获取分页结果
    items = query.offset(offset).limit(page_size).all()
    
    # 获取总记录数
    total = query.count()
    
    # 计算总页数
    total_pages = (total + page_size - 1) // page_size
    
    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
        'has_next': page < total_pages,
        'has_prev': page > 1
    }

async def async_paginate_query(query, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """异步对查询结果进行分页"""
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 获取分页结果
    result = await query.offset(offset).limit(page_size)
    items = result.scalars().all()
    
    # 获取总记录数
    total = await query.count()
    
    # 计算总页数
    total_pages = (total + page_size - 1) // page_size
    
    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
        'has_next': page < total_pages,
        'has_prev': page > 1
    }

# 事务装饰器
def transaction(func: Callable) -> Callable:
    """为函数提供数据库事务的装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        session = db_manager.get_session()
        try:
            # 开始事务
            result = func(*args, **kwargs, session=session)
            session.commit()
            return result
        except Exception as e:
            session.rollback()
            logger.error(f"Transaction failed in function {func.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"function": func.__name__, "error": str(e)})
        finally:
            session.close()
    
    return wrapper

async def async_transaction(func: Callable) -> Callable:
    """为异步函数提供数据库事务的装饰器"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        session = await db_manager.get_async_session()
        try:
            # 开始事务
            result = await func(*args, **kwargs, session=session)
            await session.commit()
            return result
        except Exception as e:
            await session.rollback()
            logger.error(f"Async transaction failed in function {func.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"function": func.__name__, "error": str(e)})
        finally:
            await session.close()
    
    return wrapper

# 全局数据库管理器实例
db_manager = DatabaseManager()

# 导出所有类和函数
__all__ = [
    'DatabaseError',
    'DatabaseConnectionError',
    'DatabaseOperationError',
    'DatabaseConfig',
    'DatabaseManager',
    'Base',
    'BaseModel',
    'db_manager',
    'session_scope',
    'async_session_scope',
    'with_db_session',
    'async_with_db_session',
    'paginate_query',
    'async_paginate_query',
    'transaction',
    'async_transaction'
]