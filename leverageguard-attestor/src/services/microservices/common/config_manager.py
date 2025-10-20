import os
import json
import yaml
import configparser
import threading
import copy
from typing import Any, Dict, Optional, List, Union
import logging
from dotenv import load_dotenv

# 创建日志记录器
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class ConfigManager:
    """配置管理器类，用于加载、存储和访问配置项"""
    _instance = None
    _lock = threading.RLock()
    
    def __new__(cls):
        """单例模式实现"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ConfigManager, cls).__new__(cls)
                cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """初始化配置管理器"""
        self._config = {}
        self._env_prefix = "LEVERAGEGUARD_"
        self._default_config_paths = [
            "/etc/leveragedguard/config.yml",
            "/etc/leveragedguard/config.json",
            "./config.yml",
            "./config.json",
            "./.env"
        ]
        self._initialized = False
        self._load_dotenv()
        
    def _load_dotenv(self):
        """加载.env文件"""
        try:
            load_dotenv()
        except Exception as e:
            logger.warning(f"Failed to load .env file: {str(e)}")
    
    def initialize(self, config_paths: Optional[List[str]] = None, env_prefix: Optional[str] = None):
        """初始化配置管理器，加载配置文件"""
        with self._lock:
            if self._initialized:
                logger.warning("ConfigManager is already initialized")
                return
            
            # 设置环境变量前缀
            if env_prefix:
                self._env_prefix = env_prefix
            
            # 合并配置文件路径
            paths_to_load = []
            if config_paths:
                paths_to_load.extend(config_paths)
            paths_to_load.extend(self._default_config_paths)
            
            # 加载配置文件
            for path in paths_to_load:
                if os.path.exists(path):
                    try:
                        self._load_config_file(path)
                        logger.info(f"Loaded configuration from {path}")
                    except Exception as e:
                        logger.error(f"Failed to load configuration from {path}: {str(e)}")
            
            # 加载环境变量配置
            self._load_env_config()
            
            # 设置初始化标志
            self._initialized = True
            logger.info("ConfigManager initialized successfully")
    
    def _load_config_file(self, file_path: str):
        """加载配置文件"""
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext == '.yml' or file_ext == '.yaml':
            with open(file_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
                if config:
                    self._merge_config(config)
        elif file_ext == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                if config:
                    self._merge_config(config)
        elif file_ext == '.env':
            # 简单解析.env文件
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if '=' in line:
                            key, value = line.split('=', 1)
                            key = key.strip()
                            value = value.strip()
                            # 移除引号
                            if (value.startswith('"') and value.endswith('"')) or \
                               (value.startswith('\'') and value.endswith('\'')):
                                value = value[1:-1]
                            # 转换为适当的类型
                            value = self._convert_env_value(value)
                            # 转换为嵌套配置
                            self._set_nested_config(key, value)
        elif file_ext == '.ini':
            # 解析.ini文件
            config = configparser.ConfigParser()
            config.read(file_path)
            # 转换为嵌套字典
            config_dict = {}
            for section in config.sections():
                config_dict[section] = dict(config[section])
                for key, value in config_dict[section].items():
                    config_dict[section][key] = self._convert_env_value(value)
            if config_dict:
                self._merge_config(config_dict)
    
    def _load_env_config(self):
        """从环境变量加载配置"""
        # 加载通用配置
        for key in ['DEBUG', 'LOG_LEVEL', 'ENVIRONMENT']:
            if key in os.environ:
                value = os.environ[key]
                # 处理布尔值
                if value.lower() == 'true':
                    self._set_nested_config(key.lower(), True)
                elif value.lower() == 'false':
                    self._set_nested_config(key.lower(), False)
                else:
                    self._set_nested_config(key.lower(), value)
        
        # 加载所有带有前缀的环境变量
        for key, value in os.environ.items():
            if key.startswith(self._env_prefix):
                # 移除前缀并转换为小写
                config_key = key[len(self._env_prefix):].lower()
                # 转换为嵌套配置键（用下划线分隔）
                config_key = config_key.replace('_', '.')
                # 转换值类型
                value = self._convert_env_value(value)
                # 设置嵌套配置
                self._set_nested_config(config_key, value)
    
    def _convert_env_value(self, value: str) -> Any:
        """将环境变量值转换为适当的类型"""
        # 尝试转换为布尔值
        if value.lower() == 'true':
            return True
        if value.lower() == 'false':
            return False
        # 尝试转换为整数
        try:
            return int(value)
        except ValueError:
            pass
        # 尝试转换为浮点数
        try:
            return float(value)
        except ValueError:
            pass
        # 尝试转换为空值
        if value.lower() == 'none':
            return None
        # 尝试转换为列表或字典
        if value.startswith('[') and value.endswith(']') or \
           value.startswith('{') and value.endswith('}'):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass
        # 默认返回字符串
        return value
    
    def _merge_config(self, new_config: Dict[str, Any]):
        """合并新配置到当前配置"""
        self._config = self._deep_merge(self._config, new_config)
    
    def _deep_merge(self, base: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
        """深度合并两个字典"""
        result = copy.deepcopy(base)
        
        for key, value in update.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                # 如果两边都是字典，递归合并
                result[key] = self._deep_merge(result[key], value)
            else:
                # 否则直接覆盖
                result[key] = copy.deepcopy(value)
        
        return result
    
    def _set_nested_config(self, key_path: str, value: Any):
        """设置嵌套配置项"""
        keys = key_path.split('.')
        config = self._config
        
        # 遍历除最后一个键以外的所有键
        for key in keys[:-1]:
            if key not in config or not isinstance(config[key], dict):
                config[key] = {}
            config = config[key]
        
        # 设置最后一个键的值
        config[keys[-1]] = value
    
    def _get_nested_config(self, key_path: str) -> Any:
        """获取嵌套配置项"""
        keys = key_path.split('.')
        config = self._config
        
        for key in keys:
            if isinstance(config, dict) and key in config:
                config = config[key]
            else:
                return None
        
        return config
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置项的值，如果不存在则返回默认值"""
        # 确保配置管理器已初始化
        if not self._initialized:
            self.initialize()
        
        value = self._get_nested_config(key)
        return value if value is not None else default
    
    def set(self, key: str, value: Any):
        """设置配置项的值"""
        # 确保配置管理器已初始化
        if not self._initialized:
            self.initialize()
        
        with self._lock:
            self._set_nested_config(key, value)
    
    def has(self, key: str) -> bool:
        """检查配置项是否存在"""
        # 确保配置管理器已初始化
        if not self._initialized:
            self.initialize()
        
        value = self._get_nested_config(key)
        return value is not None
    
    def remove(self, key: str):
        """删除配置项"""
        # 确保配置管理器已初始化
        if not self._initialized:
            self.initialize()
        
        with self._lock:
            keys = key.split('.')
            config = self._config
            
            # 遍历除最后一个键以外的所有键
            for k in keys[:-1]:
                if isinstance(config, dict) and k in config and isinstance(config[k], dict):
                    config = config[k]
                else:
                    # 路径不存在
                    return
            
            # 删除最后一个键
            if isinstance(config, dict) and keys[-1] in config:
                del config[keys[-1]]
    
    def get_all(self) -> Dict[str, Any]:
        """获取所有配置"""
        # 确保配置管理器已初始化
        if not self._initialized:
            self.initialize()
        
        return copy.deepcopy(self._config)
    
    def is_debug(self) -> bool:
        """检查是否处于调试模式"""
        return self.get('debug', False) or self.get('environment', '') == 'development'
    
    def get_environment(self) -> str:
        """获取当前环境"""
        return self.get('environment', 'production')
    
    def reset(self):
        """重置配置管理器"""
        with self._lock:
            self._config = {}
            self._initialized = False
            logger.info("ConfigManager reset")

