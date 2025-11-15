/**
 * TailwindCSS 样式工具函数
 * 提供一致的样式类和工具函数
 */

import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// 合并TailwindCSS类名，自动处理冲突
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 常用样式常量
export const STYLES = {
  // 按钮样式
  button: {
    base: 'inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200',
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500',
    outline: 'bg-transparent border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    disabled: 'bg-gray-100 text-gray-400 cursor-not-allowed',
    sizes: {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
      xl: 'px-8 py-4 text-lg'
    }
  },

  // 输入框样式
  input: {
    base: 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500',
    error: 'border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500',
    disabled: 'bg-gray-50 text-gray-500 cursor-not-allowed',
    sizes: {
      sm: 'px-2.5 py-1.5 text-sm',
      md: 'px-3 py-2 text-sm',
      lg: 'px-4 py-3 text-base'
    }
  },

  // 卡片样式
  card: {
    base: 'bg-white shadow rounded-lg',
    hover: 'hover:shadow-lg transition-shadow duration-200',
    bordered: 'border border-gray-200',
    sizes: {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8'
    }
  },

  // 布局样式
  layout: {
    container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    section: 'py-12 sm:py-16',
    grid: 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3',
    flex: {
      center: 'flex items-center justify-center',
      between: 'flex items-center justify-between',
      start: 'flex items-center justify-start',
      end: 'flex items-center justify-end'
    }
  },

  // 文本样式
  text: {
    heading: {
      h1: 'text-3xl font-bold text-gray-900 sm:text-4xl',
      h2: 'text-2xl font-bold text-gray-900 sm:text-3xl',
      h3: 'text-xl font-semibold text-gray-900 sm:text-2xl',
      h4: 'text-lg font-semibold text-gray-900',
      h5: 'text-base font-medium text-gray-900',
      h6: 'text-sm font-medium text-gray-900'
    },
    body: {
      lg: 'text-lg text-gray-700',
      base: 'text-base text-gray-700',
      sm: 'text-sm text-gray-600',
      xs: 'text-xs text-gray-500'
    },
    colors: {
      primary: 'text-blue-600',
      secondary: 'text-gray-600',
      success: 'text-green-600',
      warning: 'text-yellow-600',
      danger: 'text-red-600',
      muted: 'text-gray-500'
    }
  },

  // 状态样式
  status: {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    neutral: 'bg-gray-100 text-gray-800'
  },

  // 动画样式
  animation: {
    fadeIn: 'animate-fade-in',
    slideIn: 'animate-slide-in',
    spin: 'animate-spin',
    pulse: 'animate-pulse',
    bounce: 'animate-bounce'
  }
} as const;

// 响应式断点工具
export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
} as const;

// 媒体查询工具
export const mediaQueries = {
  sm: `@media (min-width: ${BREAKPOINTS.sm})`,
  md: `@media (min-width: ${BREAKPOINTS.md})`,
  lg: `@media (min-width: ${BREAKPOINTS.lg})`,
  xl: `@media (min-width: ${BREAKPOINTS.xl})`,
  '2xl': `@media (min-width: ${BREAKPOINTS['2xl']})`
} as const;

// 常用工具类组合
export const UTILS = {
  // 隐藏元素
  hidden: 'hidden',
  visible: 'block',
  
  // 圆角
  rounded: {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full'
  },

  // 阴影
  shadow: {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow',
    lg: 'shadow-lg',
    xl: 'shadow-xl'
  },

  // 间距
  spacing: {
    none: 'p-0 m-0',
    tight: 'p-2 m-2',
    normal: 'p-4 m-4',
    loose: 'p-6 m-6',
    extra: 'p-8 m-8'
  }
} as const;

// 主题颜色配置
export const THEME = {
  colors: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      900: '#1e3a8a'
    },
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827'
    }
  }
} as const;

// 按钮样式生成器
export function createButtonStyles(
  variant: keyof typeof STYLES.button = 'primary',
  size: keyof typeof STYLES.button.sizes = 'md',
  disabled = false,
  additionalClasses?: string
) {
  const baseClasses = STYLES.button.base;
  const variantClasses = disabled 
    ? STYLES.button.disabled 
    : STYLES.button[variant] || STYLES.button.primary;
  const sizeClasses = STYLES.button.sizes[size] || STYLES.button.sizes.md;
  
  return cn(baseClasses, variantClasses, sizeClasses, additionalClasses);
}

// 输入框样式生成器
export function createInputStyles(
  hasError = false,
  size: keyof typeof STYLES.input.sizes = 'md',
  disabled = false,
  additionalClasses?: string
) {
  const baseClasses = STYLES.input.base;
  const errorClasses = hasError ? STYLES.input.error : '';
  const disabledClasses = disabled ? STYLES.input.disabled : '';
  const sizeClasses = STYLES.input.sizes[size] || STYLES.input.sizes.md;
  
  return cn(baseClasses, errorClasses, disabledClasses, sizeClasses, additionalClasses);
}

// 卡片样式生成器
export function createCardStyles(
  size: keyof typeof STYLES.card.sizes = 'md',
  hover = false,
  bordered = true,
  additionalClasses?: string
) {
  const baseClasses = STYLES.card.base;
  const hoverClasses = hover ? STYLES.card.hover : '';
  const borderedClasses = bordered ? STYLES.card.bordered : '';
  const sizeClasses = STYLES.card.sizes[size] || STYLES.card.sizes.md;
  
  return cn(baseClasses, hoverClasses, borderedClasses, sizeClasses, additionalClasses);
}

// 文本样式生成器
export function createTextStyles(
  type: keyof typeof STYLES.text.heading | keyof typeof STYLES.text.body = 'base',
  color?: keyof typeof STYLES.text.colors,
  additionalClasses?: string
) {
  const textClasses = STYLES.text.heading[type as keyof typeof STYLES.text.heading] || 
                     STYLES.text.body[type as keyof typeof STYLES.text.body] ||
                     STYLES.text.body.base;
  const colorClasses = color ? STYLES.text.colors[color] : '';
  
  return cn(textClasses, colorClasses, additionalClasses);
}

// 响应式工具函数
export function createResponsiveClasses(
  baseClasses: string,
  responsiveOverrides?: {
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
  }
) {
  let classes = baseClasses;
  
  if (responsiveOverrides) {
    if (responsiveOverrides.sm) classes += ` sm:${responsiveOverrides.sm}`;
    if (responsiveOverrides.md) classes += ` md:${responsiveOverrides.md}`;
    if (responsiveOverrides.lg) classes += ` lg:${responsiveOverrides.lg}`;
    if (responsiveOverrides.xl) classes += ` xl:${responsiveOverrides.xl}`;
  }
  
  return classes;
}

// 动画样式生成器
export function createAnimationStyles(
  animation: keyof typeof STYLES.animation,
  duration = 'duration-300',
  additionalClasses?: string
) {
  const animationClasses = STYLES.animation[animation];
  
  return cn(animationClasses, duration, additionalClasses);
}

// 状态样式生成器
export function createStatusStyles(
  status: keyof typeof STYLES.status,
  additionalClasses?: string
) {
  return cn(STYLES.status[status], additionalClasses);
}

// 布局样式生成器
export function createLayoutStyles(
  type: keyof typeof STYLES.layout.flex = 'center',
  additionalClasses?: string
) {
  return cn(STYLES.layout.flex[type], additionalClasses);
}