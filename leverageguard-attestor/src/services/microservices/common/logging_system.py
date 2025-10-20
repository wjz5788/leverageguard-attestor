import os
import sys
import logging
import datetime
import json
import traceback
from typing import Optional, Dict, Any, Union, Callable
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
import threading

# 导入配置管理器
from .config_manager import get_config, is_debug_mode

# 默认日志配置
DEFAULT_LOG_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'datefmt': '%Y-%m-%d %H:%M:%S',
    'file_enabled': True,
    'file_path': 'logs/app.log',
    'file_max_bytes': 10 * 1024 * 1024,  # 10MB
    'file_backup_count': 5,
    'console_enabled': True,
    'json_logs': False,
    'trace_id_header': 'X-Trace-ID',
    'include_context': True
}

class JSONFormatter(logging.Formatter):
    """JSON格式日志格式化器"""
    def __init__(self, include_context: bool = True):
        self.include_context = include_context
        super().__init__()
    
    def format(self, record: logging.LogRecord) -> str:
        """将日志记录格式化为JSON字符串"""
        # 基础日志字段
        log_data = {
            'timestamp': self.formatTime(record, '%Y-%m-%dT%H:%M:%S.%fZ'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage()
        }
        
        # 添加异常信息（如果有）
        if record.exc_info:
            log_data['exception'] = traceback.format_exc(record.exc_info)
        
        # 添加调用位置信息
        if hasattr(record, 'funcName'):
            log_data['function'] = record.funcName
        if hasattr(record, 'lineno'):
            log_data['line'] = record.lineno
        if hasattr(record, 'pathname'):
            log_data['file'] = record.pathname
        
        # 添加额外上下文信息（如果有）
        if hasattr(record, 'extra_context') and self.include_context:
            log_data.update(record.extra_context)
        
        # 添加请求ID（如果有）
        if hasattr(record, 'trace_id'):
            log_data['trace_id'] = record.trace_id
        
        # 添加用户ID（如果有）
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        
        # 转换为JSON字符串
        return json.dumps(log_data)

class LoggerManager:
    """日志管理器类，提供统一的日志记录功能"""
    _instance = None
    _lock = threading.RLock()
    _loggers = {}
    _initialized = False
    
    def __new__(cls):
        """单例模式实现"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LoggerManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """初始化日志管理器"""
        with self._lock:
            if not LoggerManager._initialized:
                # 加载日志配置
                self._config = self._load_config()
                # 初始化根日志记录器
                self._initialize_root_logger()
                LoggerManager._initialized = True
    
    def _load_config(self) -> Dict[str, Any]:
        """加载日志配置"""
        config = DEFAULT_LOG_CONFIG.copy()
        
        # 从配置管理器加载配置
        try:
            log_config = get_config('logging', {})
            config.update(log_config)
        except Exception as e:
            # 如果无法加载配置，使用默认配置
            print(f"Failed to load logging config: {str(e)}")
        
        # 如果是调试模式，设置日志级别为DEBUG
        if is_debug_mode():
            config['level'] = 'DEBUG'
        
        return config
    
    def _initialize_root_logger(self):
        """初始化根日志记录器"""
        # 获取根日志记录器
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, self._config['level'], logging.INFO))
        
        # 清除现有的处理器
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)
        
        # 添加控制台处理器
        if self._config['console_enabled']:
            console_handler = logging.StreamHandler(sys.stdout)
            if self._config['json_logs']:
                console_handler.setFormatter(JSONFormatter(include_context=self._config['include_context']))
            else:
                console_handler.setFormatter(logging.Formatter(self._config['format'], self._config['datefmt']))
            root_logger.addHandler(console_handler)
        
        # 添加文件处理器
        if self._config['file_enabled']:
            # 确保日志目录存在
            log_dir = os.path.dirname(self._config['file_path'])
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
            
            # 创建文件处理器
            if 'file_rotation' in self._config and self._config['file_rotation'] == 'time':
                # 基于时间的日志轮转
                file_handler = TimedRotatingFileHandler(
                    filename=self._config['file_path'],
                    when=self._config.get('file_rotation_when', 'midnight'),
                    interval=self._config.get('file_rotation_interval', 1),
                    backupCount=self._config['file_backup_count']
                )
            else:
                # 基于大小的日志轮转
                file_handler = RotatingFileHandler(
                    filename=self._config['file_path'],
                    maxBytes=self._config['file_max_bytes'],
                    backupCount=self._config['file_backup_count']
                )
            
            # 设置日志格式化器
            if self._config['json_logs']:
                file_handler.setFormatter(JSONFormatter(include_context=self._config['include_context']))
            else:
                file_handler.setFormatter(logging.Formatter(self._config['format'], self._config['datefmt']))
            
            # 添加到根日志记录器
            root_logger.addHandler(file_handler)
    
    def get_logger(self, name: str = None) -> logging.Logger:
        """获取指定名称的日志记录器"""
        with self._lock:
            # 如果未指定名称，使用模块名称
            if name is None:
                # 获取调用者的模块名称
                frame = sys._getframe(1)
                name = frame.f_globals.get('__name__', '__main__')
            
            # 检查日志记录器是否已经存在
            if name not in LoggerManager._loggers:
                # 创建新的日志记录器
                LoggerManager._loggers[name] = logging.getLogger(name)
            
            return LoggerManager._loggers[name]
    
    def set_level(self, level: Union[str, int]):
        """设置全局日志级别"""
        with self._lock:
            # 更新配置
            if isinstance(level, str):
                self._config['level'] = level.upper()
            else:
                self._config['level'] = logging.getLevelName(level)
            
            # 重新初始化根日志记录器
            self._initialize_root_logger()
    
    def enable_json_logs(self, enable: bool):
        """启用或禁用JSON日志格式"""
        with self._lock:
            # 更新配置
            self._config['json_logs'] = enable
            
            # 重新初始化根日志记录器
            self._initialize_root_logger()
    
    def add_global_context(self, context: Dict[str, Any]):
        """添加全局上下文信息到所有日志记录"""
        # 注意：这个功能需要自定义Filter来实现
        pass

# 全局日志管理器实例
logger_manager = LoggerManager()

# 日志工具函数
def get_logger(name: str = None) -> logging.Logger:
    """获取日志记录器"""
    return logger_manager.get_logger(name)

def log_debug(message: str, *args, **kwargs):
    """记录DEBUG级别日志"""
    logger = get_logger()
    logger.debug(message, *args, **kwargs)

def log_info(message: str, *args, **kwargs):
    """记录INFO级别日志"""
    logger = get_logger()
    logger.info(message, *args, **kwargs)

def log_warning(message: str, *args, **kwargs):
    """记录WARNING级别日志"""
    logger = get_logger()
    logger.warning(message, *args, **kwargs)

def log_error(message: str, *args, **kwargs):
    """记录ERROR级别日志"""
    logger = get_logger()
    logger.error(message, *args, **kwargs)

def log_critical(message: str, *args, **kwargs):
    """记录CRITICAL级别日志"""
    logger = get_logger()
    logger.critical(message, *args, **kwargs)

def log_exception(message: str, *args, exc_info: bool = True, **kwargs):
    """记录异常信息"""
    logger = get_logger()
    logger.exception(message, *args, exc_info=exc_info, **kwargs)

# 带上下文的日志记录
def log_with_context(logger: logging.Logger, level: int, message: str, context: Dict[str, Any] = None, **kwargs):
    """带上下文的日志记录"""
    # 创建一个日志记录器的副本，添加上下文信息
    extra = {}
    if context:
        extra['extra_context'] = context
    
    # 记录日志
    logger.log(level, message, extra=extra, **kwargs)

# 日志装饰器
def log_function_call(logger: Optional[logging.Logger] = None, level: int = logging.DEBUG):
    """记录函数调用的装饰器"""
    def decorator(func: Callable) -> Callable:
        nonlocal logger
        if logger is None:
            logger = get_logger(func.__module__)
        
        def wrapper(*args, **kwargs):
            # 记录函数调用信息
            func_name = func.__name__
            logger.log(level, f"Calling function: {func_name}")
            logger.log(level, f"Args: {args}")
            logger.log(level, f"Kwargs: {kwargs}")
            
            try:
                # 执行函数
                result = func(*args, **kwargs)
                
                # 记录函数返回信息
                logger.log(level, f"Function {func_name} returned: {result}")
                return result
            except Exception as e:
                # 记录异常信息
                logger.error(f"Exception in function {func_name}: {str(e)}")
                raise
        
        return wrapper
    
    return decorator

# 导出所有公共接口
__all__ = [
    'LoggerManager',
    'logger_manager',
    'get_logger',
    'log_debug',
    'log_info',
    'log_warning',
    'log_error',
    'log_critical',
    'log_exception',
    'log_with_context',
    'log_function_call',
    'JSONFormatter'
]

# 示例使用
if __name__ == '__main__':
    # 获取日志记录器
    logger = get_logger('example')
    
    # 记录不同级别的日志
    logger.debug('This is a debug message')
    logger.info('This is an info message')
    logger.warning('This is a warning message')
    logger.error('This is an error message')
    logger.critical('This is a critical message')
    
    # 使用工具函数记录日志
    log_debug('Using debug utility function')
    log_info('Using info utility function')
    
    # 记录异常信息
    try:
        1 / 0
    except Exception:
        log_exception('An error occurred')
    
    # 使用装饰器记录函数调用
    @log_function_call()
    def example_function(a, b):
        return a + b
    
    example_function(1, 2)