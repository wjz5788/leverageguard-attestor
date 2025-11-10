# 前端Toast文案规范 v1.1

## 概述

本文档为LiqPass系统v1.1版本的前端用户提示文案规范，确保所有Toast提示与API错误码、后端响应格式保持一致，提供一致的用户体验。

## 1. 文案设计原则

### 1.1 核心原则
- **简洁明确**: 一目了然表达核心信息
- **用户友好**: 使用用户可理解的业务术语
- **一致性**: 相同错误使用相同文案
- **可操作性**: 提供明确的行动建议

### 1.2 文案分类
- **成功提示**: 确认操作完成
- **信息提示**: 状态更新通知
- **警告提示**: 潜在问题提醒
- **错误提示**: 错误情况说明

## 2. 状态码映射表

### 2.1 HTTP 200系列 - 成功
```javascript
const SUCCESS_MESSAGES = {
  // 通用成功
  'OPERATION_SUCCESS': {
    title: '操作成功',
    message: '您的操作已成功完成',
    action: '知道了'
  },
  
  // 登录相关
  'LOGIN_SUCCESS': {
    title: '登录成功',
    message: '欢迎回来！',
    action: '开始使用'
  },
  'LOGOUT_SUCCESS': {
    title: '已退出登录',
    message: '安全退出成功',
    action: '重新登录'
  },
  
  // 订单相关
  'ORDER_CREATED': {
    title: '订单创建成功',
    message: '您的保险订单已创建，正在等待确认',
    action: '查看订单'
  },
  'ORDER_CONFIRMED': {
    title: '订单确认成功',
    message: '订单已确认，请等待成交',
    action: '查看详情'
  },
  'ORDER_FILLED': {
    title: '订单成交成功',
    message: '订单已成交，正在进行验证',
    action: '查看验证'
  },
  
  // 验证相关
  'VERIFICATION_COMPLETED': {
    title: '验证完成',
    message: '证据验证通过，您的保障已生效',
    action: '查看证明'
  },
  'EVIDENCE_SAVED': {
    title: '证据已保存',
    message: '验证证据已安全保存',
    action: '查看证据'
  }
};
```

### 2.2 HTTP 400系列 - 客户端错误
```javascript
const CLIENT_ERROR_MESSAGES = {
  // 请求格式错误
  'VALIDATION_ERROR': {
    title: '输入信息有误',
    message: '请检查并修正您的输入',
    action: '重新填写'
  },
  'MISSING_REQUIRED_FIELD': {
    title: '缺少必填信息',
    message: '请填写所有必填字段',
    action: '补充信息'
  },
  'INVALID_FORMAT': {
    title: '格式错误',
    message: '请按照正确格式填写',
    action: '查看格式'
  },
  
  // 认证错误
  'UNAUTHORIZED': {
    title: '登录状态已过期',
    message: '请重新登录以继续操作',
    action: '重新登录'
  },
  'INVALID_CREDENTIALS': {
    title: '登录信息错误',
    message: '邮箱或密码不正确',
    action: '重新输入'
  },
  'TOKEN_EXPIRED': {
    title: '访问令牌已过期',
    message: '请刷新页面后重试',
    action: '刷新页面'
  },
  
  // 权限错误
  'FORBIDDEN': {
    title: '权限不足',
    message: '您没有权限执行此操作',
    action: '联系管理员'
  },
  'API_KEY_INACTIVE': {
    title: 'API密钥已禁用',
    message: '请检查您的API密钥状态',
    action: '管理密钥'
  },
  
  // 业务逻辑错误
  'INSUFFICIENT_BALANCE': {
    title: '余额不足',
    message: 'USDC余额不足以支付保费',
    action: '充值USDC'
  },
  'LEVERAGE_TOO_HIGH': {
    title: '杠杆过高',
    message: '所选杠杆超过最大限制',
    action: '降低杠杆'
  },
  'ORDER_NOT_FOUND': {
    title: '订单不存在',
    message: '请检查订单ID是否正确',
    action: '重新查询'
  },
  'API_KEY_MISMATCH': {
    title: 'API密钥不匹配',
    message: '此API密钥与当前用户不匹配',
    action: '重新选择'
  },
  'DUPLICATE_ORDER': {
    title: '重复订单',
    message: '相同订单已存在，请勿重复提交',
    action: '查看订单'
  },
  'VERIFICATION_FAILED': {
    title: '验证失败',
    message: '证据验证失败，请检查订单状态',
    action: '查看详情'
  },
  'CONFIRMATION_TIMEOUT': {
    title: '确认超时',
    message: '订单确认超时，请重新下单',
    action: '重新下单'
  },
  'AMOUNT_OUT_OF_RANGE': {
    title: '金额超出范围',
    message: '保费金额需在0.01-100 USDC之间',
    action: '调整金额'
  }
};
```

