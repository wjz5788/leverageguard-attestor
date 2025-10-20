import os
import sys
import unittest
import asyncio
import time
import random
from typing import Any, Dict, List, Tuple, Optional, Callable
from unittest.mock import Mock, patch, MagicMock
import pytest
import httpx
from .errors import BaseError
from .config_manager import get_config
from .logging_system import logger

class TestUtilsError(BaseError):
    """测试工具异常基类"""
    
    def __init__(
        self,
        message: str = "Test utils error",
        error_code: str = "TEST_UTILS_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class TestBase(unittest.TestCase):
    """测试基类，提供通用测试工具"""
    
    def setUp(self):
        """测试前的准备工作"""
        # 保存原始环境变量
        self.original_env = dict(os.environ)
        # 设置测试环境
        os.environ['ENVIRONMENT'] = 'test'
        # 初始化测试数据
        self.test_data = self._prepare_test_data()
        
    def tearDown(self):
        """测试后的清理工作"""
        # 恢复原始环境变量
        os.environ.clear()
        os.environ.update(self.original_env)
        
    def _prepare_test_data(self) -> Dict[str, Any]:
        """准备测试数据"""
        return {
            "test_string": "test_string_value",
            "test_int": 42,
            "test_float": 3.14,
            "test_bool": True,
            "test_list": [1, 2, 3, 4, 5],
            "test_dict": {"key1": "value1", "key2": 123},
            "test_none": None
        }
    
    def assert_dict_contains(self, actual: Dict[str, Any], expected: Dict[str, Any]):
        """断言字典包含指定的键值对"""
        for key, value in expected.items():
            self.assertIn(key, actual)
            self.assertEqual(actual[key], value)
    
    def assert_dict_equal_ignore_order(self, dict1: Dict[str, Any], dict2: Dict[str, Any]):
        """断言两个字典相等，忽略键的顺序"""
        self.assertEqual(sorted(dict1.keys()), sorted(dict2.keys()))
        for key in dict1:
            self.assertEqual(dict1[key], dict2[key])
    
    def assert_raises_with_message(self, exception_class, message, func, *args, **kwargs):
        """断言函数抛出指定异常并包含指定消息"""
        with self.assertRaises(exception_class) as context:
            func(*args, **kwargs)
        self.assertIn(message, str(context.exception))

class AsyncTestBase(unittest.TestCase):
    """异步测试基类"""
    
    def setUp(self):
        """测试前的准备工作"""
        # 保存原始环境变量
        self.original_env = dict(os.environ)
        # 设置测试环境
        os.environ['ENVIRONMENT'] = 'test'
        # 创建事件循环
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
    def tearDown(self):
        """测试后的清理工作"""
        # 关闭事件循环
        self.loop.close()
        # 恢复原始环境变量
        os.environ.clear()
        os.environ.update(self.original_env)
    
    def async_test(self, coro):
        """异步测试装饰器"""
        def wrapper(*args, **kwargs):
            return self.loop.run_until_complete(coro(*args, **kwargs))
        return wrapper

class MockResponse:
    """模拟HTTP响应"""
    
    def __init__(
        self,
        status_code: int = 200,
        json_data: Optional[Dict[str, Any]] = None,
        text: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None
    ):
        self.status_code = status_code
        self.json_data = json_data or {}
        self.text = text or ""
        self.headers = headers or {}
        
    def json(self):
        """返回JSON数据"""
        return self.json_data

class TestClient:
    """测试客户端，用于模拟HTTP请求"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self._responses = {}
    
    def mock_response(self, path: str, response: MockResponse):
        """设置指定路径的模拟响应"""
        full_path = f"{self.base_url}{path}" if not path.startswith(self.base_url) else path
        self._responses[full_path] = response
    
    async def get(self, url: str, **kwargs):
        """模拟GET请求"""
        full_url = f"{self.base_url}{url}" if not url.startswith(self.base_url) else url
        return self._responses.get(full_url, MockResponse(status_code=404))
    
    async def post(self, url: str, **kwargs):
        """模拟POST请求"""
        full_url = f"{self.base_url}{url}" if not url.startswith(self.base_url) else url
        return self._responses.get(full_url, MockResponse(status_code=404))
    
    async def put(self, url: str, **kwargs):
        """模拟PUT请求"""
        full_url = f"{self.base_url}{url}" if not url.startswith(self.base_url) else url
        return self._responses.get(full_url, MockResponse(status_code=404))
    
    async def delete(self, url: str, **kwargs):
        """模拟DELETE请求"""
        full_url = f"{self.base_url}{url}" if not url.startswith(self.base_url) else url
        return self._responses.get(full_url, MockResponse(status_code=404))

class TestDataGenerator:
    """测试数据生成器"""
    
    @staticmethod
    def generate_string(length: int = 10, use_digits: bool = True, use_uppercase: bool = True) -> str:
        """生成随机字符串"""
        import string
        chars = string.ascii_lowercase
        if use_digits:
            chars += string.digits
        if use_uppercase:
            chars += string.ascii_uppercase
        return ''.join(random.choice(chars) for _ in range(length))
    
    @staticmethod
    def generate_email() -> str:
        """生成随机邮箱"""
        username = TestDataGenerator.generate_string(8)
        domain = TestDataGenerator.generate_string(6)
        return f"{username}@{domain}.com"
    
    @staticmethod
    def generate_phone() -> str:
        """生成随机手机号"""
        prefix = '1' + random.choice(['3', '4', '5', '6', '7', '8', '9'])
        suffix = ''.join(random.choice('0123456789') for _ in range(9))
        return prefix + suffix
    
    @staticmethod
    def generate_int(min_value: int = 0, max_value: int = 1000) -> int:
        """生成随机整数"""
        return random.randint(min_value, max_value)
    
    @staticmethod
    def generate_float(min_value: float = 0.0, max_value: float = 1000.0) -> float:
        """生成随机浮点数"""
        return random.uniform(min_value, max_value)
    
    @staticmethod
    def generate_dict(keys_count: int = 5) -> Dict[str, Any]:
        """生成随机字典"""
        result = {}
        for i in range(keys_count):
            key = TestDataGenerator.generate_string(8)
            value_type = random.choice(['string', 'int', 'float', 'bool'])
            if value_type == 'string':
                value = TestDataGenerator.generate_string(10)
            elif value_type == 'int':
                value = TestDataGenerator.generate_int()
            elif value_type == 'float':
                value = TestDataGenerator.generate_float()
            else:
                value = random.choice([True, False])
            result[key] = value
        return result
    
    @staticmethod
    def generate_list(item_count: int = 10, item_type: str = 'int') -> List[Any]:
        """生成随机列表"""
        result = []
        for _ in range(item_count):
            if item_type == 'string':
                result.append(TestDataGenerator.generate_string(8))
            elif item_type == 'int':
                result.append(TestDataGenerator.generate_int())
            elif item_type == 'float':
                result.append(TestDataGenerator.generate_float())
            elif item_type == 'dict':
                result.append(TestDataGenerator.generate_dict(3))
            else:
                result.append(random.choice([True, False]))
        return result

class MockTime:
    """模拟时间模块"""
    
    def __init__(self, initial_time: float = 1600000000.0):
        self.current_time = initial_time
    
    def time(self) -> float:
        """模拟time.time()"""
        return self.current_time
    
    def sleep(self, seconds: float):
        """模拟time.sleep()"""
        self.current_time += seconds
    
    def advance(self, seconds: float):
        """前进指定时间"""
        self.current_time += seconds

class TestLogger:
    """测试日志记录器"""
    
    def __init__(self):
        self.logs = {
            'debug': [],
            'info': [],
            'warning': [],
            'error': [],
            'critical': []
        }
    
    def debug(self, message: str, **kwargs):
        """记录调试日志"""
        self.logs['debug'].append((message, kwargs))
    
    def info(self, message: str, **kwargs):
        """记录信息日志"""
        self.logs['info'].append((message, kwargs))
    
    def warning(self, message: str, **kwargs):
        """记录警告日志"""
        self.logs['warning'].append((message, kwargs))
    
    def error(self, message: str, **kwargs):
        """记录错误日志"""
        self.logs['error'].append((message, kwargs))
    
    def critical(self, message: str, **kwargs):
        """记录严重错误日志"""
        self.logs['critical'].append((message, kwargs))
    
    def clear(self):
        """清空所有日志"""
        for level in self.logs:
            self.logs[level] = []
    
    def assert_log_count(self, level: str, count: int):
        """断言指定级别的日志数量"""
        self.assertEqual(len(self.logs[level]), count)
    
    def assert_log_contains(self, level: str, message: str):
        """断言指定级别的日志包含指定消息"""
        for log_message, _ in self.logs[level]:
            if message in log_message:
                return
        assert False, f"Log message '{message}' not found in {level} logs"

class TestTimer:
    """测试计时器"""
    
    def __init__(self):
        self.start_time = 0
        self.end_time = 0
    
    def start(self):
        """开始计时"""
        self.start_time = time.time()
    
    def stop(self):
        """停止计时"""
        self.end_time = time.time()
    
    def get_duration(self) -> float:
        """获取持续时间"""
        if self.end_time == 0:
            return time.time() - self.start_time
        return self.end_time - self.start_time
    
    def assert_duration_less_than(self, max_seconds: float):
        """断言持续时间小于指定值"""
        duration = self.get_duration()
        assert duration < max_seconds, f"Operation took {duration:.4f} seconds, which is more than {max_seconds} seconds"

class DatabaseTestMixin:
    """数据库测试混合类"""
    
    def setup_database(self):
        """设置测试数据库"""
        from .database import DatabaseManager
        # 使用内存数据库进行测试
        db_config = {
            'url': 'sqlite:///:memory:',
            'echo': False,
            'pool_size': 5,
            'max_overflow': 10
        }
        # 初始化数据库连接
        self.db_manager = DatabaseManager(db_config)
        # 创建所有表
        self.db_manager.create_all_tables()
    
    def teardown_database(self):
        """清理测试数据库"""
        if hasattr(self, 'db_manager'):
            # 删除所有表
            self.db_manager.drop_all_tables()
            # 关闭数据库连接
            self.db_manager.close()
    
    def get_db_session(self):
        """获取数据库会话"""
        if hasattr(self, 'db_manager'):
            return self.db_manager.get_session()
        raise TestUtilsError("Database not initialized")

class CacheTestMixin:
    """缓存测试混合类"""
    
    def setup_cache(self):
        """设置测试缓存"""
        from .cache import CacheManager, InMemoryCache
        # 使用内存缓存进行测试
        self.cache = CacheManager(InMemoryCache())
    
    def teardown_cache(self):
        """清理测试缓存"""
        if hasattr(self, 'cache'):
            self.cache.clear_all()
    
    def assert_cache_contains(self, key: str, expected_value: Any):
        """断言缓存包含指定键值对"""
        if hasattr(self, 'cache'):
            value = self.cache.get(key)
            self.assertEqual(value, expected_value)
        else:
            raise TestUtilsError("Cache not initialized")
    
    def assert_cache_not_contains(self, key: str):
        """断言缓存不包含指定键"""
        if hasattr(self, 'cache'):
            value = self.cache.get(key)
            self.assertIsNone(value)
        else:
            raise TestUtilsError("Cache not initialized")

class ApiTestMixin:
    """API测试混合类"""
    
    def setup_api_client(self):
        """设置测试API客户端"""
        from .api_client import APIClient
        self.api_client = APIClient(base_url="http://localhost:8000")
    
    def mock_api_response(self, path: str, response: MockResponse):
        """模拟API响应"""
        # 这里可以根据实际情况实现对API客户端的响应模拟
        pass

class MockDependency:
    """模拟依赖项"""
    
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        # 自动创建mock方法
        for key, value in kwargs.items():
            if callable(value):
                setattr(self, key, MagicMock(side_effect=value))
            else:
                setattr(self, key, value)
    
    def __getattr__(self, name: str):
        """动态创建mock属性"""
        mock = MagicMock()
        setattr(self, name, mock)
        return mock

class TestAssertionHelper:
    """测试断言辅助工具"""
    
    @staticmethod
    def assert_objects_equal(obj1: Any, obj2: Any, ignore_fields: List[str] = None):
        """断言两个对象相等，可忽略指定字段"""
        if ignore_fields is None:
            ignore_fields = []
            
        # 如果是基本类型，直接比较
        if obj1 is None or obj2 is None or isinstance(obj1, (int, float, str, bool)):
            TestAssertionHelper.assert_basic_types_equal(obj1, obj2)
            return
        
        # 如果是列表，逐个比较元素
        if isinstance(obj1, list) and isinstance(obj2, list):
            TestAssertionHelper.assert_lists_equal(obj1, obj2, ignore_fields)
            return
        
        # 如果是字典，比较键值对
        if isinstance(obj1, dict) and isinstance(obj2, dict):
            TestAssertionHelper.assert_dicts_equal(obj1, obj2, ignore_fields)
            return
        
        # 如果是对象，比较属性
        TestAssertionHelper.assert_objects_attributes_equal(obj1, obj2, ignore_fields)
    
    @staticmethod
    def assert_basic_types_equal(val1: Any, val2: Any):
        """断言基本类型相等"""
        assert val1 == val2, f"Values are not equal: {val1} != {val2}"
    
    @staticmethod
    def assert_lists_equal(list1: List[Any], list2: List[Any], ignore_fields: List[str] = None):
        """断言两个列表相等"""
        assert len(list1) == len(list2), f"List lengths are not equal: {len(list1)} != {len(list2)}"
        for i in range(len(list1)):
            try:
                TestAssertionHelper.assert_objects_equal(list1[i], list2[i], ignore_fields)
            except AssertionError as e:
                raise AssertionError(f"List items at index {i} are not equal: {str(e)}")
    
    @staticmethod
    def assert_dicts_equal(dict1: Dict[str, Any], dict2: Dict[str, Any], ignore_fields: List[str] = None):
        """断言两个字典相等"""
        ignore = ignore_fields or []
        
        # 获取需要比较的键
        keys1 = set(k for k in dict1.keys() if k not in ignore)
        keys2 = set(k for k in dict2.keys() if k not in ignore)
        
        assert keys1 == keys2, f"Dict keys are not equal: {keys1} != {keys2}"
        
        for key in keys1:
            try:
                TestAssertionHelper.assert_objects_equal(dict1[key], dict2[key], ignore_fields)
            except AssertionError as e:
                raise AssertionError(f"Dict values for key '{key}' are not equal: {str(e)}")
    
    @staticmethod
    def assert_objects_attributes_equal(obj1: Any, obj2: Any, ignore_fields: List[str] = None):
        """断言两个对象的属性相等"""
        ignore = ignore_fields or []
        
        # 获取对象的属性
        attrs1 = set(attr for attr in dir(obj1) if not attr.startswith('_') and attr not in ignore)
        attrs2 = set(attr for attr in dir(obj2) if not attr.startswith('_') and attr not in ignore)
        
        # 排除方法
        attrs1 = set(attr for attr in attrs1 if not callable(getattr(obj1, attr)))
        attrs2 = set(attr for attr in attrs2 if not callable(getattr(obj2, attr)))
        
        assert attrs1 == attrs2, f"Object attributes are not equal: {attrs1} != {attrs2}"
        
        for attr in attrs1:
            try:
                val1 = getattr(obj1, attr)
                val2 = getattr(obj2, attr)
                TestAssertionHelper.assert_objects_equal(val1, val2, ignore_fields)
            except AssertionError as e:
                raise AssertionError(f"Object attribute '{attr}' values are not equal: {str(e)}")

class TestPerformanceTracker:
    """测试性能跟踪器"""
    
    def __init__(self):
        self.metrics = {}
    
    def start(self, name: str):
        """开始跟踪指定操作"""
        self.metrics[name] = {
            'start_time': time.time(),
            'calls': 1
        }
    
    def stop(self, name: str):
        """停止跟踪指定操作"""
        if name in self.metrics:
            self.metrics[name]['end_time'] = time.time()
            self.metrics[name]['duration'] = self.metrics[name]['end_time'] - self.metrics[name]['start_time']
    
    def increment_call(self, name: str):
        """增加调用次数"""
        if name in self.metrics:
            self.metrics[name]['calls'] += 1
        else:
            self.start(name)
    
    def get_metrics(self, name: str) -> Optional[Dict[str, Any]]:
        """获取指定操作的性能指标"""
        return self.metrics.get(name)
    
    def assert_performance(self, name: str, max_duration: float):
        """断言指定操作的性能"""
        metrics = self.get_metrics(name)
        if not metrics or 'duration' not in metrics:
            raise TestUtilsError(f"Performance metrics for '{name}' not found")
        
        duration = metrics['duration']
        assert duration < max_duration, f"Operation '{name}' took {duration:.4f} seconds, which exceeds the maximum of {max_duration} seconds"

# 导出所有测试工具
__all__ = [
    'TestUtilsError',
    'TestBase',
    'AsyncTestBase',
    'MockResponse',
    'TestClient',
    'TestDataGenerator',
    'MockTime',
    'TestLogger',
    'TestTimer',
    'DatabaseTestMixin',
    'CacheTestMixin',
    'ApiTestMixin',
    'MockDependency',
    'TestAssertionHelper',
    'TestPerformanceTracker'
]