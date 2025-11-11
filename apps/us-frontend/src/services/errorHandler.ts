/**
 * 全局错误处理中间件
 * 提供React错误边界和API错误处理
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
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
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: Date;
  componentStack?: string;
}

// 错误处理回调类型
export type ErrorHandler = (error: ErrorInfo) => void;

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
  handleError(error: unknown, context?: string): ErrorInfo {
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
  private createErrorInfo(error: unknown, context?: string): ErrorInfo {
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

// React错误边界组件
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showErrorDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorDetails = errorHandler.handleError(error, 'React组件错误');
    
    this.setState({
      errorInfo: errorDetails
    });

    // 调用自定义错误处理
    if (this.props.onError) {
      this.props.onError(error, errorDetails);
    }

    // 开发环境打印详细错误信息
    if (process.env.NODE_ENV === 'development') {
      console.error('React错误边界捕获到错误:', error);
      console.error('组件堆栈:', errorInfo.componentStack);
    }
  }

  // 重置错误状态
  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      // 如果有自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                页面出现错误
              </h3>
              
              <p className="text-sm text-gray-500 mb-4">
                很抱歉，页面遇到了一些问题。您可以尝试刷新页面或返回上一页。
              </p>
              
              {this.props.showErrorDetails && this.state.errorInfo && (
                <div className="bg-gray-50 rounded-md p-4 mb-4">
                  <p className="text-xs text-gray-600 font-mono">
                    {this.state.errorInfo.message}
                  </p>
                </div>
              )}
              
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={this.resetError}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  重试
                </button>
                
                <button
                  onClick={() => window.history.back()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  返回
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 错误处理Hook
export function useErrorHandler() {
  const handleError = (error: unknown, context?: string) => {
    return errorHandler.handleError(error, context);
  };

  return { handleError };
}

// API错误处理Hook
export function useApiErrorHandler(showToast?: (message: string) => void) {
  const handleApiError = (error: unknown) => {
    return handleApiError(error, showToast);
  };

  return { handleApiError };
}

// 初始化错误处理器
export function initializeErrorHandling() {
  errorHandler.initialize();
}

// 清理错误处理器
export function cleanupErrorHandling() {
  errorHandler.cleanup();
}