### 2.3 HTTP 500系列 - 服务器错误
```javascript
const SERVER_ERROR_MESSAGES = {
  // 内部服务器错误
  'INTERNAL_SERVER_ERROR': {
    title: '服务器错误',
    message: '服务暂时不可用，请稍后重试',
    action: '稍后重试'
  },
  'DATABASE_ERROR': {
    title: '数据库错误',
    message: '数据处理失败，请重试',
    action: '重新尝试'
  },
  'VERIFICATION_SERVICE_ERROR': {
    title: '验证服务错误',
    message: '验证服务暂时不可用',
    action: '联系支持'
  },
  
  // 外部服务错误
  'EXCHANGE_UNAVAILABLE': {
    title: '交易所连接失败',
    message: '无法连接到交易所，请检查网络',
    action: '检查网络'
  },
  'EXCHANGE_API_ERROR': {
    title: '交易所API错误',
    message: '交易所返回错误，请稍后重试',
    action: '稍后重试'
  },
  'SIGNATURE_INVALID': {
    title: '签名验证失败',
    message: 'API签名无效，请检查密钥配置',
    action: '检查密钥'
  },
  'RATE_LIMIT_EXCEEDED': {
    title: '请求过于频繁',
    message: '请稍后重试',
    action: '等待重试'
  },
  
  // 验证相关错误
  'VERIFICATION_TIMEOUT': {
    title: '验证超时',
    message: '验证处理超时，正在后台重试',
    action: '等待结果'
  },
  'EVIDENCE_GENERATION_FAILED': {
    title: '证据生成失败',
    message: '无法生成验证证据',
    action: '联系支持'
  },
  'HASH_MISMATCH': {
    title: '数据验证失败',
    message: '证据哈希不匹配',
    action: '检查订单'
  }
};
```

### 2.4 HTTP 429系列 - 限流
```javascript
const RATE_LIMIT_MESSAGES = {
  'RATE_LIMIT_EXCEEDED': {
    title: '请求过于频繁',
    message: '请稍后重试',
    action: '等待重试'
  },
  'API_QUOTA_EXCEEDED': {
    title: 'API配额已用完',
    message: '今日API调用已用完，请明日重试',
    action: '查看配额'
  }
};
```

## 3. Toast组件实现

### 3.1 Toast配置
```javascript
// components/Toast/ToastConfig.js
import React from 'react';

export const TOAST_CONFIG = {
  duration: 5000, // 5秒
  position: 'top-right',
  maxToasts: 5,
  
  // 成功样式
  success: {
    icon: '✅',
    backgroundColor: '#10B981',
    textColor: '#FFFFFF',
  },
  
  // 错误样式
  error: {
    icon: '❌',
    backgroundColor: '#EF4444',
    textColor: '#FFFFFF',
  },
  
  // 警告样式
  warning: {
    icon: '⚠️',
    backgroundColor: '#F59E0B',
    textColor: '#FFFFFF',
  },
  
  // 信息样式
  info: {
    icon: 'ℹ️',
    backgroundColor: '#3B82F6',
    textColor: '#FFFFFF',
  }
};
```

### 3.2 Toast组件
```javascript
// components/Toast/Toast.js
import React from 'react';
import { TOAST_CONFIG } from './ToastConfig';

const Toast = ({ 
  type, 
  title, 
  message, 
  action, 
  onActionClick,
  onClose 
}) => {
  const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;
  
  return (
    <div className="toast" style={getToastStyle(config)}>
      <div className="toast-icon">{config.icon}</div>
      
      <div className="toast-content">
        <div className="toast-title">{title}</div>
        <div className="toast-message">{message}</div>
      </div>
      
      {action && (
        <button 
          className="toast-action"
          onClick={onActionClick}
        >
          {action}
        </button>
      )}
      
      <button 
        className="toast-close"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
};

const getToastStyle = (config) => ({
  backgroundColor: config.backgroundColor,
  color: config.textColor,
  borderRadius: '8px',
  padding: '16px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minWidth: '300px',
  maxWidth: '500px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  animation: 'slideIn 0.3s ease-out'
});

export default Toast;
```

