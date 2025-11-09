/**
 * 统一错误类型定义
 */

/**
 * 错误代码枚举
 */
export const ERROR_CODES = {
  // 认证相关错误 (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // 验证相关错误 (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // 资源相关错误 (4xx)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  
  // 业务逻辑错误 (4xx)
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RATE_LIMITED: 'RATE_LIMITED',
  
  // 上游服务错误 (5xx)
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // 系统错误 (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // 网络错误 (5xx)
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * 错误严重级别
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type ErrorSeverity = typeof ERROR_SEVERITY[keyof typeof ERROR_SEVERITY];

/**
 * 错误详情接口
 */
export interface ErrorDetails {
  field?: string;
  value?: any;
  constraint?: string;
  expected?: any;
  actual?: any;
  suggestion?: string;
  upstreamCode?: string;
  upstreamMessage?: string;
}

/**
 * 统一错误响应接口
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails[];
    severity?: ErrorSeverity;
    timestamp: string;
    requestId?: string;
    path?: string;
    documentationUrl?: string;
  };
}

/**
 * 基础错误类
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly severity: ErrorSeverity;
  public readonly details?: ErrorDetails[];
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number = 500,
    severity: ErrorSeverity = 'medium',
    details?: ErrorDetails[],
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.severity = severity;
    this.details = details;
    this.isOperational = isOperational;
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, new.target.prototype);
    
    // 捕获堆栈跟踪
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 转换为API响应格式
   */
  toApiResponse(requestId?: string, path?: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        severity: this.severity,
        timestamp: new Date().toISOString(),
        requestId,
        path,
        documentationUrl: this.getDocumentationUrl(),
      },
    };
  }

  /**
   * 获取错误文档URL
   */
  private getDocumentationUrl(): string {
    const baseUrl = 'https://docs.liqpass.com/errors';
    return `${baseUrl}/${this.code.toLowerCase()}`;
  }
}

/**
 * 认证相关错误
 */
export class AuthenticationError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.UNAUTHORIZED,
    message: string = '认证失败',
    details?: ErrorDetails[]
  ) {
    super(code, message, 401, 'medium', details);
    this.name = 'AuthenticationError';
  }
}

/**
 * 权限相关错误
 */
export class AuthorizationError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.FORBIDDEN,
    message: string = '权限不足',
    details?: ErrorDetails[]
  ) {
    super(code, message, 403, 'medium', details);
    this.name = 'AuthorizationError';
  }
}

/**
 * 验证相关错误
 */
export class ValidationError extends AppError {
  constructor(
    message: string = '请求参数验证失败',
    details?: ErrorDetails[]
  ) {
    super(ERROR_CODES.VALIDATION_ERROR, message, 400, 'low', details);
    this.name = 'ValidationError';
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string = '资源',
    details?: ErrorDetails[]
  ) {
    super(ERROR_CODES.NOT_FOUND, `${resource}不存在`, 404, 'low', details);
    this.name = 'NotFoundError';
  }
}

/**
 * 业务逻辑错误
 */
export class BusinessError extends AppError {
  constructor(
    code: ErrorCode = ERROR_CODES.BUSINESS_ERROR,
    message: string = '业务逻辑错误',
    details?: ErrorDetails[]
  ) {
    super(code, message, 422, 'medium', details);
    this.name = 'BusinessError';
  }
}

/**
 * 上游服务错误
 */
export class UpstreamError extends AppError {
  constructor(
    service: string,
    upstreamCode?: string,
    upstreamMessage?: string,
    details?: ErrorDetails[]
  ) {
    const message = `${service}服务暂时不可用`;
    const errorDetails: ErrorDetails[] = [
      ...(details || []),
      ...(upstreamCode ? [{ upstreamCode, upstreamMessage }] : []),
    ];
    
    super(ERROR_CODES.UPSTREAM_ERROR, message, 502, 'high', errorDetails);
    this.name = 'UpstreamError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = '请求过于频繁，请稍后重试',
    retryAfter?: number,
    details?: ErrorDetails[]
  ) {
    // 构建完整的details数组
    const fullDetails = [
      ...(details || []),
      ...(retryAfter ? [{ suggestion: `请在 ${retryAfter} 秒后重试` }] : []),
    ];
    
    super(ERROR_CODES.RATE_LIMITED, message, 429, 'low', fullDetails);
    this.name = 'RateLimitError';
  }
}

/**
 * 错误工具函数
 */
export class ErrorUtils {
  /**
   * 创建验证错误详情
   */
  static createValidationDetail(
    field: string,
    constraint: string,
    expected?: any,
    actual?: any,
    suggestion?: string
  ): ErrorDetails {
    return {
      field,
      constraint,
      expected,
      actual,
      suggestion,
    };
  }

  /**
   * 检查是否为操作错误（可预测的错误）
   */
  static isOperationalError(error: unknown): boolean {
    return error instanceof AppError && error.isOperational;
  }

  /**
   * 检查是否为程序错误（不可预测的错误）
   */
  static isProgrammerError(error: unknown): boolean {
    return !this.isOperationalError(error);
  }

  /**
   * 标准化错误对象
   */
  static normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        error.message,
        500,
        'high',
        undefined,
        false
      );
    }

    return new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      '未知错误',
      500,
      'high',
      undefined,
      false
    );
  }

  /**
   * 获取错误的HTTP状态码
   */
  static getHttpStatus(error: unknown): number {
    if (error instanceof AppError) {
      return error.httpStatus;
    }
    return 500;
  }

  /**
   * 获取错误代码
   */
  static getErrorCode(error: unknown): ErrorCode {
    if (error instanceof AppError) {
      return error.code;
    }
    return ERROR_CODES.INTERNAL_ERROR;
  }
}

/**
 * 错误代码到HTTP状态码的映射
 */
export const ERROR_CODE_TO_HTTP_STATUS: Record<ErrorCode, number> = {
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.INVALID_TOKEN]: 401,
  [ERROR_CODES.SESSION_EXPIRED]: 401,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_REQUEST]: 400,
  [ERROR_CODES.MISSING_PARAMETER]: 400,
  [ERROR_CODES.INVALID_PARAMETER]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.RESOURCE_CONFLICT]: 409,
  [ERROR_CODES.ALREADY_EXISTS]: 409,
  [ERROR_CODES.BUSINESS_ERROR]: 422,
  [ERROR_CODES.INSUFFICIENT_FUNDS]: 422,
  [ERROR_CODES.QUOTA_EXCEEDED]: 429,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.UPSTREAM_ERROR]: 502,
  [ERROR_CODES.UPSTREAM_TIMEOUT]: 504,
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 502,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.CONFIGURATION_ERROR]: 500,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [ERROR_CODES.NETWORK_ERROR]: 500,
  [ERROR_CODES.TIMEOUT_ERROR]: 504,
  [ERROR_CODES.CONNECTION_ERROR]: 500,
};