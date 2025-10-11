import os
import re
import json
import time
import uuid
import hashlib
import base64
import random
import string
import datetime
import decimal
from typing import Any, Dict, Optional, List, Union, Tuple, Callable, Set
from enum import Enum
from functools import wraps
from .errors import BaseError
from .logging_system import logger

class UtilsError(BaseError):
    """工具函数异常基类"""
    
    def __init__(
        self,
        message: str = "Utils error",
        error_code: str = "UTILS_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

# 时间处理相关函数
def get_current_timestamp(ms: bool = False) -> Union[int, float]:
    """获取当前时间戳"""
    if ms:
        return int(time.time() * 1000)
    return time.time()

def get_current_datetime(format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """获取当前日期时间字符串"""
    return datetime.datetime.now().strftime(format)

def timestamp_to_datetime(timestamp: Union[int, float], format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """时间戳转换为日期时间字符串"""
    if isinstance(timestamp, float) and timestamp > 1e12:
        # 毫秒时间戳
        timestamp = timestamp / 1000
    return datetime.datetime.fromtimestamp(timestamp).strftime(format)

def datetime_to_timestamp(datetime_str: str, format: str = "%Y-%m-%d %H:%M:%S") -> int:
    """日期时间字符串转换为时间戳"""
    dt = datetime.datetime.strptime(datetime_str, format)
    return int(dt.timestamp())

def time_ago(timestamp: Union[int, float]) -> str:
    """计算时间差并返回友好的时间描述"""
    now = get_current_timestamp()
    diff = now - timestamp
    
    if diff < 60:
        return f"{int(diff)}秒前"
    elif diff < 3600:
        return f"{int(diff / 60)}分钟前"
    elif diff < 86400:
        return f"{int(diff / 3600)}小时前"
    elif diff < 2592000:
        return f"{int(diff / 86400)}天前"
    elif diff < 31536000:
        return f"{int(diff / 2592000)}个月前"
    else:
        return f"{int(diff / 31536000)}年前"

def format_duration(seconds: Union[int, float]) -> str:
    """格式化持续时间"""
    if seconds < 60:
        return f"{seconds:.2f}秒"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        remaining_seconds = seconds % 60
        return f"{minutes}分{remaining_seconds:.2f}秒"
    else:
        hours = int(seconds / 3600)
        remaining_minutes = int((seconds % 3600) / 60)
        remaining_seconds = seconds % 60
        return f"{hours}小时{remaining_minutes}分{remaining_seconds:.2f}秒"

# 数据转换相关函数
def json_to_dict(json_str: str) -> Dict[str, Any]:
    """JSON字符串转换为字典"""
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON: {str(e)}")
        raise UtilsError("Invalid JSON format", "INVALID_JSON")

def dict_to_json(data: Dict[str, Any], indent: Optional[int] = None) -> str:
    """字典转换为JSON字符串"""
    try:
        return json.dumps(data, ensure_ascii=False, indent=indent)
    except (TypeError, ValueError) as e:
        logger.error(f"Failed to serialize to JSON: {str(e)}")
        raise UtilsError("Failed to serialize to JSON", "JSON_SERIALIZATION_ERROR")

def safe_json_loads(json_str: str, default: Any = None) -> Any:
    """安全的JSON解析函数，失败时返回默认值"""
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError, ValueError):
        return default

def safe_json_dumps(data: Any, default: str = "null") -> str:
    """安全的JSON序列化函数，失败时返回默认值"""
    try:
        return json.dumps(data, ensure_ascii=False)
    except (TypeError, ValueError):
        return default

def camel_to_snake(name: str) -> str:
    """驼峰命名转下划线命名"""
    # 处理连续的大写字母
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def snake_to_camel(name: str, upper_camel: bool = False) -> str:
    """下划线命名转驼峰命名"""
    components = name.split('_')
    # 首字母大写
    if upper_camel:
        return ''.join(x.title() for x in components)
    # 首字母小写
    return components[0] + ''.join(x.title() for x in components[1:])

def convert_dict_keys(data: Any, convert_func: Callable[[str], str]) -> Any:
    """转换字典的键名"""
    if isinstance(data, dict):
        return {convert_func(k): convert_dict_keys(v, convert_func) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_dict_keys(item, convert_func) for item in data]
    else:
        return data

def decimal_to_float(data: Any) -> Any:
    """将Decimal类型转换为float"""
    if isinstance(data, decimal.Decimal):
        return float(data)
    elif isinstance(data, dict):
        return {k: decimal_to_float(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [decimal_to_float(item) for item in data]
    else:
        return data

def obj_to_dict(obj: Any, exclude_fields: Optional[Set[str]] = None) -> Dict[str, Any]:
    """将对象转换为字典"""
    exclude = exclude_fields or set()
    result = {}
    
    # 优先使用__dict__
    if hasattr(obj, '__dict__'):
        for key, value in obj.__dict__.items():
            # 排除私有属性和指定的字段
            if not key.startswith('_') and key not in exclude:
                result[key] = obj_to_dict(value, exclude) if hasattr(value, '__dict__') else value
    
    # 处理Pydantic模型
    elif hasattr(obj, 'dict') and callable(obj.dict):
        result = obj.dict(exclude=exclude)
    
    return result

# 字符串处理相关函数
def generate_random_string(length: int, use_digits: bool = True, use_uppercase: bool = True, use_lowercase: bool = True) -> str:
    """生成随机字符串"""
    chars = ''
    if use_lowercase:
        chars += string.ascii_lowercase
    if use_uppercase:
        chars += string.ascii_uppercase
    if use_digits:
        chars += string.digits
    
    if not chars:
        raise UtilsError("At least one character type must be selected", "INVALID_CHAR_TYPE")
    
    return ''.join(random.choice(chars) for _ in range(length))

def generate_uuid() -> str:
    """生成UUID"""
    return str(uuid.uuid4())

def hash_string(data: str, algorithm: str = 'sha256') -> str:
    """计算字符串的哈希值"""
    if algorithm not in hashlib.algorithms_available:
        raise UtilsError(f"Unsupported hash algorithm: {algorithm}", "UNSUPPORTED_ALGORITHM")
    
    hash_func = hashlib.new(algorithm)
    hash_func.update(data.encode('utf-8'))
    return hash_func.hexdigest()

def base64_encode(data: Union[str, bytes]) -> str:
    """Base64编码"""
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.b64encode(data).decode('utf-8')

def base64_decode(data: str) -> bytes:
    """Base64解码"""
    return base64.b64decode(data)

def sanitize_string(s: str, allow_newlines: bool = False) -> str:
    """清理字符串，移除控制字符"""
    if allow_newlines:
        # 允许换行符
        return ''.join(c for c in s if c.isprintable() or c in ('\n', '\r'))
    else:
        # 只保留可打印字符
        return ''.join(c for c in s if c.isprintable())

def truncate_string(s: str, max_length: int, suffix: str = '...') -> str:
    """截断字符串"""
    if len(s) <= max_length:
        return s
    return s[:max_length - len(suffix)] + suffix

def is_valid_email(email: str) -> bool:
    """验证邮箱格式"""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))

def is_valid_phone(phone: str) -> bool:
    """验证手机号格式（简单验证）"""
    # 中国大陆手机号
    pattern = r"^1[3-9]\d{9}$"
    return bool(re.match(pattern, phone))

# 文件处理相关函数
def read_file(file_path: str, encoding: str = 'utf-8') -> str:
    """读取文件内容"""
    try:
        with open(file_path, 'r', encoding=encoding) as f:
            return f.read()
    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {str(e)}")
        raise UtilsError(f"Failed to read file", "FILE_READ_ERROR", details={"file": file_path, "error": str(e)})

def write_file(file_path: str, content: str, encoding: str = 'utf-8', append: bool = False) -> None:
    """写入文件内容"""
    mode = 'a' if append else 'w'
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        
        with open(file_path, mode, encoding=encoding) as f:
            f.write(content)
    except Exception as e:
        logger.error(f"Failed to write file {file_path}: {str(e)}")
        raise UtilsError(f"Failed to write file", "FILE_WRITE_ERROR", details={"file": file_path, "error": str(e)})

def read_json_file(file_path: str) -> Dict[str, Any]:
    """读取JSON文件"""
    try:
        content = read_file(file_path)
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON file {file_path}: {str(e)}")
        raise UtilsError(f"Invalid JSON file", "INVALID_JSON_FILE", details={"file": file_path, "error": str(e)})

def write_json_file(file_path: str, data: Dict[str, Any], indent: int = 2) -> None:
    """写入JSON文件"""
    content = json.dumps(data, ensure_ascii=False, indent=indent)
    write_file(file_path, content)

def get_file_size(file_path: str) -> int:
    """获取文件大小（字节）"""
    try:
        return os.path.getsize(file_path)
    except Exception as e:
        logger.error(f"Failed to get file size {file_path}: {str(e)}")
        raise UtilsError(f"Failed to get file size", "FILE_SIZE_ERROR", details={"file": file_path, "error": str(e)})

def get_file_extension(file_path: str) -> str:
    """获取文件扩展名"""
    _, extension = os.path.splitext(file_path)
    return extension.lower().lstrip('.')

def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"

# 集合和列表处理函数
def chunk_list(lst: List[Any], chunk_size: int) -> List[List[Any]]:
    """将列表分割成指定大小的子列表"""
    if chunk_size <= 0:
        raise UtilsError("Chunk size must be positive", "INVALID_CHUNK_SIZE")
    
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]

def flatten_list(nested_list: List[Any]) -> List[Any]:
    """扁平化嵌套列表"""
    result = []
    for item in nested_list:
        if isinstance(item, list):
            result.extend(flatten_list(item))
        else:
            result.append(item)
    return result

def unique_list(lst: List[Any]) -> List[Any]:
    """获取列表中的唯一元素"""
    # 保持原始顺序
    seen = set()
    result = []
    for item in lst:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

def intersect_lists(list1: List[Any], list2: List[Any]) -> List[Any]:
    """计算两个列表的交集"""
    set1 = set(list1)
    set2 = set(list2)
    return list(set1.intersection(set2))

def union_lists(list1: List[Any], list2: List[Any]) -> List[Any]:
    """计算两个列表的并集"""
    set1 = set(list1)
    set2 = set(list2)
    return list(set1.union(set2))

def difference_lists(list1: List[Any], list2: List[Any]) -> List[Any]:
    """计算两个列表的差集"""
    set1 = set(list1)
    set2 = set(list2)
    return list(set1.difference(set2))

def find_duplicates(lst: List[Any]) -> List[Any]:
    """找出列表中的重复元素"""
    seen = set()
    duplicates = set()
    for item in lst:
        if item in seen:
            duplicates.add(item)
        else:
            seen.add(item)
    return list(duplicates)

def group_by_key(items: List[Dict[str, Any]], key: str) -> Dict[Any, List[Dict[str, Any]]]:
    """根据指定键对列表中的字典进行分组"""
    result = {}
    for item in items:
        if key in item:
            group_key = item[key]
            if group_key not in result:
                result[group_key] = []
            result[group_key].append(item)
    return result

def sort_by_key(items: List[Dict[str, Any]], key: str, reverse: bool = False) -> List[Dict[str, Any]]:
    """根据指定键对列表中的字典进行排序"""
    return sorted(items, key=lambda x: x.get(key, 0), reverse=reverse)

# 装饰器相关函数
def retry(max_retries: int = 3, delay: int = 1, exceptions: Tuple[Exception, ...] = (Exception,)) -> Callable:
    """重试装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                    
                    # 如果不是最后一次尝试，则等待后重试
                    if attempt < max_retries:
                        time.sleep(delay * (2 ** attempt))  # 指数退避
                    
            # 所有尝试都失败
            logger.error(f"All {max_retries + 1} attempts failed")
            raise last_exception
        
        return wrapper
    
    return decorator

def timer(func: Callable) -> Callable:
    """计时器装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            return func(*args, **kwargs)
        finally:
            end_time = time.time()
            elapsed = end_time - start_time
            logger.info(f"Function {func.__name__} took {elapsed:.4f} seconds to execute")
    
    return wrapper

def singleton(cls):
    """单例模式装饰器"""
    instances = {}
    
    @wraps(cls)
    def get_instance(*args, **kwargs):
        if cls not in instances:
            instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    
    return get_instance

def memoize(func: Callable) -> Callable:
    """缓存函数结果的装饰器"""
    cache = {}
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        # 创建缓存键
        key = str(args) + str(kwargs)
        
        if key not in cache:
            cache[key] = func(*args, **kwargs)
        
        return cache[key]
    
    # 提供清除缓存的方法
    def clear_cache():
        cache.clear()
        
    wrapper.clear_cache = clear_cache
    
    return wrapper

# 数值处理相关函数
def clamp(value: float, min_value: float, max_value: float) -> float:
    """将值限制在指定范围内"""
    return max(min_value, min(value, max_value))

def round_to_nearest(value: float, nearest: float = 1.0) -> float:
    """四舍五入到最接近的指定值"""
    return round(value / nearest) * nearest

def average(values: List[float]) -> float:
    """计算平均值"""
    if not values:
        return 0.0
    return sum(values) / len(values)

def median(values: List[float]) -> float:
    """计算中位数"""
    if not values:
        return 0.0
    sorted_values = sorted(values)
    n = len(sorted_values)
    if n % 2 == 0:
        return (sorted_values[n // 2 - 1] + sorted_values[n // 2]) / 2
    else:
        return sorted_values[n // 2]

def percentage(part: float, total: float) -> float:
    """计算百分比"""
    if total == 0:
        return 0.0
    return (part / total) * 100

def format_number(number: Union[int, float], decimals: int = 2) -> str:
    """格式化数字，添加千位分隔符"""
    if isinstance(number, int):
        return f"{number:,}"
    else:
        return f"{number:,.{decimals}f}"

# 网络相关函数
def is_valid_ip(ip: str) -> bool:
    """验证IP地址格式"""
    # IPv4验证
    ipv4_pattern = r"^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
    
    # IPv6验证（简化版）
    ipv6_pattern = r"^([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4})$"
    
    return bool(re.match(ipv4_pattern, ip)) or bool(re.match(ipv6_pattern, ip))

def is_valid_url(url: str) -> bool:
    """验证URL格式"""
    pattern = r"^https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:/[^\s]*)?$"
    return bool(re.match(pattern, url))

def extract_domain(url: str) -> Optional[str]:
    """从URL中提取域名"""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc
    except Exception:
        return None

# 系统相关函数
def get_environment() -> str:
    """获取当前运行环境"""
    return os.environ.get('ENVIRONMENT', 'development')

def is_development() -> bool:
    """检查是否为开发环境"""
    env = get_environment().lower()
    return env in ('dev', 'development', 'local', 'test')

def is_production() -> bool:
    """检查是否为生产环境"""
    env = get_environment().lower()
    return env in ('prod', 'production', 'live')

def get_system_info() -> Dict[str, Any]:
    """获取系统信息"""
    import platform
    import psutil
    
    return {
        'system': platform.system(),
        'release': platform.release(),
        'version': platform.version(),
        'machine': platform.machine(),
        'processor': platform.processor(),
        'python_version': platform.python_version(),
        'cpu_count': psutil.cpu_count(logical=True),
        'memory': {
            'total': format_file_size(psutil.virtual_memory().total),
            'used': format_file_size(psutil.virtual_memory().used),
            'percent': psutil.virtual_memory().percent
        }
    }

def measure_memory_usage(func: Callable) -> Callable:
    """测量函数内存使用的装饰器"""
    import psutil
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        process = psutil.Process(os.getpid())
        start_memory = process.memory_info().rss
        
        try:
            return func(*args, **kwargs)
        finally:
            end_memory = process.memory_info().rss
            memory_used = end_memory - start_memory
            logger.info(f"Function {func.__name__} used {format_file_size(memory_used)} of memory")
    
    return wrapper

# 导出所有函数
__all__ = [
    # 异常类
    'UtilsError',
    
    # 时间处理
    'get_current_timestamp',
    'get_current_datetime',
    'timestamp_to_datetime',
    'datetime_to_timestamp',
    'time_ago',
    'format_duration',
    
    # 数据转换
    'json_to_dict',
    'dict_to_json',
    'safe_json_loads',
    'safe_json_dumps',
    'camel_to_snake',
    'snake_to_camel',
    'convert_dict_keys',
    'decimal_to_float',
    'obj_to_dict',
    
    # 字符串处理
    'generate_random_string',
    'generate_uuid',
    'hash_string',
    'base64_encode',
    'base64_decode',
    'sanitize_string',
    'truncate_string',
    'is_valid_email',
    'is_valid_phone',
    
    # 文件处理
    'read_file',
    'write_file',
    'read_json_file',
    'write_json_file',
    'get_file_size',
    'get_file_extension',
    'format_file_size',
    
    # 集合和列表处理
    'chunk_list',
    'flatten_list',
    'unique_list',
    'intersect_lists',
    'union_lists',
    'difference_lists',
    'find_duplicates',
    'group_by_key',
    'sort_by_key',
    
    # 装饰器
    'retry',
    'timer',
    'singleton',
    'memoize',
    
    # 数值处理
    'clamp',
    'round_to_nearest',
    'average',
    'median',
    'percentage',
    'format_number',
    
    # 网络相关
    'is_valid_ip',
    'is_valid_url',
    'extract_domain',
    
    # 系统相关
    'get_environment',
    'is_development',
    'is_production',
    'get_system_info',
    'measure_memory_usage'
]