/**
 * 加载状态管理上下文
 * 提供全局的加载状态管理
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// 加载状态接口
export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number; // 0-100
  type?: 'spinner' | 'progress' | 'skeleton';
  id?: string;
}

// 加载上下文值接口
interface LoadingContextValue {
  // 全局加载状态
  globalLoading: boolean;
  globalMessage?: string;
  
  // 特定组件加载状态
  componentLoading: Map<string, boolean>;
  
  // 操作方法
  showLoading: (options?: LoadingState) => string;
  hideLoading: (id?: string) => void;
  updateLoading: (id: string, updates: Partial<LoadingState>) => void;
  showComponentLoading: (componentId: string, message?: string) => void;
  hideComponentLoading: (componentId: string) => void;
  
  // 便捷方法
  showSpinner: (message?: string) => string;
  showProgress: (message?: string, progress?: number) => string;
  showSkeleton: (componentId: string) => void;
}

// 创建上下文
const LoadingContext = createContext<LoadingContextValue | undefined>(undefined);

// 加载提供者组件接口
interface LoadingProviderProps {
  children: React.ReactNode;
  defaultType?: 'spinner' | 'progress' | 'skeleton';
  defaultMessage?: string;
}

// 加载提供者组件
export const LoadingProvider: React.FC<LoadingProviderProps> = ({
  children,
  defaultType = 'spinner',
  defaultMessage = '加载中...'
}) => {
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<string | undefined>(undefined);
  const [componentLoading, setComponentLoading] = useState<Map<string, boolean>>(new Map());
  const loadingStatesRef = useRef<Map<string, LoadingState>>(new Map());
  const nextIdRef = useRef(1);

  // 显示加载状态
  const showLoading = useCallback((options: LoadingState = {}): string => {
    const id = options.id || `loading-${nextIdRef.current++}`;
    const loadingState: LoadingState = {
      isLoading: true,
      type: options.type || defaultType,
      message: options.message || defaultMessage,
      progress: options.progress,
      id
    };

    loadingStatesRef.current.set(id, loadingState);
    
    // 更新全局状态
    if (loadingStatesRef.current.size === 1) {
      setGlobalLoading(true);
      setGlobalMessage(loadingState.message);
    }

    return id;
  }, [defaultType, defaultMessage]);

  // 隐藏加载状态
  const hideLoading = useCallback((id?: string) => {
    if (id) {
      loadingStatesRef.current.delete(id);
    } else {
      // 如果没有指定ID，清除所有全局加载状态
      const globalStates = Array.from(loadingStatesRef.current.entries())
        .filter(([_, state]) => !state.id?.startsWith('component-'));
      globalStates.forEach(([key]) => loadingStatesRef.current.delete(key));
    }

    // 更新全局状态
    const remainingStates = Array.from(loadingStatesRef.current.values())
      .filter(state => !state.id?.startsWith('component-'));
    
    if (remainingStates.length === 0) {
      setGlobalLoading(false);
      setGlobalMessage(undefined);
    } else {
      // 显示最后一个加载状态的消息
      const lastState = remainingStates[remainingStates.length - 1];
      setGlobalMessage(lastState.message);
    }
  }, []);

  // 更新加载状态
  const updateLoading = useCallback((id: string, updates: Partial<LoadingState>) => {
    const currentState = loadingStatesRef.current.get(id);
    if (currentState) {
      const updatedState = { ...currentState, ...updates };
      loadingStatesRef.current.set(id, updatedState);
      
      // 如果是当前显示的加载状态，更新消息
      if (globalLoading && globalMessage === currentState.message && updates.message) {
        setGlobalMessage(updates.message);
      }
    }
  }, [globalLoading, globalMessage]);

  // 显示组件加载状态
  const showComponentLoading = useCallback((componentId: string, message?: string) => {
    setComponentLoading(prev => new Map(prev).set(componentId, true));
    
    // 可选：同时显示全局加载状态
    if (message) {
      showLoading({
        id: `component-${componentId}`,
        message,
        type: 'spinner'
      });
    }
  }, [showLoading]);

  // 隐藏组件加载状态
  const hideComponentLoading = useCallback((componentId: string) => {
    setComponentLoading(prev => {
      const newMap = new Map(prev);
      newMap.delete(componentId);
      return newMap;
    });
    
    // 隐藏对应的全局加载状态
    hideLoading(`component-${componentId}`);
  }, [hideLoading]);

  // 便捷方法
  const showSpinner = useCallback((message?: string): string => {
    return showLoading({ type: 'spinner', message });
  }, [showLoading]);

  const showProgress = useCallback((message?: string, progress?: number): string => {
    return showLoading({ type: 'progress', message, progress });
  }, [showLoading]);

  const showSkeleton = useCallback((componentId: string): void => {
    showComponentLoading(componentId);
  }, [showComponentLoading]);

  const contextValue: LoadingContextValue = {
    globalLoading,
    globalMessage,
    componentLoading,
    showLoading,
    hideLoading,
    updateLoading,
    showComponentLoading,
    hideComponentLoading,
    showSpinner,
    showProgress,
    showSkeleton
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
      <GlobalLoading />
    </LoadingContext.Provider>
  );
};

// 使用加载上下文的Hook
export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading 必须在 LoadingProvider 内使用');
  }
  return context;
};

// 全局加载组件
const GlobalLoading: React.FC = () => {
  const { globalLoading, globalMessage } = useLoading();

  if (!globalLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          {globalMessage && (
            <p className="text-gray-700">{globalMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// 组件加载包装器
interface WithLoadingProps {
  loading?: boolean;
  loadingMessage?: string;
  skeleton?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}

export const WithLoading: React.FC<WithLoadingProps> = ({
  loading = false,
  loadingMessage,
  skeleton,
  error,
  children
}) => {
  if (error) {
    return <>{error}</>;
  }

  if (loading) {
    if (skeleton) {
      return <>{skeleton}</>;
    }
    
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          {loadingMessage && (
            <p className="text-gray-500">{loadingMessage}</p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// 骨架屏组件
interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  count?: number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  count = 1,
  circle = false
}) => {
  const elements = [];
  
  for (let i = 0; i < count; i++) {
    elements.push(
      <div
        key={i}
        className={`animate-pulse bg-gray-200 ${circle ? 'rounded-full' : 'rounded'} ${className}`}
        style={{
          width,
          height,
          ...(i > 0 ? { marginTop: '0.5rem' } : {})
        }}
      />
    );
  }

  return <>{elements}</>;
};

// 按钮加载状态
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  loadingText = '处理中...',
  children,
  disabled,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`relative ${props.className || ''}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
        </div>
      )}
      <span className={loading ? 'opacity-0' : ''}>
        {loading ? loadingText : children}
      </span>
    </button>
  );
};