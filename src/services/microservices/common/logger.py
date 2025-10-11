import logging
import json
import os
from datetime import datetime
import uuid
from logging.handlers import RotatingFileHandler
from .config_manager import config_manager

class EnhancedLogger:
    """增强的日志系统类，支持多级别日志、结构化日志和多输出目标"""
    
    def __init__(self, name='LeverageGuard', log_file='app.log'):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(self._get_log_level())
        
        # 避免重复添加处理器
        if not self.logger.handlers:
            self._setup_handlers(log_file)
    
    def _get_log_level(self):
        """根据配置获取日志级别"""
        log_level = config_manager.get('log_level', 'INFO').upper()
        level_map = {
            'DEBUG': logging.DEBUG,
            'INFO': logging.INFO,
            'WARNING': logging.WARNING,
            'WARN': logging.WARNING,
            'ERROR': logging.ERROR,
            'CRITICAL': logging.CRITICAL
        }
        return level_map.get(log_level, logging.INFO)
    
    def _setup_handlers(self, log_file):
        """设置日志处理器"""
        # 创建日志目录
        log_dir = os.path.dirname(os.path.abspath(log_file))
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        # 控制台处理器
        console_handler = logging.StreamHandler()
        console_handler.setLevel(self._get_log_level())
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)
        
        # 文件处理器（带轮转）
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(self._get_log_level())
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(file_formatter)
        self.logger.addHandler(file_handler)
    
    def debug(self, message, **kwargs):
        """记录调试日志"""
        if self.logger.isEnabledFor(logging.DEBUG):
            self.logger.debug(self._format_message(message, **kwargs))
    
    def info(self, message, **kwargs):
        """记录信息日志"""
        if self.logger.isEnabledFor(logging.INFO):
            self.logger.info(self._format_message(message, **kwargs))
    
    def warning(self, message, **kwargs):
        """记录警告日志"""
        if self.logger.isEnabledFor(logging.WARNING):
            self.logger.warning(self._format_message(message, **kwargs))
    
    def error(self, message, **kwargs):
        """记录错误日志"""
        if self.logger.isEnabledFor(logging.ERROR):
            self.logger.error(self._format_message(message, **kwargs))
    
    def critical(self, message, **kwargs):
        """记录严重错误日志"""
        if self.logger.isEnabledFor(logging.CRITICAL):
            self.logger.critical(self._format_message(message, **kwargs))
    
    def _format_message(self, message, **kwargs):
        """格式化日志消息，支持结构化数据"""
        if not kwargs:
            return message
        
        try:
            # 如果是调试模式，使用更易读的格式
            if config_manager.is_debug():
                extra_info = ', '.join([f'{k}={v}' for k, v in kwargs.items()])
                return f"{message} [{extra_info}]"
            else:
                # 生产环境使用JSON格式
                log_data = {'message': message}
                log_data.update(kwargs)
                return json.dumps(log_data)
        except Exception as e:
            # 如果格式化失败，返回原始消息
            self.logger.error(f"Failed to format log message: {str(e)}")
            return message

class AuditLogger:
    """审计日志系统类，记录所有关键操作和系统事件"""
    
    def __init__(self, log_file="audit.log"):
        # 使用单独的日志器
        self.logger = logging.getLogger("AuditLogger")
        self.logger.setLevel(logging.INFO)
        
        # 避免重复添加处理器
        if not self.logger.handlers:
            # 创建日志目录
            log_dir = os.path.dirname(os.path.abspath(log_file))
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
            
            # 设置文件处理器（带轮转）
            handler = RotatingFileHandler(
                log_file,
                maxBytes=100*1024*1024,  # 100MB
                backupCount=10,
                encoding='utf-8'
            )
            # 审计日志使用简单格式，便于后续分析
            formatter = logging.Formatter('%(asctime)s - %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
    
    def log_event(self, event_type, user_id, details=None, metadata=None):
        """记录审计事件
        
        Args:
            event_type: 事件类型
            user_id: 用户ID
            details: 事件详情
            metadata: 元数据
        """
        # 构建审计事件
        event = {
            'event_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'event_type': event_type,
            'user_id': user_id,
            'details': details or {},
            'metadata': metadata or {}
        }
        
        # 记录审计日志
        self.logger.info(json.dumps(event))
    
    def log_api_request(self, user_id, endpoint, method, status_code, duration_ms):
        """记录API请求事件"""
        self.log_event(
            event_type='API_REQUEST',
            user_id=user_id,
            details={
                'endpoint': endpoint,
                'method': method,
                'status_code': status_code,
                'duration_ms': duration_ms
            }
        )
    
    def log_order_verification(self, user_id, order_id, status, result=None):
        """记录订单验证事件"""
        self.log_event(
            event_type='ORDER_VERIFICATION',
            user_id=user_id,
            details={
                'order_id': order_id,
                'status': status,
                'result': result or {}
            }
        )
    
    def log_payout_processing(self, user_id, order_id, status, amount=None, error=None):
        """记录赔付处理事件"""
        details = {
            'order_id': order_id,
            'status': status
        }
        if amount is not None:
            details['amount'] = amount
        if error is not None:
            details['error'] = error
        
        self.log_event(
            event_type='PAYOUT_PROCESSING',
            user_id=user_id,
            details=details
        )

# 全局日志器实例
logger = EnhancedLogger()
audit_logger = AuditLogger()

# 示例使用
if __name__ == '__main__':
    # 常规日志示例
    logger.debug("This is a debug message")
    logger.info("Application started", app_name="LeverageGuard", version="1.0.0")
    logger.warning("Low memory warning", current_memory="80%")
    logger.error("API request failed", endpoint="/api/orders", error_code=500)
    
    # 审计日志示例
    audit_logger.log_event('USER_LOGIN', 'user123', {'ip': '192.168.1.1'})
    audit_logger.log_api_request('user456', '/api/verify', 'POST', 200, 125)
    audit_logger.log_order_verification('user789', 'order123', 'success', {'amount': 1000})
    audit_logger.log_payout_processing('user789', 'order123', 'completed', 800)