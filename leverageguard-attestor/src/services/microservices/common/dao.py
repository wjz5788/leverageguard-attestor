from typing import Any, Dict, Optional, List, Type, TypeVar, Generic, Callable, Union, Tuple
from sqlalchemy import asc, desc, or_, and_, func, text as sql_text
from sqlalchemy.orm import Session, Query
from sqlalchemy.exc import SQLAlchemyError
from .database import BaseModel, DatabaseError, DatabaseOperationError, with_db_session, async_with_db_session
from .logging_system import logger

T = TypeVar('T', bound=BaseModel)

class BaseDAO(Generic[T]):
    """数据访问对象基类"""
    
    def __init__(self, model_class: Type[T]):
        """初始化DAO，传入对应的模型类"""
        self.model_class = model_class
    
    @with_db_session
    def get_by_id(self, id: int, session: Optional[Session] = None) -> Optional[T]:
        """通过ID获取单个对象"""
        try:
            return session.query(self.model_class).filter(
                self.model_class.id == id,
                self.model_class.is_deleted == False
            ).first()
        except SQLAlchemyError as e:
            logger.error(f"Error getting {self.model_class.__name__} by ID: {str(e)}")
            raise DatabaseOperationError(details={"operation": "get_by_id", "error": str(e)})
    
    @with_db_session
    def get_by_ids(self, ids: List[int], session: Optional[Session] = None) -> List[T]:
        """通过ID列表获取多个对象"""
        if not ids:
            return []
        
        try:
            return session.query(self.model_class).filter(
                self.model_class.id.in_(ids),
                self.model_class.is_deleted == False
            ).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting {self.model_class.__name__} by IDs: {str(e)}")
            raise DatabaseOperationError(details={"operation": "get_by_ids", "error": str(e)})
    
    @with_db_session
    def get_all(self, session: Optional[Session] = None) -> List[T]:
        """获取所有对象"""
        try:
            return session.query(self.model_class).filter(
                self.model_class.is_deleted == False
            ).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting all {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "get_all", "error": str(e)})
    
    @with_db_session
    def create(self, data: Dict[str, Any], session: Optional[Session] = None) -> T:
        """创建新对象"""
        try:
            # 创建模型实例
            instance = self.model_class(**data)
            session.add(instance)
            session.flush()
            return instance
        except SQLAlchemyError as e:
            logger.error(f"Error creating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "create", "error": str(e)})
    
    @with_db_session
    def update(self, id: int, data: Dict[str, Any], session: Optional[Session] = None) -> Optional[T]:
        """更新对象"""
        try:
            # 获取对象
            instance = self.get_by_id(id, session=session)
            if not instance:
                return None
            
            # 更新属性
            for key, value in data.items():
                if hasattr(instance, key):
                    setattr(instance, key, value)
            
            session.add(instance)
            session.flush()
            return instance
        except SQLAlchemyError as e:
            logger.error(f"Error updating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "update", "error": str(e)})
    
    @with_db_session
    def delete(self, id: int, soft: bool = True, session: Optional[Session] = None) -> bool:
        """删除对象"""
        try:
            # 获取对象
            instance = self.get_by_id(id, session=session)
            if not instance:
                return False
            
            if soft:
                # 软删除
                instance.is_deleted = True
                session.add(instance)
            else:
                # 硬删除
                session.delete(instance)
            
            session.flush()
            return True
        except SQLAlchemyError as e:
            logger.error(f"Error deleting {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "delete", "error": str(e)})
    
    @with_db_session
    def count(self, filters: Optional[Dict[str, Any]] = None, session: Optional[Session] = None) -> int:
        """获取对象数量"""
        try:
            query = session.query(self.model_class)
            query = query.filter(self.model_class.is_deleted == False)
            
            # 应用过滤条件
            if filters:
                query = self._apply_filters(query, filters)
            
            return query.count()
        except SQLAlchemyError as e:
            logger.error(f"Error counting {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "count", "error": str(e)})
    
    @with_db_session
    def find_one(self, filters: Optional[Dict[str, Any]] = None, session: Optional[Session] = None) -> Optional[T]:
        """根据条件查找单个对象"""
        try:
            query = session.query(self.model_class)
            query = query.filter(self.model_class.is_deleted == False)
            
            # 应用过滤条件
            if filters:
                query = self._apply_filters(query, filters)
            
            return query.first()
        except SQLAlchemyError as e:
            logger.error(f"Error finding {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "find_one", "error": str(e)})
    
    @with_db_session
    def find(self, 
             filters: Optional[Dict[str, Any]] = None, 
             order_by: Optional[List[Tuple[str, str]]] = None, 
             limit: Optional[int] = None, 
             offset: Optional[int] = None, 
             session: Optional[Session] = None) -> List[T]:
        """根据条件查找多个对象"""
        try:
            query = session.query(self.model_class)
            query = query.filter(self.model_class.is_deleted == False)
            
            # 应用过滤条件
            if filters:
                query = self._apply_filters(query, filters)
            
            # 应用排序
            if order_by:
                query = self._apply_order_by(query, order_by)
            
            # 应用分页
            if limit is not None:
                query = query.limit(limit)
            if offset is not None:
                query = query.offset(offset)
            
            return query.all()
        except SQLAlchemyError as e:
            logger.error(f"Error finding {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "find", "error": str(e)})
    
    @with_db_session
    def find_paginated(self, 
                       page: int = 1, 
                       page_size: int = 20, 
                       filters: Optional[Dict[str, Any]] = None, 
                       order_by: Optional[List[Tuple[str, str]]] = None, 
                       session: Optional[Session] = None) -> Dict[str, Any]:
        """分页查询对象"""
        # 验证页码和每页数量
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 20
        
        try:
            # 计算偏移量
            offset = (page - 1) * page_size
            
            # 获取总数量
            total = self.count(filters=filters, session=session)
            
            # 获取分页数据
            items = self.find(
                filters=filters,
                order_by=order_by,
                limit=page_size,
                offset=offset,
                session=session
            )
            
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
        except SQLAlchemyError as e:
            logger.error(f"Error paginating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "find_paginated", "error": str(e)})
    
    @with_db_session
    def bulk_create(self, items: List[Dict[str, Any]], session: Optional[Session] = None) -> List[T]:
        """批量创建对象"""
        if not items:
            return []
        
        try:
            instances = [self.model_class(**item) for item in items]
            session.add_all(instances)
            session.flush()
            return instances
        except SQLAlchemyError as e:
            logger.error(f"Error bulk creating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "bulk_create", "error": str(e)})
    
    @with_db_session
    def bulk_update(self, items: List[Dict[str, Any]], id_field: str = 'id', session: Optional[Session] = None) -> List[T]:
        """批量更新对象"""
        if not items:
            return []
        
        try:
            result = []
            for item in items:
                if id_field not in item:
                    continue
                
                instance = self.get_by_id(item[id_field], session=session)
                if not instance:
                    continue
                
                # 更新属性
                for key, value in item.items():
                    if key != id_field and hasattr(instance, key):
                        setattr(instance, key, value)
                
                session.add(instance)
                result.append(instance)
            
            session.flush()
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error bulk updating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "bulk_update", "error": str(e)})
    
    @with_db_session
    def bulk_delete(self, ids: List[int], soft: bool = True, session: Optional[Session] = None) -> int:
        """批量删除对象"""
        if not ids:
            return 0
        
        try:
            if soft:
                # 批量软删除
                affected = session.query(self.model_class).filter(
                    self.model_class.id.in_(ids),
                    self.model_class.is_deleted == False
                ).update(
                    {self.model_class.is_deleted: True},
                    synchronize_session='fetch'
                )
            else:
                # 批量硬删除
                affected = session.query(self.model_class).filter(
                    self.model_class.id.in_(ids),
                    self.model_class.is_deleted == False
                ).delete(synchronize_session='fetch')
            
            session.flush()
            return affected
        except SQLAlchemyError as e:
            logger.error(f"Error bulk deleting {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "bulk_delete", "error": str(e)})
    
    @with_db_session
    def execute_raw_sql(self, sql: str, params: Optional[Dict[str, Any]] = None, session: Optional[Session] = None) -> List[Dict[str, Any]]:
        """执行原始SQL查询"""
        try:
            result = session.execute(sql_text(sql), params or {})
            
            # 将结果转换为字典列表
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except SQLAlchemyError as e:
            logger.error(f"Error executing raw SQL: {str(e)}")
            raise DatabaseOperationError(details={"operation": "execute_raw_sql", "error": str(e)})
    
    @with_db_session
    def update_many(self, filters: Dict[str, Any], data: Dict[str, Any], session: Optional[Session] = None) -> int:
        """根据条件批量更新对象"""
        if not data:
            return 0
        
        try:
            query = session.query(self.model_class)
            query = query.filter(self.model_class.is_deleted == False)
            
            # 应用过滤条件
            if filters:
                query = self._apply_filters(query, filters)
            
            # 执行更新
            affected = query.update(data, synchronize_session='fetch')
            session.flush()
            return affected
        except SQLAlchemyError as e:
            logger.error(f"Error updating many {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "update_many", "error": str(e)})
    
    def _apply_filters(self, query: Query, filters: Dict[str, Any]) -> Query:
        """应用过滤条件到查询对象"""
        for key, value in filters.items():
            # 处理特殊查询条件
            if key.endswith('__eq'):
                field_name = key[:-4]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) == value)
            elif key.endswith('__ne'):
                field_name = key[:-4]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) != value)
            elif key.endswith('__gt'):
                field_name = key[:-4]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) > value)
            elif key.endswith('__gte'):
                field_name = key[:-5]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) >= value)
            elif key.endswith('__lt'):
                field_name = key[:-4]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) < value)
            elif key.endswith('__lte'):
                field_name = key[:-5]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name) <= value)
            elif key.endswith('__in'):
                field_name = key[:-4]
                if hasattr(self.model_class, field_name) and isinstance(value, list):
                    query = query.filter(getattr(self.model_class, field_name).in_(value))
            elif key.endswith('__not_in'):
                field_name = key[:-8]
                if hasattr(self.model_class, field_name) and isinstance(value, list):
                    query = query.filter(~getattr(self.model_class, field_name).in_(value))
            elif key.endswith('__contains'):
                field_name = key[:-10]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name).contains(value))
            elif key.endswith('__like'):
                field_name = key[:-6]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name).like(value))
            elif key.endswith('__ilike'):
                field_name = key[:-7]
                if hasattr(self.model_class, field_name):
                    query = query.filter(getattr(self.model_class, field_name).ilike(value))
            elif key.endswith('__is_null'):
                field_name = key[:-9]
                if hasattr(self.model_class, field_name):
                    if value:
                        query = query.filter(getattr(self.model_class, field_name) == None)
                    else:
                        query = query.filter(getattr(self.model_class, field_name) != None)
            else:
                # 默认使用等于条件
                if hasattr(self.model_class, key):
                    query = query.filter(getattr(self.model_class, key) == value)
        
        return query
    
    def _apply_order_by(self, query: Query, order_by: List[Tuple[str, str]]) -> Query:
        """应用排序条件到查询对象"""
        for field, direction in order_by:
            if hasattr(self.model_class, field):
                if direction.lower() == 'desc':
                    query = query.order_by(desc(getattr(self.model_class, field)))
                else:
                    query = query.order_by(asc(getattr(self.model_class, field)))
        
        return query