### 3.3 Toast管理Hook
```javascript
// hooks/useToast.js
import { useState, useCallback } from 'react';
import { 
  SUCCESS_MESSAGES, 
  CLIENT_ERROR_MESSAGES, 
  SERVER_ERROR_MESSAGES,
  RATE_LIMIT_MESSAGES
} from '../messages/errorMessages';

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((toastData) => {
    const id = Date.now();
    const newToast = {
      id,
      ...toastData,
      timestamp: new Date()
    };

    setToasts(prev => [...prev, newToast]);

    // 自动移除
    setTimeout(() => {
      removeToast(id);
    }, TOAST_CONFIG.duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showSuccess = useCallback((messageKey, customData = {}) => {
    const message = SUCCESS_MESSAGES[messageKey];
    if (!message) return;

    return showToast({
      type: 'success',
      title: customData.title || message.title,
      message: customData.message || message.message,
      action: customData.action || message.action,
      ...customData
    });
  }, [showToast]);

  const showError = useCallback((messageKey, customData = {}) => {
    // 优先从客户端错误查找
    let message = CLIENT_ERROR_MESSAGES[messageKey];
    
    // 如果没找到，从服务器错误查找
    if (!message) {
      message = SERVER_ERROR_MESSAGES[messageKey];
    }
    
    // 如果还没找到，从限流错误查找
    if (!message) {
      message = RATE_LIMIT_MESSAGES[messageKey];
    }
    
    if (!message) {
      // 兜底处理
      return showToast({
        type: 'error',
        title: '操作失败',
        message: '发生未知错误，请重试',
        action: '重试'
      });
    }

    return showToast({
      type: 'error',
      title: customData.title || message.title,
      message: customData.message || message.message,
      action: customData.action || message.action,
      ...customData
    });
  }, [showToast]);

  const showWarning = useCallback((messageKey, customData = {}) => {
    return showToast({
      type: 'warning',
      title: '警告',
      message: messageKey,
      action: '知道了',
      ...customData
    });
  }, [showToast]);

  const showInfo = useCallback((messageKey, customData = {}) => {
    return showToast({
      type: 'info',
      title: '提示',
      message: messageKey,
      action: '知道了',
      ...customData
    });
  }, [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};
```

## 4. 使用示例

### 4.1 基础使用
```javascript
// 页面组件
import { useToast } from '../hooks/useToast';

const OrderPage = () => {
  const { showSuccess, showError } = useToast();

  const handleCreateOrder = async (orderData) => {
    try {
      const result = await orderService.createOrder(orderData);
      
      showSuccess('ORDER_CREATED', {
        onActionClick: () => navigate(`/orders/${result.order_id}`)
      });
      
    } catch (error) {
      showError(error.code, {
        onActionClick: () => {
          if (error.code === 'INSUFFICIENT_BALANCE') {
            navigate('/wallet');
          }
        }
      });
    }
  };

  return (
    <div>
      {/* 订单表单 */}
    </div>
  );
};
```

### 4.2 错误处理包装
```javascript
// utils/errorHandler.js
import { showError } from '../hooks/useToast';

export const withErrorHandling = async (operation, toastKey) => {
  try {
    return await operation();
  } catch (error) {
    console.error('操作失败:', error);
    
    // 根据错误码显示对应Toast
    if (error.code) {
      showError(error.code);
    } else {
      showError('INTERNAL_SERVER_ERROR');
    }
    
    throw error; // 重新抛出，让上层可以处理
  }
};
```

### 4.3 表单验证
```javascript
// forms/OrderForm.jsx
import { useState } from 'react';
import { useToast } from '../hooks/useToast';

const OrderForm = () => {
  const { showError } = useToast();
  const [formData, setFormData] = useState({
    leverage: '',
    principal: '',
    premium: ''
  });

  const validateForm = () => {
    const errors = [];

    if (!formData.leverage) {
      errors.push('请选择杠杆倍数');
    }

    if (!formData.principal) {
      errors.push('请输入本金金额');
    }

    if (formData.principal && parseFloat(formData.principal) < 0.01) {
      errors.push('最小金额为0.01 USDC');
      showError('AMOUNT_OUT_OF_RANGE');
      return false;
    }

    if (errors.length > 0) {
      showError('VALIDATION_ERROR', {
        message: errors.join('，')
      });
      return false;
    }

    return true;
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 表单字段 */}
    </form>
  );
};
```

