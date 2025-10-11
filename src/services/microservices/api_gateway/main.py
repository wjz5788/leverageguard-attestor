from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import httpx
import time
import asyncio
from functools import wraps

# 导入共享组件
from ..common.logger import logger, audit_logger
from ..common.config_manager import config_manager
from ..common.message_queue import mq_client, QUEUE_VERIFICATION_REQUESTS, QUEUE_PAYOUT_REQUESTS

# 初始化FastAPI应用
app = FastAPI(
    title="LeverageGuard API Gateway",
    description="API Gateway for LeverageGuard Microservices",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 服务配置 - 微服务的基础URL
SERVICES = {
    'order_verification': config_manager.get('services.order_verification.url', 'http://order_verification:8001'),
    'payout_processing': config_manager.get('services.payout_processing.url', 'http://payout_processing:8002'),
    'fund_management': config_manager.get('services.fund_management.url', 'http://fund_management:8003'),
    'report_generation': config_manager.get('services.report_generation.url', 'http://report_generation:8004'),
}

# HTTP客户端配置
HTTP_CLIENT_TIMEOUT = 30.0  # 30秒超时
HTTP_CLIENT_MAX_RETRIES = 3  # 最多重试3次

# 创建HTTP客户端（带连接池）
http_client = httpx.AsyncClient(
    timeout=HTTP_CLIENT_TIMEOUT,
    follow_redirects=True
)

# 安全认证
security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """验证访问令牌"""
    token = credentials.credentials
    
    # 简化的令牌验证逻辑，实际应用中应连接到认证服务
    # 例如，验证JWT令牌或查询认证服务
    if not token or token != "valid-token":  # 示例验证
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing authentication token"
        )
    
    # 返回用户信息
    return {"user_id": "user-123", "roles": ["user"]}  # 示例用户信息

# 请求计时和日志中间件
@app.middleware("http")
async def log_request_middleware(request: Request, call_next):
    """记录请求信息和处理时间"""
    start_time = time.time()
    
    # 记录请求开始
    path = request.url.path
    method = request.method
    client_ip = request.client.host if request.client else "unknown"
    
    logger.debug(f"Request started: {method} {path} from {client_ip}")
    
    try:
        # 处理请求
        response = await call_next(request)
        
        # 计算处理时间
        process_time = (time.time() - start_time) * 1000  # 转换为毫秒
        
        # 记录请求完成
        status_code = response.status_code
        logger.debug(f"Request completed: {method} {path} - {status_code} ({process_time:.2f}ms)")
        
        # 记录审计日志
        try:
            user_id = "anonymous"
            # 尝试从请求中获取用户信息
            if hasattr(request.state, "user"):
                user_id = request.state.user.get("user_id", "anonymous")
            
            audit_logger.log_api_request(
                user_id=user_id,
                endpoint=path,
                method=method,
                status_code=status_code,
                duration_ms=process_time
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {str(e)}")
        
        return response
    except Exception as e:
        # 记录异常
        process_time = (time.time() - start_time) * 1000
        logger.error(f"Request failed: {method} {path} - {str(e)} ({process_time:.2f}ms)")
        
        # 返回统一的错误响应
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )

# 服务健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """检查API网关健康状态"""
    # 检查各服务连接状态
    services_status = {}
    for service_name, service_url in SERVICES.items():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{service_url}/health")
                services_status[service_name] = {
                    "status": "up" if response.status_code == 200 else "down",
                    "status_code": response.status_code
                }
        except Exception as e:
            services_status[service_name] = {
                "status": "down",
                "error": str(e)
            }
    
    # 检查消息队列连接
    mq_status = "up" if mq_client.connected or mq_client.connect() else "down"
    
    # 总体健康状态
    overall_status = "up" if all(s["status"] == "up" for s in services_status.values()) and mq_status == "up" else "down"
    
    return {
        "status": overall_status,
        "timestamp": time.time(),
        "services": services_status,
        "message_queue": mq_status
    }

