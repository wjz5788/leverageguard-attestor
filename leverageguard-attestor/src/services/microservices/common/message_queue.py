import os
import sys
import time
import json
import pika
import threading
import uuid
from typing import Any, Dict, Optional, Callable, List, Union
from functools import wraps

# 导入配置管理器和日志系统
from .config_manager import get_config
from .logging import get_logger

# 默认消息队列配置
DEFAULT_MQ_CONFIG = {
    'host': 'localhost',
    'port': 5672,
    'username': 'guest',
    'password': 'guest',
    'virtual_host': '/',
    'heartbeat': 60,
    'connection_timeout': 30,
    'exchange_type': 'topic',
    'durable': True,
    'auto_delete': False,
    'retry_attempts': 3,
    'retry_delay': 1,
    'prefetch_count': 1,
    'dead_letter_enabled': True,
    'dead_letter_exchange': 'dlx_exchange',
    'dead_letter_queue': 'dlx_queue'
}

class MessageQueueError(Exception):
    """消息队列异常基类"""
    pass

class ConnectionError(MessageQueueError):
    """连接异常"""
    pass

class PublishError(MessageQueueError):
    """发布消息异常"""
    pass

class ConsumeError(MessageQueueError):
    """消费消息异常"""
    pass

class MessageQueueClient:
    """消息队列客户端类，提供与消息队列服务交互的功能"""
    _instance = None
    _lock = threading.RLock()
    _connections = {}
    _initialized = False
    
    def __new__(cls):
        """单例模式实现"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(MessageQueueClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        """初始化消息队列客户端"""
        with self._lock:
            if not MessageQueueClient._initialized:
                # 加载消息队列配置
                self._config = self._load_config()
                # 初始化连接池
                self._connection_pool = {}
                # 初始化消费者线程池
                self._consumer_threads = {}
                # 初始化回调函数映射
                self._callbacks = {}
                # 初始化RPC相关组件
                self._rpc_responses = {}
                self._rpc_locks = {}
                # 设置标志
                MessageQueueClient._initialized = True
                # 获取日志记录器
                self._logger = get_logger('message_queue')
    
    def _load_config(self) -> Dict[str, Any]:
        """加载消息队列配置"""
        config = DEFAULT_MQ_CONFIG.copy()
        
        # 从配置管理器加载配置
        try:
            mq_config = get_config('message_queue', {})
            config.update(mq_config)
        except Exception as e:
            self._logger.error(f"Failed to load message queue config: {str(e)}")
        
        return config
    
    def _get_connection_parameters(self) -> pika.ConnectionParameters:
        """获取连接参数"""
        # 创建凭证
        credentials = pika.PlainCredentials(
            username=self._config['username'],
            password=self._config['password']
        )
        
        # 创建连接参数
        parameters = pika.ConnectionParameters(
            host=self._config['host'],
            port=self._config['port'],
            virtual_host=self._config['virtual_host'],
            credentials=credentials,
            heartbeat=self._config['heartbeat'],
            blocked_connection_timeout=self._config['connection_timeout']
        )
        
        return parameters
    
    def _get_connection(self, connection_name: str = 'default') -> pika.BlockingConnection:
        """获取连接"""
        with self._lock:
            # 检查连接是否已存在且可用
            if connection_name in self._connection_pool:
                connection = self._connection_pool[connection_name]
                if connection.is_open:
                    return connection
                else:
                    # 移除已关闭的连接
                    del self._connection_pool[connection_name]
            
            # 创建新连接
            try:
                parameters = self._get_connection_parameters()
                connection = pika.BlockingConnection(parameters)
                self._connection_pool[connection_name] = connection
                self._logger.info(f"Connected to message queue: {connection_name}")
                return connection
            except Exception as e:
                self._logger.error(f"Failed to connect to message queue: {str(e)}")
                raise ConnectionError(f"Failed to connect to message queue: {str(e)}")
    
    def _get_channel(self, connection_name: str = 'default') -> pika.channel.Channel:
        """获取通道"""
        connection = self._get_connection(connection_name)
        return connection.channel()
    
    def _declare_exchange(self, channel: pika.channel.Channel, exchange_name: str, 
                         exchange_type: Optional[str] = None, durable: Optional[bool] = None) -> None:
        """声明交换机"""
        if exchange_type is None:
            exchange_type = self._config['exchange_type']
        if durable is None:
            durable = self._config['durable']
        
        channel.exchange_declare(
            exchange=exchange_name,
            exchange_type=exchange_type,
            durable=durable,
            auto_delete=self._config['auto_delete']
        )
    
    def _declare_queue(self, channel: pika.channel.Channel, queue_name: str, 
                      durable: Optional[bool] = None, 
                      dead_letter_enabled: Optional[bool] = None) -> None:
        """声明队列"""
        if durable is None:
            durable = self._config['durable']
        if dead_letter_enabled is None:
            dead_letter_enabled = self._config['dead_letter_enabled']
        
        arguments = {}
        # 如果启用了死信队列，添加死信交换机参数
        if dead_letter_enabled:
            arguments['x-dead-letter-exchange'] = self._config['dead_letter_exchange']
        
        channel.queue_declare(
            queue=queue_name,
            durable=durable,
            auto_delete=self._config['auto_delete'],
            arguments=arguments
        )
    
    def _declare_dead_letter_exchange_and_queue(self, channel: pika.channel.Channel) -> None:
        """声明死信交换机和队列"""
        # 声明死信交换机
        self._declare_exchange(channel, self._config['dead_letter_exchange'])
        
        # 声明死信队列
        self._declare_queue(
            channel, 
            self._config['dead_letter_queue'],
            dead_letter_enabled=False  # 死信队列不需要死信功能
        )
        
        # 绑定死信队列到死信交换机
        channel.queue_bind(
            queue=self._config['dead_letter_queue'],
            exchange=self._config['dead_letter_exchange'],
            routing_key='#'  # 接收所有死信消息
        )
    
    def connect(self):
        """连接到RabbitMQ服务器（保持向后兼容性）"""
        try:
            self._get_connection()
            return True
        except Exception:
            return False
    
    def publish_message(self, queue_name, message, exchange='', routing_key=None, durable=True):
        """发布消息到指定队列（保持向后兼容性）"""
        try:
            # 如果未指定路由键，使用队列名称
            if routing_key is None:
                routing_key = queue_name
            
            # 调用新的发布方法
            self._publish_to_queue(queue_name, message, exchange, routing_key, durable)
            return True
        except Exception as e:
            self._logger.error(f"Failed to publish message to queue '{queue_name}': {str(e)}")
            return False
    
    def _publish_to_queue(self, queue_name: str, message: Any, exchange_name: str = '', 
                         routing_key: str = None, durable: bool = True) -> None:
        """发布消息到队列的内部方法"""
        # 创建连接和通道
        connection = self._get_connection()
        channel = connection.channel()
        
        # 声明队列
        self._declare_queue(channel, queue_name, durable=durable)
        
        # 如果指定了交换机，声明并绑定
        if exchange_name:
            self._declare_exchange(channel, exchange_name)
            channel.queue_bind(
                queue=queue_name,
                exchange=exchange_name,
                routing_key=routing_key or queue_name
            )
        
        # 序列化消息
        if not isinstance(message, bytes):
            message_body = json.dumps(message, ensure_ascii=False).encode('utf-8')
        else:
            message_body = message
        
        # 发布消息
        channel.basic_publish(
            exchange=exchange_name,
            routing_key=routing_key or queue_name,
            body=message_body,
            properties=pika.BasicProperties(
                delivery_mode=2,  # 持久化消息
                content_type='application/json'
            )
        )
    
    def consume_message(self, queue_name, callback, auto_ack=False, durable=True):
        """消费指定队列的消息（保持向后兼容性）"""
        try:
            self.consume_messages(queue_name, callback, auto_ack, start_thread=False)
            return True
        except Exception as e:
            self._logger.error(f"Failed to set up consumer for queue '{queue_name}': {str(e)}")
            return False
    
    def consume_messages(self, queue_name: str, callback: Callable, 
                        auto_ack: bool = False, 
                        exchange_name: Optional[str] = None, 
                        routing_key: Optional[str] = None, 
                        start_thread: bool = True) -> Union[threading.Thread, None]:
        """消费队列中的消息"""
        # 创建连接和通道
        connection = self._get_connection()
        channel = connection.channel()
        
        # 声明队列
        self._declare_queue(channel, queue_name)
        
        # 如果指定了交换机，绑定队列到交换机
        if exchange_name and routing_key:
            self._declare_exchange(channel, exchange_name)
            channel.queue_bind(
                queue=queue_name,
                exchange=exchange_name,
                routing_key=routing_key
            )
        
        # 设置预取计数
        channel.basic_qos(prefetch_count=self._config['prefetch_count'])
        
        # 定义消息处理函数包装器
        def message_handler(ch, method, properties, body):
            try:
                # 尝试解析消息体
                try:
                    message = json.loads(body.decode('utf-8'))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    message = body
                
                # 调用回调函数处理消息
                callback(ch, method, properties, message)
                
                # 如果不是自动确认，手动确认消息
                if not auto_ack:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    
            except Exception as e:
                self._logger.error(f"Error processing message from queue {queue_name}: {str(e)}")
                
                # 如果不是自动确认，根据异常情况决定是否重新入队
                if not auto_ack:
                    # 拒绝消息并设置是否重新入队
                    # 注意：如果启用了死信队列，拒绝消息会将消息发送到死信队列
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        
        # 如果需要在新线程中运行消费者
        if start_thread:
            # 定义消费者线程函数
            def consumer_thread_func():
                try:
                    self._logger.info(f"Started consuming messages from queue: {queue_name}")
                    channel.basic_consume(
                        queue=queue_name,
                        on_message_callback=message_handler,
                        auto_ack=auto_ack
                    )
                    channel.start_consuming()
                except Exception as e:
                    self._logger.error(f"Error in consumer thread for queue {queue_name}: {str(e)}")
                    
            # 创建并启动线程
            thread = threading.Thread(target=consumer_thread_func, daemon=True)
            thread.start()
            
            # 保存线程引用
            self._consumer_threads[queue_name] = thread
            
            return thread
        else:
            # 在当前线程中运行消费者（会阻塞当前线程）
            self._logger.info(f"Started consuming messages from queue: {queue_name}")
            channel.basic_consume(
                queue=queue_name,
                on_message_callback=message_handler,
                auto_ack=auto_ack
            )
            channel.start_consuming()
            
            return None
    
    def start_consuming(self):
        """开始消费消息（阻塞调用，保持向后兼容性）"""
        try:
            # 确保有活跃的连接
            self._get_connection()
            # 注意：这个方法在新的实现中没有直接对应，因为每个消费者都有自己的线程
            self._logger.info("Message consumption started")
            return True
        except Exception as e:
            self._logger.error(f"Failed to start consuming: {str(e)}")
            return False
    
    def stop_consuming(self, queue_name: str = None):
        """停止消费消息（保持向后兼容性）"""
        if queue_name:
            with self._lock:
                # 检查是否有对应的消费者线程
                if queue_name in self._consumer_threads:
                    # 获取线程并停止它
                    thread = self._consumer_threads[queue_name]
                    # 注意：这里需要一种方式来优雅地停止消费者线程
                    # 实际实现中，可能需要维护通道引用并调用channel.stop_consuming()
                    self._logger.info(f"Stopped consuming messages from queue: {queue_name}")
                    del self._consumer_threads[queue_name]
                    return True
        return False
    
    def close(self):
        """关闭连接（保持向后兼容性）"""
        self.close_all_connections()
        return True
    
    def create_exchange(self, exchange_name, exchange_type='direct', durable=True):
        """创建交换机（保持向后兼容性）"""
        try:
            self.exchange_declare(exchange_name, exchange_type, durable)
            self._logger.info(f"Exchange '{exchange_name}' created")
            return True
        except Exception as e:
            self._logger.error(f"Failed to create exchange '{exchange_name}': {str(e)}")
            return False
    
    def bind_queue(self, queue_name, exchange_name, routing_key=None):
        """绑定队列到交换机（保持向后兼容性）"""
        try:
            if routing_key is None:
                routing_key = queue_name
            
            self.queue_bind(queue_name, exchange_name, routing_key)
            self._logger.info(f"Queue '{queue_name}' bound to exchange '{exchange_name}' with routing key '{routing_key}'")
            return True
        except Exception as e:
            self._logger.error(f"Failed to bind queue '{queue_name}' to exchange '{exchange_name}': {str(e)}")
            return False
    
    def queue_declare(self, queue_name: str, durable: Optional[bool] = None, 
                     exclusive: bool = False, auto_delete: Optional[bool] = None) -> Dict[str, Any]:
        """声明队列"""
        # 创建连接和通道
        connection = self._get_connection()
        channel = connection.channel()
        
        # 设置参数
        if durable is None:
            durable = self._config['durable']
        if auto_delete is None:
            auto_delete = self._config['auto_delete']
        
        # 声明队列
        result = channel.queue_declare(
            queue=queue_name,
            durable=durable,
            exclusive=exclusive,
            auto_delete=auto_delete
        )
        
        return result.method.__dict__
    
    def exchange_declare(self, exchange_name: str, exchange_type: Optional[str] = None, 
                        durable: Optional[bool] = None, auto_delete: Optional[bool] = None) -> None:
        """声明交换机"""
        # 创建连接和通道
        connection = self._get_connection()
        channel = connection.channel()
        
        # 设置参数
        if exchange_type is None:
            exchange_type = self._config['exchange_type']
        if durable is None:
            durable = self._config['durable']
        if auto_delete is None:
            auto_delete = self._config['auto_delete']
        
        # 声明交换机
        channel.exchange_declare(
            exchange=exchange_name,
            exchange_type=exchange_type,
            durable=durable,
            auto_delete=auto_delete
        )
    
    def queue_bind(self, queue_name: str, exchange_name: str, routing_key: str) -> None:
        """绑定队列到交换机"""
        # 创建连接和通道
        connection = self._get_connection()
        channel = connection.channel()
        
        # 绑定队列到交换机
        channel.queue_bind(
            queue=queue_name,
            exchange=exchange_name,
            routing_key=routing_key
        )
    
    def close_connection(self, connection_name: str = 'default') -> None:
        """关闭连接"""
        with self._lock:
            if connection_name in self._connection_pool:
                try:
                    connection = self._connection_pool[connection_name]
                    if connection.is_open:
                        connection.close()
                    del self._connection_pool[connection_name]
                    self._logger.info(f"Closed connection: {connection_name}")
                except Exception as e:
                    self._logger.error(f"Failed to close connection {connection_name}: {str(e)}")
    
    def close_all_connections(self) -> None:
        """关闭所有连接"""
        with self._lock:
            # 停止所有消费者线程
            for queue_name in list(self._consumer_threads.keys()):
                self.stop_consuming(queue_name)
            
            # 关闭所有连接
            for connection_name in list(self._connection_pool.keys()):
                self.close_connection(connection_name)

# 常用队列名称常量
QUEUE_VERIFICATION_REQUESTS = 'verification_requests'
QUEUE_VERIFICATION_RESULTS = 'verification_results'
QUEUE_PAYOUT_REQUESTS = 'payout_requests'
QUEUE_PAYOUT_RESULTS = 'payout_results'
QUEUE_REPORT_REQUESTS = 'report_requests'
QUEUE_FUND_EVENTS = 'fund_events'

# 全局消息队列客户端实例
mq_client = MessageQueueClient()

# 示例使用
if __name__ == '__main__':
    # 初始化消息队列客户端
    client = MessageQueueClient()
    
    # 发布消息示例
    def publish_example():
        message = {
            'order_id': 'order123',
            'user_address': '0x1234567890abcdef',
            'amount': 1000,
            'timestamp': int(time.time())
        }
        success = client.publish_message(QUEUE_VERIFICATION_REQUESTS, message)
        if success:
            print(f"Message published: {message}")
    
    # 消费消息示例
    def on_message_received(ch, method, properties, body):
        try:
            print(f"Received message: {body}")
            # 处理消息...
            
            # 手动确认消息
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as e:
            print(f"Error processing message: {str(e)}")
            # 拒绝消息并重新入队
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    # 发布消息
    publish_example()
    
    # 设置消费者
    client.consume_message(QUEUE_VERIFICATION_RESULTS, on_message_received, auto_ack=False)
    
    # 开始消费（注意：这是一个阻塞调用）
    # client.start_consuming()
    
    # 关闭连接
    client.close()