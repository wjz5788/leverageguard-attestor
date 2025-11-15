/**
 * TailwindCSS 配置验证和更新工具
 * 确保项目中的TailwindCSS配置一致且优化
 */

import fs from 'fs';
import path from 'path';

// 推荐的TailwindCSS配置
export const RECOMMENDED_TAILWIND_CONFIG = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.vue",
    "./src/**/*.svelte"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['Fira Code', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-in': 'bounceIn 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};

// 需要检查的关键配置项
const CRITICAL_CONFIG_CHECKS = [
  {
    key: 'content',
    message: '确保 content 配置包含所有源文件路径',
    validator: (config: any) => {
      const content = config.content || config.purge;
      return Array.isArray(content) && content.length > 0;
    }
  },
  {
    key: 'theme.extend.colors.primary',
    message: '建议配置 primary 颜色主题',
    validator: (config: any) => {
      return config?.theme?.extend?.colors?.primary !== undefined;
    },
    recommended: true
  },
  {
    key: 'theme.extend.animation',
    message: '建议配置自定义动画',
    validator: (config: any) => {
      return config?.theme?.extend?.animation !== undefined;
    },
    recommended: true
  }
];

// 配置问题类型
export interface ConfigIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  key: string;
  recommended?: boolean;
  fix?: string;
}

// 验证TailwindCSS配置
export function validateTailwindConfig(configPath: string): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  try {
    // 读取配置文件
    const configContent = fs.readFileSync(configPath, 'utf-8');
    
    // 简单的配置检查（实际项目中可能需要更复杂的解析）
    const config = eval(configContent.replace('module.exports = ', ''));

    // 检查关键配置项
    CRITICAL_CONFIG_CHECKS.forEach(check => {
      if (!check.validator(config)) {
        issues.push({
          type: check.recommended ? 'warning' : 'error',
          message: check.message,
          key: check.key,
          recommended: check.recommended,
          fix: check.recommended ? `添加 ${check.key} 配置` : undefined
        });
      }
    });

    // 检查是否有过时的配置
    if (config.purge && !config.content) {
      issues.push({
        type: 'warning',
        message: '检测到旧的 purge 配置，建议使用新的 content 配置',
        key: 'purge',
        fix: '将 purge 替换为 content'
      });
    }

    // 检查插件配置
    if (!Array.isArray(config.plugins)) {
      issues.push({
        type: 'info',
        message: '未配置 TailwindCSS 插件',
        key: 'plugins',
        fix: '可以添加需要的插件，如 @tailwindcss/forms'
      });
    }

  } catch (error) {
    issues.push({
      type: 'error',
      message: `读取配置文件失败: ${error}`,
      key: 'config-file',
    });
  }

  return issues;
}

// 更新TailwindCSS配置
export function updateTailwindConfig(configPath: string, issues: ConfigIssue[]): void {
  try {
    let configContent = fs.readFileSync(configPath, 'utf-8');
    
    // 这里可以实现自动修复逻辑
    // 为简化，我们创建一个推荐的配置文件
    const recommendedConfig = `/** @type {import('tailwindcss').Config} */
module.exports = ${JSON.stringify(RECOMMENDED_TAILWIND_CONFIG, null, 2)}`;

    // 备份原配置文件
    const backupPath = `${configPath}.backup.${Date.now()}`;
    fs.writeFileSync(backupPath, configContent);
    
    // 写入新配置
    fs.writeFileSync(configPath, recommendedConfig);
    
    console.log(`配置已更新，备份文件保存在: ${backupPath}`);
    
  } catch (error) {
    throw new Error(`更新配置文件失败: ${error}`);
  }
}

// 扫描项目中的TailwindCSS使用问题
export function scanForTailwindIssues(projectPath: string): string[] {
  const issues: string[] = [];
  
  try {
    // 扫描常见的样式问题
    const scanPatterns = [
      {
        pattern: /class(Name)?=\{[^}]*\}/g,
        message: '检测到动态类名，可能导致样式丢失'
      },
      {
        pattern: /style=/g,
        message: '检测到内联样式，建议使用 TailwindCSS 类名'
      },
      {
        pattern: /hover:(bg|text)-\w+-\d+/g,
        message: '检测到 hover 状态样式，建议检查一致性'
      }
    ];

    // 简单的文件扫描逻辑
    function scanDirectory(dir: string): void {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          scanDirectory(filePath);
        } else if (stat.isFile() && /\.(tsx?|jsx?|vue|svelte)$/.test(file)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            
            scanPatterns.forEach(({ pattern, message }) => {
              if (pattern.test(content)) {
                issues.push(`${filePath}: ${message}`);
              }
            });
          } catch (error) {
            console.warn(`无法读取文件 ${filePath}: ${error}`);
          }
        }
      });
    }
    
    scanDirectory(projectPath);
    
  } catch (error) {
    issues.push(`扫描项目失败: ${error}`);
  }
  
  return issues;
}