# 全局配置管理器实例
config_manager = ConfigManager()

# 工具函数：获取配置
def get_config(key: str, default: Any = None) -> Any:
    """获取配置项的值"""
    return config_manager.get(key, default)

# 工具函数：设置配置
def set_config(key: str, value: Any):
    """设置配置项的值"""
    config_manager.set(key, value)

# 工具函数：检查配置是否存在
def has_config(key: str) -> bool:
    """检查配置项是否存在"""
    return config_manager.has(key)

# 工具函数：获取所有配置
def get_all_config() -> Dict[str, Any]:
    """获取所有配置"""
    return config_manager.get_all()

# 工具函数：检查是否处于调试模式
def is_debug_mode() -> bool:
    """检查是否处于调试模式"""
    return config_manager.is_debug()

# 工具函数：获取当前环境
def get_current_environment() -> str:
    """获取当前环境"""
    return config_manager.get_environment()

# 确保配置管理器已初始化
def ensure_config_initialized(config_paths: Optional[List[str]] = None, env_prefix: Optional[str] = None):
    """确保配置管理器已初始化"""
    if not config_manager._initialized:
        config_manager.initialize(config_paths=config_paths, env_prefix=env_prefix)

# 导出配置管理器实例和工具函数
__all__ = [
    'config_manager',
    'get_config',
    'set_config',
    'has_config',
    'get_all_config',
    'is_debug_mode',
    'get_current_environment',
    'ensure_config_initialized'
]

# 示例使用
if __name__ == '__main__':
    # 初始化配置管理器
    ensure_config_initialized()
    
    # 获取配置
    debug_mode = get_config('debug')
    mongo_uri = get_config('database.mongo_uri')
    
    print(f"Debug mode: {debug_mode}")
    print(f"Mongo URI: {mongo_uri}")
    
    # 设置配置
    set_config('api.version', '1.0.0')
    print(f"API version: {get_config('api.version')}")