# 通用的服务代理函数
async def proxy_request(service_name: str, path: str, method: str, request: Request):
    """代理请求到指定的微服务"""
    if service_name not in SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")
    
    service_url = SERVICES[service_name]
    target_url = f"{service_url}{path}"
    
    # 获取请求头和请求体
    headers = dict(request.headers)
    # 移除host头，让httpx自动设置
    headers.pop("host", None)
    
    try:
        # 读取请求体
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            
        # 转发请求到目标服务
        response = await http_client.request(
            method=method,
            url=target_url,
            headers=headers,
            content=body,
            params=request.query_params
        )
        
        # 返回目标服务的响应
        return JSONResponse(
            content=response.json(),
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except httpx.TimeoutException:
        logger.error(f"Request to {service_name} timed out: {target_url}")
        raise HTTPException(status_code=504, detail=f"Service '{service_name}' timeout")
    except httpx.HTTPError as e:
        logger.error(f"HTTP error when calling {service_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calling service '{service_name}'")
    except Exception as e:
        logger.error(f"Unexpected error when proxying to {service_name}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# 订单验证服务代理路由
@app.api_route("/api/verify/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Order Verification"])
async def proxy_order_verification(request: Request, path: str):
    """代理请求到订单验证服务"""
    return await proxy_request("order_verification", f"/api/verify/{path}", request.method, request)

# 赔付处理服务代理路由
@app.api_route("/api/payout/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Payout Processing"])
async def proxy_payout_processing(request: Request, path: str):
    """代理请求到赔付处理服务"""
    return await proxy_request("payout_processing", f"/api/payout/{path}", request.method, request)

# 资金管理服务代理路由
@app.api_route("/api/fund/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Fund Management"])
async def proxy_fund_management(request: Request, path: str):
    """代理请求到资金管理服务"""
    return await proxy_request("fund_management", f"/api/fund/{path}", request.method, request)

# 报告生成服务代理路由
@app.api_route("/api/report/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], tags=["Report Generation"])
async def proxy_report_generation(request: Request, path: str):
    """代理请求到报告生成服务"""
    return await proxy_request("report_generation", f"/api/report/{path}", request.method, request)

# 直接发布消息到消息队列的端点（用于演示）
@app.post("/api/message/{queue_name}", tags=["Message Queue"], dependencies=[Depends(verify_token)])
async def publish_message(queue_name: str, message: dict, request: Request):
    """发布消息到指定的消息队列（需要认证）"""
    try:
        success = mq_client.publish_message(queue_name, message)
        if success:
            logger.info(f"Message published to queue '{queue_name}' via API Gateway")
            return {"status": "success", "message": f"Message published to queue '{queue_name}'"}
        else:
            raise HTTPException(status_code=500, detail="Failed to publish message")
    except Exception as e:
        logger.error(f"Error publishing message to queue '{queue_name}': {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 应用启动和关闭事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    logger.info("API Gateway starting up...")
    
    # 连接到消息队列
    if not mq_client.connect():
        logger.warning("Failed to connect to message queue during startup")
    
    # 预热HTTP客户端连接池
    for service_name, service_url in SERVICES.items():
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.get(f"{service_url}/health")
                logger.info(f"Connected to {service_name} service at {service_url}")
        except Exception as e:
            logger.warning(f"Failed to connect to {service_name} service at startup: {str(e)}")
    
    logger.info("API Gateway started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时执行"""
    logger.info("API Gateway shutting down...")
    
    # 关闭HTTP客户端
    await http_client.aclose()
    
    # 关闭消息队列连接
    mq_client.close()
    
    logger.info("API Gateway shut down successfully")

# 主函数，用于直接运行应用
if __name__ == "__main__":
    # 从命令行参数或配置获取主机和端口
    host = config_manager.get('api_gateway.host', '0.0.0.0')
    port = config_manager.get('api_gateway.port', 8000)
    
    logger.info(f"Starting API Gateway on {host}:{port}")
    
    # 运行UVicorn服务器
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=config_manager.is_debug(),  # 调试模式下自动重载
        workers=config_manager.get('api_gateway.workers', 1)  # 工作进程数
    )