// 生成样式一致性报告
export function generateStyleReport(projectPath: string): string {
  const report: string[] = [];
  
  report.push('# TailwindCSS 样式一致性报告\n');
  report.push(`生成时间: ${new Date().toLocaleString()}\n`);
  
  // 配置文件检查
  const configPath = path.join(projectPath, 'tailwind.config.js');
  if (fs.existsSync(configPath)) {
    const issues = validateTailwindConfig(configPath);
    
    if (issues.length > 0) {
      report.push('## 配置文件问题\n');
      issues.forEach(issue => {
        const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
        report.push(`${icon} ${issue.message}`);
        if (issue.fix) {
          report.push(`   建议: ${issue.fix}`);
        }
        report.push('');
      });
    } else {
      report.push('✅ 配置文件检查通过\n');
    }
  } else {
    report.push('❌ 未找到 tailwind.config.js 配置文件\n');
  }
  
  // 扫描项目中的样式问题
  const styleIssues = scanForTailwindIssues(path.join(projectPath, 'src'));
  if (styleIssues.length > 0) {
    report.push('## 代码中的样式问题\n');
    styleIssues.forEach(issue => {
      report.push(`⚠️ ${issue}`);
    });
    report.push('');
  } else {
    report.push('✅ 未检测到明显的样式问题\n');
  }
  
  // 推荐配置
  report.push('## 推荐配置\n');
  report.push('```javascript');
  report.push('/** @type {import(\'tailwindcss\').Config} */');
  report.push('module.exports = {');
  report.push('  content: [');
  report.push('    "./index.html",');
  report.push('    "./src/**/*.{js,ts,jsx,tsx}",');
  report.push('  ],');
  report.push('  theme: {');
  report.push('    extend: {');
  report.push('      colors: {');
  report.push('        primary: {');
  report.push('          50: \'#eff6ff\',');
  report.push('          500: \'#3b82f6\',');
  report.push('          600: \'#2563eb\',');
  report.push('          700: \'#1d4ed8\',');
  report.push('        },');
  report.push('      },');
  report.push('    },');
  report.push('  },');
  report.push('  plugins: [],');
  report.push('};');
  report.push('```\n');
  
  return report.join('\n');
}

// 自动修复常见的样式问题
export function autoFixStyleIssues(filePath: string): string[] {
  const fixes: string[] = [];
  
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    
    // 修复常见的类名不一致问题
    const fixesMap = [
      {
        pattern: /className="bg-gray-100 hover:bg-gray-200"/g,
        replacement: 'className={cn("bg-gray-100 hover:bg-gray-200")}',
        description: '使用 cn() 工具函数包装动态类名'
      },
      {
        pattern: /style=\{\{[^}]+\}\}/g,
        replacement: (match: string) => {
          // 简单的内联样式到TailwindCSS转换
          if (match.includes('display: flex')) {
            modified = true;
            fixes.push('转换 flex 布局为 TailwindCSS 类名');
            return 'className="flex"';
          }
          return match;
        },
        description: '转换内联样式为 TailwindCSS 类名'
      }
    ];
    
    fixesMap.forEach(({ pattern, replacement, description }) => {
      if (typeof replacement === 'string') {
        if (pattern.test(content)) {
          content = content.replace(pattern, replacement);
          modified = true;
          fixes.push(description);
        }
      } else {
        const originalContent = content;
        content = content.replace(pattern, replacement as any);
        if (content !== originalContent) {
          modified = true;
        }
      }
    });
    
    if (modified) {
      // 备份原文件
      const backupPath = `${filePath}.backup.${Date.now()}`;
      fs.writeFileSync(backupPath, fs.readFileSync(filePath, 'utf-8'));
      
      // 写入修复后的内容
      fs.writeFileSync(filePath, content);
      fixes.push(`文件已修复，备份保存在: ${backupPath}`);
    }
    
  } catch (error) {
    fixes.push(`修复文件失败: ${error}`);
  }
  
  return fixes;
}