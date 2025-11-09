/**
 * 全局错误边界组件
 * 捕获React组件树中的错误并提供友好提示
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: this.generateErrorId(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: this.generateErrorId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误到状态
    this.setState({
      error,
      errorInfo,
    });

    // 控制台记录
    console.error('ErrorBoundary caught an error:', {
      error,
      errorInfo,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
    });

    // 调用外部回调
    this.props.onError?.(error, errorInfo);

    // 可以在这里添加错误上报逻辑
    // reportError(error, errorInfo, this.state.errorId);
  }

  private static generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 如果有自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误界面
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                应用出现错误
              </h2>
              
              <p className="text-sm text-gray-600 mb-4">
                抱歉，应用遇到了问题。错误ID: <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{this.state.errorId}</span>
              </p>

              {import.meta.env.DEV && this.state.error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-left">
                  <p className="text-sm font-medium text-red-800 mb-1">错误详情（仅开发环境可见）:</p>
                  <p className="text-xs text-red-600 font-mono">{this.state.error.message}</p>
                  {this.state.error.stack && (
                    <pre className="text-xs text-red-500 mt-2 overflow-auto max-h-32">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex space-x-3 justify-center">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  重试
                </button>
                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  重新加载页面
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

/**
 * 错误消息组件
 * 用于显示API错误或其他操作错误
 */
interface ErrorMessageProps {
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ 
  message, 
  requestId, 
  onRetry, 
  className = '' 
}) => {
  return (
    <div className={`bg-red-50 border border-red-200 rounded-md p-4 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">操作失败</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{message}</p>
            {requestId && (
              <p className="mt-1 text-xs text-red-600">
                错误ID: <span className="font-mono bg-red-100 px-1 rounded">{requestId}</span>
              </p>
            )}
          </div>
          {onRetry && (
            <div className="mt-4">
              <button
                onClick={onRetry}
                className="text-sm font-medium text-red-600 hover:text-red-500 focus:outline-none focus:underline"
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 加载状态组件
 */
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '', 
  text = '加载中...' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center space-y-2">
        <div className={`animate-spin rounded-full border-b-2 border-indigo-600 ${sizeClasses[size]}`}></div>
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    </div>
  );
};

/**
 * 通用错误处理Hook
 */
interface UseErrorHandlerOptions {
  onError?: (error: Error, requestId?: string) => void;
  fallbackMessage?: string;
}

export const useErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  const { onError, fallbackMessage = '操作失败，请稍后重试' } = options;
  
  const handleError = (error: unknown, requestId?: string) => {
    let message = fallbackMessage;
    
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }
    
    // 控制台记录
    console.error('Error handled:', {
      message,
      requestId,
      error,
      timestamp: new Date().toISOString(),
    });
    
    // 调用外部回调
    onError?.(error as Error, requestId);
    
    // 可以在这里添加错误上报
    // reportError(error, requestId);
    
    return { message, requestId };
  };
  
  return { handleError };
};