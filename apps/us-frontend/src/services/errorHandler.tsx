/**
 * 全局错误处理中间件
 * 提供React错误边界和API错误处理
 */

import React, { Component, ReactNode } from 'react';
import { api, ApiError, handleApiError } from './api';

// 错误类型枚举
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN'
}

// 错误信息接口
export interface ErrorDetails {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: Date;
  componentStack?: string;
}

// 错误处理回调类型
export type ErrorHandler = (error: ErrorDetails) => void;

// 全局错误处理器类
class ErrorHandlerManager {
  private handlers: Set<ErrorHandler> = new Set();
  private isInitialized = false;

  // 初始化错误处理
  initialize() {
    if (this.isInitialized) return;

    // 监听未处理的Promise拒绝
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    
    // 监听JavaScript错误
    window.addEventListener('error', this.handleWindowError);
    
    // 监听Vue/React等框架错误
    if (process.env.NODE_ENV === 'development') {
      console.log('错误处理器已初始化');
    }
    
    this.isInitialized = true;
  }

  // 清理
  cleanup() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    window.removeEventListener('error', this.handleWindowError);
    this.handlers.clear();
    this.isInitialized = false;
  }

  // 注册错误处理器
  addHandler(handler: ErrorHandler) {
    this.handlers.add(handler);
  }

  // 移除错误处理器
  removeHandler(handler: ErrorHandler) {
    this.handlers.delete(handler);
  }

  // 处理错误
  handleError(error: unknown, context?: string): ErrorDetails {
    const errorInfo = this.createErrorInfo(error, context);
    
    // 通知所有注册的处理器
    this.handlers.forEach(handler => {
      try {
        handler(errorInfo);
      } catch (handlerError) {
        console.error('错误处理器执行失败:', handlerError);
      }
    });

    // 开发环境打印详细错误信息
    if (process.env.NODE_ENV === 'development') {
      console.error('捕获到错误:', errorInfo);
    }

    return errorInfo;
  }

  // 创建错误信息
  private createErrorInfo(error: unknown, context?: string): ErrorDetails {
    const timestamp = new Date();
    
    if (error instanceof ApiError) {
      return {
        type: this.getApiErrorType(error),
        message: error.message,
        details: {
          statusCode: error.statusCode,
          response: error.response,
          context
        },
        timestamp
      };
    }

    if (error instanceof Error) {
      return {
        type: ErrorType.UNKNOWN,
        message: error.message,
        details: {
          stack: error.stack,
          name: error.name,
          context
        },
        timestamp
      };
    }

    if (typeof error === 'string') {
      return {
        type: ErrorType.UNKNOWN,
        message: error,
        details: { context },
        timestamp
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      message: '发生未知错误',
      details: { error, context },
      timestamp
    };
  }

  // 获取API错误类型
  private getApiErrorType(error: ApiError): ErrorType {
    if (error.statusCode === 401) return ErrorType.AUTH;
    if (error.statusCode === 422) return ErrorType.VALIDATION;
    if (error.statusCode && error.statusCode >= 500) return ErrorType.SERVER;
    if (error.message.includes('网络')) return ErrorType.NETWORK;
    return ErrorType.UNKNOWN;
  }

  // 处理未处理的Promise拒绝
  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    this.handleError(event.reason, '未处理的Promise拒绝');
  };

  // 处理window错误
  private handleWindowError = (event: ErrorEvent) => {
    event.preventDefault();
    this.handleError({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    }, '全局JavaScript错误');
  };
}

// 创建全局错误处理器实例
export const errorHandler = new ErrorHandlerManager();

// 错误处理Hook
export function useErrorHandler() {
  const handleError = (error: unknown, context?: string) => {
    return errorHandler.handleError(error, context);
  };

  return { handleError };
}

// API错误处理Hook
export function useApiErrorHandler(showToast?: (message: string) => void) {
  const onApiError = (error: unknown) => {
    return handleApiError(error, showToast);
  };

  return { handleApiError: onApiError };
}

// 初始化错误处理器
export function initializeErrorHandling() {
  errorHandler.initialize();
}

// 清理错误处理器
export function cleanupErrorHandling() {
  errorHandler.cleanup();
}
