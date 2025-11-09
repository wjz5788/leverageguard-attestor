/**
 * 统一错误处理中间件
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorUtils, ApiErrorResponse, ERROR_CODES } from '../types/errors.js';

/**
 * 错误处理配置
 */
export interface ErrorHandlerConfig {
  /** 是否在响应中包含堆栈跟踪（仅开发环境） */
  includeStackTrace?: boolean;
  /** 是否记录错误日志 */
  logErrors?: boolean;
  /** 是否向客户端发送详细错误信息 */
  exposeErrors?: boolean;
  /** 自定义错误记录器 */
  logger?: (error: AppError, req: Request) => void;
}

/**
 * 默认错误记录器
 */
function defaultLogger(error: AppError, req: Request): void {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    error: {
      code: error.code,
      message: error.message,
      severity: error.severity,
      httpStatus: error.httpStatus,
      details: error.details,
      stack: error.stack,
    },
  };

  if (error.severity === 'critical' || error.severity === 'high') {
    console.error('🚨 严重错误:', logData);
  } else if (error.severity === 'medium') {
    console.warn('⚠️ 警告错误:', logData);
  } else {
    console.log('ℹ️ 信息错误:', logData);
  }
}

/**
 * 生成请求ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 统一错误处理中间件
 */
export function errorHandler(config: ErrorHandlerConfig = {}) {
  const {
    includeStackTrace = process.env.NODE_ENV === 'development',
    logErrors = true,
    exposeErrors = process.env.NODE_ENV === 'development',
    logger = defaultLogger,
  } = config;

  return (error: unknown, req: Request, res: Response, next: NextFunction) => {
    // 标准化错误
    const normalizedError = ErrorUtils.normalizeError(error);
    
    // 生成请求ID
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    
    // 记录错误日志
    if (logErrors) {
      logger(normalizedError, req);
    }

    // 构建错误响应
    const errorResponse: ApiErrorResponse = normalizedError.toApiResponse(
      requestId,
      req.path
    );

    // 在开发环境中包含堆栈跟踪
    if (includeStackTrace && normalizedError.stack) {
      (errorResponse.error as any).stack = normalizedError.stack;
    }

    // 设置响应头
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Error-Code', normalizedError.code);
    res.setHeader('X-Error-Severity', normalizedError.severity);
    
    // 如果是速率限制错误，添加Retry-After头
    if (normalizedError.code === ERROR_CODES.RATE_LIMITED) {
      const retryAfter = normalizedError.details?.find(d => d.suggestion?.includes('秒后重试'))?.suggestion?.match(/\d+/)?.[0];
      if (retryAfter) {
        res.setHeader('Retry-After', retryAfter);
      }
    }

    // 发送错误响应
    res.status(normalizedError.httpStatus).json(errorResponse);
  };
}

/**
 * 异步错误处理包装器
 */
export function asyncHandler<T extends any[]>(
  fn: (...args: T) => Promise<any>
) {
  return (...args: T): any => {
    const next = args[args.length - 1] as NextFunction;
    return Promise.resolve(fn(...args)).catch(next);
  };
}

/**
 * 404错误处理中间件
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  const error = new AppError(
    ERROR_CODES.NOT_FOUND,
    `路由 ${req.method} ${req.path} 不存在`,
    404,
    'low'
  );
  
  next(error);
}

/**
 * 请求验证错误处理中间件
 */
