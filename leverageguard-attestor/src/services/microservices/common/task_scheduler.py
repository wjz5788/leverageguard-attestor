import asyncio
import time
import uuid
import threading
from typing import Any, Dict, Optional, Callable, List, Tuple, Union
from enum import Enum
from datetime import datetime, timedelta
from functools import wraps
from .errors import BaseError
from .logging_system import logger
from .config_manager import get_config

class TaskSchedulerError(BaseError):
    """任务调度器异常基类"""
    
    def __init__(
        self,
        message: str = "Task scheduler error",
        error_code: str = "TASK_SCHEDULER_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class TaskExecutionError(TaskSchedulerError):
    """任务执行异常"""
    
    def __init__(
        self,
        message: str = "Task execution failed",
        error_code: str = "TASK_EXECUTION_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class TaskNotFoundError(TaskSchedulerError):
    """任务未找到异常"""
    
    def __init__(
        self,
        message: str = "Task not found",
        error_code: str = "TASK_NOT_FOUND_ERROR",
        **kwargs
    ):
        super().__init__(message, error_code, **kwargs)

class TaskStatus(str, Enum):
    """任务状态枚举"""
    PENDING = "pending"        # 等待执行
    RUNNING = "running"        # 执行中
    COMPLETED = "completed"    # 执行完成
    FAILED = "failed"          # 执行失败
    CANCELLED = "cancelled"    # 已取消

class TaskPriority(int, Enum):
    """任务优先级枚举"""
    LOW = 1
    MEDIUM = 5
    HIGH = 10

class Task:
    """任务类"""
    
    def __init__(
        self,
        task_id: Optional[str] = None,
        func: Optional[Callable] = None,
        args: tuple = (),
        kwargs: Optional[Dict[str, Any]] = None,
        priority: int = TaskPriority.MEDIUM,
        scheduled_time: Optional[datetime] = None,
        max_retries: int = 3,
        retry_delay: int = 5,
        is_async: bool = False,
        description: Optional[str] = None
    ):
        """初始化任务"""
        self.task_id = task_id or str(uuid.uuid4())
        self.func = func
        self.args = args
        self.kwargs = kwargs or {}
        self.priority = priority
        self.scheduled_time = scheduled_time or datetime.now()
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.is_async = is_async
        self.description = description
        
        # 任务状态
        self.status = TaskStatus.PENDING
        self.created_at = datetime.now()
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.result: Optional[Any] = None
        self.error: Optional[Exception] = None
        self.retries = 0
        self.lock = threading.RLock()
    
    def to_dict(self) -> Dict[str, Any]:
        """将任务转换为字典格式"""
        with self.lock:
            return {
                'task_id': self.task_id,
                'status': self.status,
                'description': self.description,
                'priority': self.priority,
                'scheduled_time': self.scheduled_time.isoformat() if self.scheduled_time else None,
                'created_at': self.created_at.isoformat(),
                'start_time': self.start_time.isoformat() if self.start_time else None,
                'end_time': self.end_time.isoformat() if self.end_time else None,
                'retries': self.retries,
                'max_retries': self.max_retries,
                'is_async': self.is_async
            }

class TaskScheduler:
    """任务调度器"""
    
    _instance = None
    _lock = threading.RLock()
    
    def __new__(cls):
        """单例模式实现"""
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(TaskScheduler, cls).__new__(cls)
                cls._instance._initialize()
            return cls._instance
    
    def _initialize(self):
        """初始化任务调度器"""
        # 任务存储
        self._pending_tasks = []  # 待执行任务
        self._running_tasks = {}  # 正在执行的任务
        self._completed_tasks = {}  # 已完成的任务
        self._failed_tasks = {}  # 失败的任务
        
        # 锁和控制变量
        self._task_lock = threading.RLock()
        self._stop_event = threading.Event()
        self._scheduler_thread = None
        self._async_loop = None
        self._async_thread = None
        
        # 加载配置
        self._config = self._load_config()
        
        # 启动调度器
        self.start()
    
    def _load_config(self) -> Dict[str, Any]:
        """加载任务调度器配置"""
        config = get_config("task_scheduler", {})
        
        return {
            "check_interval": config.get("check_interval", 1),  # 任务检查间隔（秒）
            "max_pending_tasks": config.get("max_pending_tasks", 1000),  # 最大待执行任务数
            "max_running_tasks": config.get("max_running_tasks", 10),  # 最大并发执行任务数
            "task_history_size": config.get("task_history_size", 1000)  # 历史任务记录数
        }
    
    def start(self) -> None:
        """启动任务调度器"""
        with self._lock:
            if self._scheduler_thread and self._scheduler_thread.is_alive():
                logger.warning("Task scheduler is already running")
                return
            
            # 清除停止标志
            self._stop_event.clear()
            
            # 启动调度线程
            self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
            self._scheduler_thread.start()
            
            # 初始化异步事件循环
            if not self._async_loop or self._async_loop.is_closed():
                self._async_loop = asyncio.new_event_loop()
                self._async_thread = threading.Thread(target=self._async_loop_runner, daemon=True)
                self._async_thread.start()
            
            logger.info("Task scheduler started successfully")
    
    def stop(self) -> None:
        """停止任务调度器"""
        with self._lock:
            if not self._scheduler_thread or not self._scheduler_thread.is_alive():
                logger.warning("Task scheduler is not running")
                return
            
            # 设置停止标志
            self._stop_event.set()
            
            # 等待调度线程结束
            if self._scheduler_thread and self._scheduler_thread.is_alive():
                self._scheduler_thread.join(timeout=5)
            
            # 关闭异步事件循环
            if self._async_loop and not self._async_loop.is_closed():
                self._async_loop.call_soon_threadsafe(self._async_loop.stop)
                if self._async_thread and self._async_thread.is_alive():
                    self._async_thread.join(timeout=5)
            
            logger.info("Task scheduler stopped")
    
    def _scheduler_loop(self) -> None:
        """调度器主循环"""
        while not self._stop_event.is_set():
            try:
                # 检查并执行到期任务
                self._process_pending_tasks()
                
                # 清理历史任务
                self._cleanup_history_tasks()
                
                # 休眠一段时间
                time.sleep(self._config["check_interval"])
            except Exception as e:
                logger.error(f"Error in scheduler loop: {str(e)}")
    
    def _async_loop_runner(self) -> None:
        """异步事件循环运行器"""
        asyncio.set_event_loop(self._async_loop)
        try:
            self._async_loop.run_forever()
        except Exception as e:
            logger.error(f"Error in async loop: {str(e)}")
        finally:
            self._async_loop.close()
    
    def _process_pending_tasks(self) -> None:
        """处理待执行任务"""
        with self._task_lock:
            # 获取当前时间
            now = datetime.now()
            
            # 筛选出已到执行时间且可以运行的任务
            available_slots = self._config["max_running_tasks"] - len(self._running_tasks)
            
            if available_slots <= 0:
                return
            
            # 按优先级和调度时间排序任务
            eligible_tasks = [
                task for task in self._pending_tasks 
                if task.scheduled_time <= now and task.status == TaskStatus.PENDING
            ]
            
            eligible_tasks.sort(key=lambda t: (t.priority, t.scheduled_time), reverse=True)
            
            # 执行符合条件的任务
            for task in eligible_tasks[:available_slots]:
                self._run_task(task)
    
    def _run_task(self, task: Task) -> None:
        """执行任务"""
        if task.is_async:
            # 异步任务提交到异步事件循环
            if self._async_loop and not self._async_loop.is_closed():
                asyncio.run_coroutine_threadsafe(self._run_async_task(task), self._async_loop)
        else:
            # 同步任务在单独的线程中执行
            thread = threading.Thread(target=self._run_sync_task, args=(task,), daemon=True)
            thread.start()
    
    def _run_sync_task(self, task: Task) -> None:
        """执行同步任务"""
        with self._task_lock:
            # 更新任务状态
            task.status = TaskStatus.RUNNING
            task.start_time = datetime.now()
            self._pending_tasks.remove(task)
            self._running_tasks[task.task_id] = task
        
        try:
            # 执行任务函数
            result = task.func(*task.args, **task.kwargs)
            
            with self._task_lock:
                # 更新任务状态为完成
                task.status = TaskStatus.COMPLETED
                task.result = result
                task.end_time = datetime.now()
                self._running_tasks.pop(task.task_id, None)
                self._completed_tasks[task.task_id] = task
                
            logger.debug(f"Task {task.task_id} completed successfully")
        except Exception as e:
            with self._task_lock:
                task.retries += 1
                
                # 判断是否需要重试
                if task.retries <= task.max_retries:
                    # 计算下次重试时间
                    retry_time = datetime.now() + timedelta(seconds=task.retry_delay * (2 ** (task.retries - 1)))
                    task.scheduled_time = retry_time
                    task.status = TaskStatus.PENDING
                    task.error = e
                    
                    # 重新加入待执行任务列表
                    self._running_tasks.pop(task.task_id, None)
                    self._pending_tasks.append(task)
                    
                    logger.warning(f"Task {task.task_id} failed, will retry ({task.retries}/{task.max_retries}) at {retry_time}")
                else:
                    # 任务失败，不再重试
                    task.status = TaskStatus.FAILED
                    task.error = e
                    task.end_time = datetime.now()
                    self._running_tasks.pop(task.task_id, None)
                    self._failed_tasks[task.task_id] = task
                    
                    logger.error(f"Task {task.task_id} failed after {task.max_retries} retries: {str(e)}")
    
    async def _run_async_task(self, task: Task) -> None:
        """执行异步任务"""
        with self._task_lock:
            # 更新任务状态
            task.status = TaskStatus.RUNNING
            task.start_time = datetime.now()
            self._pending_tasks.remove(task)
            self._running_tasks[task.task_id] = task
        
        try:
            # 执行异步任务函数
            result = await task.func(*task.args, **task.kwargs)
            
            with self._task_lock:
                # 更新任务状态为完成
                task.status = TaskStatus.COMPLETED
                task.result = result
                task.end_time = datetime.now()
                self._running_tasks.pop(task.task_id, None)
                self._completed_tasks[task.task_id] = task
                
            logger.debug(f"Async task {task.task_id} completed successfully")
        except Exception as e:
            with self._task_lock:
                task.retries += 1
                
                # 判断是否需要重试
                if task.retries <= task.max_retries:
                    # 计算下次重试时间
                    retry_time = datetime.now() + timedelta(seconds=task.retry_delay * (2 ** (task.retries - 1)))
                    task.scheduled_time = retry_time
                    task.status = TaskStatus.PENDING
                    task.error = e
                    
                    # 重新加入待执行任务列表
                    self._running_tasks.pop(task.task_id, None)
                    self._pending_tasks.append(task)
                    
                    logger.warning(f"Async task {task.task_id} failed, will retry ({task.retries}/{task.max_retries}) at {retry_time}")
                else:
                    # 任务失败，不再重试
                    task.status = TaskStatus.FAILED
                    task.error = e
                    task.end_time = datetime.now()
                    self._running_tasks.pop(task.task_id, None)
                    self._failed_tasks[task.task_id] = task
                    
                    logger.error(f"Async task {task.task_id} failed after {task.max_retries} retries: {str(e)}")
    
    def _cleanup_history_tasks(self) -> None:
        """清理历史任务"""
        with self._task_lock:
            # 清理已完成任务
            if len(self._completed_tasks) > self._config["task_history_size"]:
                # 按完成时间排序，保留最近的任务
                sorted_tasks = sorted(
                    self._completed_tasks.items(), 
                    key=lambda x: x[1].end_time or datetime.min, 
                    reverse=True
                )
                
                # 删除超出限制的任务
                to_remove = sorted_tasks[self._config["task_history_size"]:]
                for task_id, _ in to_remove:
                    self._completed_tasks.pop(task_id, None)
            
            # 清理失败任务
            if len(self._failed_tasks) > self._config["task_history_size"]:
                # 按完成时间排序，保留最近的任务
                sorted_tasks = sorted(
                    self._failed_tasks.items(), 
                    key=lambda x: x[1].end_time or datetime.min, 
                    reverse=True
                )
                
                # 删除超出限制的任务
                to_remove = sorted_tasks[self._config["task_history_size"]:]
                for task_id, _ in to_remove:
                    self._failed_tasks.pop(task_id, None)
    
    def schedule_task(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: Optional[Dict[str, Any]] = None,
        priority: int = TaskPriority.MEDIUM,
        scheduled_time: Optional[Union[datetime, int, float]] = None,
        max_retries: int = 3,
        retry_delay: int = 5,
        is_async: bool = False,
        description: Optional[str] = None
    ) -> str:
        """调度任务"""
        # 检查待执行任务数量
        with self._task_lock:
            if len(self._pending_tasks) >= self._config["max_pending_tasks"]:
                raise TaskSchedulerError("Maximum number of pending tasks reached")
            
            # 处理调度时间
            if scheduled_time is None:
                task_scheduled_time = datetime.now()
            elif isinstance(scheduled_time, (int, float)):
                # 秒数或时间戳
                if scheduled_time < 365 * 24 * 3600:  # 小于一年的秒数，视为延迟执行
                    task_scheduled_time = datetime.now() + timedelta(seconds=scheduled_time)
                else:  # 否则视为时间戳
                    task_scheduled_time = datetime.fromtimestamp(scheduled_time)
            else:
                task_scheduled_time = scheduled_time
            
            # 创建任务
            task = Task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                scheduled_time=task_scheduled_time,
                max_retries=max_retries,
                retry_delay=retry_delay,
                is_async=is_async,
                description=description
            )
            
            # 添加到待执行任务列表
            self._pending_tasks.append(task)
            
            logger.debug(f"Task {task.task_id} scheduled for {task_scheduled_time}")
            
            return task.task_id
    
    def schedule_async_task(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: Optional[Dict[str, Any]] = None,
        priority: int = TaskPriority.MEDIUM,
        scheduled_time: Optional[Union[datetime, int, float]] = None,
        max_retries: int = 3,
        retry_delay: int = 5,
        description: Optional[str] = None
    ) -> str:
        """调度异步任务"""
        return self.schedule_task(
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            scheduled_time=scheduled_time,
            max_retries=max_retries,
            retry_delay=retry_delay,
            is_async=True,
            description=description
        )
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """获取任务状态"""
        with self._task_lock:
            # 检查所有任务集合
            if task_id in self._running_tasks:
                task = self._running_tasks[task_id]
            elif task_id in self._completed_tasks:
                task = self._completed_tasks[task_id]
            elif task_id in self._failed_tasks:
                task = self._failed_tasks[task_id]
            else:
                # 在待执行任务中查找
                task = next((t for t in self._pending_tasks if t.task_id == task_id), None)
            
            if not task:
                raise TaskNotFoundError(f"Task with ID {task_id} not found")
            
            # 构建状态信息
            status_info = task.to_dict()
            
            # 添加结果或错误信息
            if task.result is not None:
                status_info['result'] = task.result
            if task.error is not None:
                status_info['error'] = str(task.error)
            
            return status_info
    
    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        with self._task_lock:
            # 查找待执行任务
            task_index = next((i for i, t in enumerate(self._pending_tasks) if t.task_id == task_id), None)
            
            if task_index is not None:
                task = self._pending_tasks.pop(task_index)
                task.status = TaskStatus.CANCELLED
                task.end_time = datetime.now()
                
                # 添加到已取消任务记录
                self._completed_tasks[task_id] = task
                
                logger.debug(f"Task {task_id} cancelled")
                return True
            
            # 检查运行中任务（无法直接取消）
            if task_id in self._running_tasks:
                logger.warning(f"Cannot cancel running task {task_id}")
                return False
            
            # 任务不存在或已完成/失败
            logger.warning(f"Task {task_id} not found or already completed/failed")
            return False
    
    def get_pending_tasks(self) -> List[Dict[str, Any]]:
        """获取待执行任务列表"""
        with self._task_lock:
            return [task.to_dict() for task in self._pending_tasks]
    
    def get_running_tasks(self) -> List[Dict[str, Any]]:
        """获取运行中任务列表"""
        with self._task_lock:
            return [task.to_dict() for task in self._running_tasks.values()]
    
    def get_completed_tasks(self) -> List[Dict[str, Any]]:
        """获取已完成任务列表"""
        with self._task_lock:
            return [task.to_dict() for task in self._completed_tasks.values()]
    
    def get_failed_tasks(self) -> List[Dict[str, Any]]:
        """获取失败任务列表"""
        with self._task_lock:
            return [task.to_dict() for task in self._failed_tasks.values()]
    
    def clear_tasks(self, status: Optional[TaskStatus] = None) -> None:
        """清理任务"""
        with self._task_lock:
            if status is None:
                # 清理所有任务
                self._pending_tasks.clear()
                self._completed_tasks.clear()
                self._failed_tasks.clear()
                # 不清理运行中的任务
            elif status == TaskStatus.PENDING:
                # 清理待执行任务
                self._pending_tasks.clear()
            elif status == TaskStatus.COMPLETED:
                # 清理已完成任务
                self._completed_tasks.clear()
            elif status == TaskStatus.FAILED:
                # 清理失败任务
                self._failed_tasks.clear()
            
            logger.debug(f"Cleared tasks with status: {status or 'all'}")

# 装饰器：将函数转换为任务
def task(
    priority: int = TaskPriority.MEDIUM,
    max_retries: int = 3,
    retry_delay: int = 5
):
    """将函数转换为可调度任务的装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 获取任务调度器实例
            scheduler = task_scheduler
            
            # 检查是否为异步函数
            is_async = asyncio.iscoroutinefunction(func)
            
            # 调度任务
            task_id = scheduler.schedule_task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                max_retries=max_retries,
                retry_delay=retry_delay,
                is_async=is_async,
                description=f"Task for {func.__name__}"
            )
            
            return task_id
        
        return wrapper
    
    return decorator

# 装饰器：将异步函数转换为任务
def async_task(
    priority: int = TaskPriority.MEDIUM,
    max_retries: int = 3,
    retry_delay: int = 5
):
    """将异步函数转换为可调度任务的装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 获取任务调度器实例
            scheduler = task_scheduler
            
            # 调度异步任务
            task_id = scheduler.schedule_async_task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                max_retries=max_retries,
                retry_delay=retry_delay,
                description=f"Async task for {func.__name__}"
            )
            
            return task_id
        
        return wrapper
    
    return decorator

# 全局任务调度器实例
task_scheduler = TaskScheduler()

# 导出所有类和函数
__all__ = [
    'TaskSchedulerError',
    'TaskExecutionError',
    'TaskNotFoundError',
    'TaskStatus',
    'TaskPriority',
    'Task',
    'TaskScheduler',
    'task_scheduler',
    'task',
    'async_task'
]