## 5. 国际化支持

### 5.1 多语言配置
```javascript
// i18n/toastMessages.js
export const toastMessages = {
  zh: {
    SUCCESS_MESSAGES: {
      OPERATION_SUCCESS: {
        title: '操作成功',
        message: '您的操作已成功完成',
        action: '知道了'
      }
    },
    CLIENT_ERROR_MESSAGES: {
      UNAUTHORIZED: {
        title: '登录状态已过期',
        message: '请重新登录以继续操作',
        action: '重新登录'
      }
    }
  },
  en: {
    SUCCESS_MESSAGES: {
      OPERATION_SUCCESS: {
        title: 'Success',
        message: 'Your operation completed successfully',
        action: 'Got it'
      }
    },
    CLIENT_ERROR_MESSAGES: {
      UNAUTHORIZED: {
        title: 'Session Expired',
        message: 'Please login again to continue',
        action: 'Login'
      }
    }
  }
};
```

### 5.2 本地化Hook
```javascript
// hooks/useLocalizedToast.js
import { useToast } from './useToast';
import { toastMessages } from '../i18n/toastMessages';
import { useLanguage } from './useLanguage';

export const useLocalizedToast = () => {
  const { currentLanguage } = useLanguage();
  const { showToast } = useToast();

  const getLocalizedMessage = (category, key) => {
    return toastMessages[currentLanguage]?.[category]?.[key] 
      || toastMessages.zh[category]?.[key] 
      || { title: 'Error', message: key, action: 'OK' };
  };

  const showLocalizedSuccess = (key, customData = {}) => {
    const message = getLocalizedMessage('SUCCESS_MESSAGES', key);
    return showToast({ type: 'success', ...message, ...customData });
  };

  const showLocalizedError = (key, customData = {}) => {
    // 错误消息需要从多个类别中查找
    let message = getLocalizedMessage('CLIENT_ERROR_MESSAGES', key);
    
    if (message.title === 'Error') {
      message = getLocalizedMessage('SERVER_ERROR_MESSAGES', key);
    }
    
    if (message.title === 'Error') {
      message = getLocalizedMessage('RATE_LIMIT_MESSAGES', key);
    }

    return showToast({ type: 'error', ...message, ...customData });
  };

  return {
    showLocalizedSuccess,
    showLocalizedError
  };
};
```

## 6. 测试与验证

### 6.1 单元测试
```javascript
// tests/hooks/useToast.test.js
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../../hooks/useToast';

test('showSuccess should show success toast', () => {
  const { result } = renderHook(() => useToast());
  
  act(() => {
    result.current.showSuccess('OPERATION_SUCCESS');
  });
  
  expect(result.current.toasts).toHaveLength(1);
  expect(result.current.toasts[0].type).toBe('success');
  expect(result.current.toasts[0].title).toBe('操作成功');
});

test('showError should show error toast with correct mapping', () => {
  const { result } = renderHook(() => useToast());
  
  act(() => {
    result.current.showError('UNAUTHORIZED');
  });
  
  expect(result.current.toasts).toHaveLength(1);
  expect(result.current.toasts[0].type).toBe('error');
  expect(result.current.toasts[0].title).toBe('登录状态已过期');
});
```

### 6.2 集成测试
```javascript
// tests/components/Toast.integration.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../components/Toast/ToastProvider';
import { useToast } from '../../hooks/useToast';

const TestComponent = () => {
  const { showSuccess } = useToast();
  
  const handleClick = () => {
    showSuccess('ORDER_CREATED');
  };
  
  return <button onClick={handleClick}>Show Toast</button>;
};

test('toast should be displayed and dismissible', async () => {
  render(
    <ToastProvider>
      <TestComponent />
    </ToastProvider>
  );
  
  fireEvent.click(screen.getByText('Show Toast'));
  
  expect(screen.getByText('订单创建成功')).toBeInTheDocument();
  
  // 测试关闭按钮
  fireEvent.click(screen.getByText('✕'));
  expect(screen.queryByText('订单创建成功')).not.toBeInTheDocument();
});
```

---

**文档版本**: v1.1  
**最后更新**: 2024-12-19  
**维护者**: LiqPass前端团队