# 异步DAO基类
class AsyncBaseDAO(Generic[T]):
    """异步数据访问对象基类"""
    
    def __init__(self, model_class: Type[T]):
        """初始化DAO，传入对应的模型类"""
        self.model_class = model_class
    
    @async_with_db_session
    async def get_by_id(self, id: int, session: Optional[Session] = None) -> Optional[T]:
        """异步通过ID获取单个对象"""
        try:
            result = await session.execute(
                sql_text(f"SELECT * FROM {self.model_class.__tablename__} WHERE id = :id AND is_deleted = false"),
                {'id': id}
            )
            row = result.fetchone()
            if row:
                # 将查询结果映射到模型实例
                instance = self.model_class(**dict(row))
                return instance
            return None
        except SQLAlchemyError as e:
            logger.error(f"Async error getting {self.model_class.__name__} by ID: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_get_by_id", "error": str(e)})
    
    @async_with_db_session
    async def get_all(self, session: Optional[Session] = None) -> List[T]:
        """异步获取所有对象"""
        try:
            result = await session.execute(
                sql_text(f"SELECT * FROM {self.model_class.__tablename__} WHERE is_deleted = false")
            )
            rows = result.fetchall()
            return [self.model_class(**dict(row)) for row in rows]
        except SQLAlchemyError as e:
            logger.error(f"Async error getting all {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_get_all", "error": str(e)})
    
    @async_with_db_session
    async def create(self, data: Dict[str, Any], session: Optional[Session] = None) -> T:
        """异步创建新对象"""
        try:
            # 创建模型实例
            instance = self.model_class(**data)
            session.add(instance)
            await session.flush()
            return instance
        except SQLAlchemyError as e:
            logger.error(f"Async error creating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_create", "error": str(e)})
    
    @async_with_db_session
    async def update(self, id: int, data: Dict[str, Any], session: Optional[Session] = None) -> Optional[T]:
        """异步更新对象"""
        try:
            # 获取对象
            instance = await self.get_by_id(id, session=session)
            if not instance:
                return None
            
            # 更新属性
            for key, value in data.items():
                if hasattr(instance, key):
                    setattr(instance, key, value)
            
            session.add(instance)
            await session.flush()
            return instance
        except SQLAlchemyError as e:
            logger.error(f"Async error updating {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_update", "error": str(e)})
    
    @async_with_db_session
    async def delete(self, id: int, soft: bool = True, session: Optional[Session] = None) -> bool:
        """异步删除对象"""
        try:
            # 获取对象
            instance = await self.get_by_id(id, session=session)
            if not instance:
                return False
            
            if soft:
                # 软删除
                instance.is_deleted = True
                session.add(instance)
            else:
                # 硬删除
                await session.delete(instance)
            
            await session.flush()
            return True
        except SQLAlchemyError as e:
            logger.error(f"Async error deleting {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_delete", "error": str(e)})
    
    @async_with_db_session
    async def find_one(self, filters: Optional[Dict[str, Any]] = None, session: Optional[Session] = None) -> Optional[T]:
        """异步根据条件查找单个对象"""
        try:
            query = f"SELECT * FROM {self.model_class.__tablename__} WHERE is_deleted = false"
            params = {}
            
            # 构建WHERE子句
            if filters:
                where_clauses = []
                for key, value in filters.items():
                    # 简单处理，实际应用中可能需要更复杂的条件构建
                    where_clauses.append(f"{key} = :{key}")
                    params[key] = value
                
                if where_clauses:
                    query += " AND " + " AND ".join(where_clauses)
            
            # 限制结果数量
            query += " LIMIT 1"
            
            result = await session.execute(sql_text(query), params)
            row = result.fetchone()
            
            if row:
                return self.model_class(**dict(row))
            return None
        except SQLAlchemyError as e:
            logger.error(f"Async error finding {self.model_class.__name__}: {str(e)}")
            raise DatabaseOperationError(details={"operation": "async_find_one", "error": str(e)})

# 导出所有类
__all__ = [
    'BaseDAO',
    'AsyncBaseDAO'
]