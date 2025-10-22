const fs = require('fs');

// 读取HTML文件
const htmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 查找所有script标签内容
const scriptRegex = /<script[^>]*>\s*([\s\S]*?)\s*<\/script>/g;
let match;
let scripts = [];

console.log('开始分析HTML文件...');

// 收集所有脚本块
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  scripts.push(match[1]);
}

console.log(`找到 ${scripts.length} 个脚本块`);

// 检查第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  const lines = targetScript.split('\n');
  console.log(`\n第7个脚本块有 ${lines.length} 行`);
  
  // 尝试二分查找找到错误位置
  console.log('\n使用二分查找定位语法错误...');
  
  let start = 0;
  let end = lines.length;
  let errorLine = -1;
  
  while (start < end) {
    const mid = Math.floor((start + end) / 2);
    const testCode = lines.slice(0, mid + 1).join('\n');
    
    try {
      // 尝试使用Function构造函数检查语法
      new Function(testCode);
      // 如果没有错误，错误在后面的部分
      start = mid + 1;
    } catch (error) {
      if (error instanceof SyntaxError) {
        // 如果有错误，错误在前面的部分
        end = mid;
        errorLine = mid + 1;
      }
    }
  }
  
  if (errorLine !== -1) {
    console.log(`\n找到可能的错误位置：第 ${errorLine} 行`);
    console.log('\n错误上下文（前后5行）：');
    
    const contextStart = Math.max(0, errorLine - 6);
    const contextEnd = Math.min(lines.length, errorLine + 5);
    
    for (let i = contextStart; i < contextEnd; i++) {
      const prefix = (i === errorLine - 1) ? '>> ' : '   ';
      console.log(`${prefix}${i + 1}: ${lines[i]}`);
    }
  }
  
  // 尝试修复：移除第7个脚本块，替换为一个简化版本，只包含基本功能
  console.log('\n尝试创建一个简化版本的第7个脚本块...');
  
  // 创建一个最小化的脚本块，只包含基本功能
  const minimalScript = `
// React 和 ReactDOM
const React = window.React;
const { useState, useEffect, useRef, createContext, useContext } = React;
const { createRoot } = ReactDOM;

// 简单的应用组件
function App() {
  const [locale, setLocale] = useState('en');
  
  return React.createElement('div', { className: 'min-h-screen bg-gray-50' },
    React.createElement('h1', null, '应用已加载'),
    React.createElement('p', null, '正在修复语法错误...')
  );
}

// 渲染应用
if (typeof window !== "undefined") {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(React.createElement(App));
  }
}
`;
  
  // 替换HTML文件中的第7个脚本块
  let scriptCount = 0;
  const fixedHtml = htmlContent.replace(scriptRegex, (match, scriptContent) => {
    scriptCount++;
    if (scriptCount === 7) {
      return match.replace(scriptContent, minimalScript);
    }
    return match;
  });
  
  // 保存修复后的HTML文件
  const fixedHtmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_minimal.html';
  fs.writeFileSync(fixedHtmlPath, fixedHtml, 'utf8');
  console.log(`\n最小化版本已保存到: ${fixedHtmlPath}`);
  console.log('这个版本移除了复杂的第7个脚本块，替换为一个简单的版本，以便我们可以确认是否是第7个脚本块导致的问题');
}

console.log('\n分析完成');