export function validationErrorHandler(error: any, req: Request, res: Response, next: NextFunction) {
  // 检查是否为Zod验证错误
  if (error.name === 'ZodError') {
    const details = error.errors.map((err: any) => ({
      field: err.path.join('.'),
      constraint: err.code,
      expected: err.expected,
      actual: err.received,
      message: err.message,
    }));

    const validationError = new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      '请求参数验证失败',
      400,
      'low',
      details
    );

    return next(validationError);
  }

  // 检查是否为JWT验证错误
  if (error.name === 'JsonWebTokenError') {
    const authError = new AppError(
      ERROR_CODES.INVALID_TOKEN,
      '无效的认证令牌',
      401,
      'medium'
    );

    return next(authError);
  }

  // 检查是否为JWT过期错误
  if (error.name === 'TokenExpiredError') {
    const authError = new AppError(
      ERROR_CODES.SESSION_EXPIRED,
      '认证令牌已过期',
      401,
      'medium'
    );

    return next(authError);
  }

  next(error);
}

/**
 * 数据库错误处理中间件
 */
export function databaseErrorHandler(error: any, req: Request, res: Response, next: NextFunction) {
  // SQLite错误处理
  if (error.code && error.code.startsWith('SQLITE_')) {
    let appError: AppError;

    switch (error.code) {
      case 'SQLITE_CONSTRAINT_UNIQUE':
      case 'SQLITE_CONSTRAINT_PRIMARYKEY':
        appError = new AppError(
          ERROR_CODES.ALREADY_EXISTS,
          '资源已存在',
          409,
          'low'
        );
        break;
      
      case 'SQLITE_CONSTRAINT_FOREIGNKEY':
        appError = new AppError(
          ERROR_CODES.NOT_FOUND,
          '关联资源不存在',
          404,
          'low'
        );
        break;
      
      case 'SQLITE_CONSTRAINT_NOTNULL':
        appError = new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          '必填字段不能为空',
          400,
          'low'
        );
        break;
      
      case 'SQLITE_BUSY':
        appError = new AppError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          '数据库繁忙，请稍后重试',
          503,
          'medium'
        );
        break;
      
      default:
        appError = new AppError(
          ERROR_CODES.DATABASE_ERROR,
          '数据库操作失败',
          500,
          'high'
        );
    }

    return next(appError);
  }

  next(error);
}

/**
 * 网络错误处理中间件
 */
export function networkErrorHandler(error: any, req: Request, res: Response, next: NextFunction) {
  // Axios错误处理
  if (error.isAxiosError) {
    let appError: AppError;

    if (error.code === 'ECONNREFUSED') {
      appError = new AppError(
        ERROR_CODES.CONNECTION_ERROR,
        '无法连接到上游服务',
        502,
        'high'
      );
    } else if (error.code === 'ETIMEDOUT') {
      appError = new AppError(
        ERROR_CODES.TIMEOUT_ERROR,
        '上游服务响应超时',
        504,
        'medium'
      );
    } else if (error.response) {
      // 上游服务返回了错误响应
      const status = error.response.status;
      const upstreamError = error.response.data?.error || error.response.data;

      appError = new AppError(
        ERROR_CODES.UPSTREAM_ERROR,
        '上游服务返回错误',
        502,
        'medium',
        [{
          upstreamCode: upstreamError?.code || status.toString(),
          upstreamMessage: upstreamError?.message || error.response.statusText,
        }]
      );
    } else {
      appError = new AppError(
        ERROR_CODES.NETWORK_ERROR,
        '网络请求失败',
        500,
        'medium'
      );
    }

    return next(appError);
  }

  next(error);
}

/**
 * 完整的错误处理链
 */
export function createErrorHandlers(config?: ErrorHandlerConfig) {
  return [
    validationErrorHandler,
    databaseErrorHandler,
    networkErrorHandler,
    errorHandler(config),
  ];
}

/**
 * 健康检查错误处理
 */
export function healthCheckErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  // 健康检查路由的特殊错误处理
  if (req.path.includes('/health') || req.path.includes('/status')) {
    const normalizedError = ErrorUtils.normalizeError(error);
    
    res.status(normalizedError.httpStatus).json({
      status: 'error',
      error: {
        code: normalizedError.code,
        message: normalizedError.message,
        timestamp: new Date().toISOString(),
      },
    });
    
    return;
  }

  next(error);
}