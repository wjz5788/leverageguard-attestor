const fs = require('fs');

// 读取HTML文件
const htmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 查找所有script标签内容
const scriptRegex = /<script[^>]*>\s*([\s\S]*?)\s*<\/script>/g;
let match;
let scripts = [];
let scriptOffsets = [];

console.log('开始分析HTML文件...');

// 收集所有脚本块及其在原文件中的位置
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  scriptOffsets.push({
    start: match.index,
    end: match.index + match[0].length,
    content: match[1],
    fullMatch: match[0]
  });
  scripts.push(match[1]);
}

console.log(`找到 ${scripts.length} 个脚本块`);

// 修复第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  const lines = targetScript.split('\n');
  console.log(`\n第7个脚本块有 ${lines.length} 行`);
  
  // 创建一个全新的顶部部分
  const newTopSection = `// React 和 ReactDOM
    const React = window.React;
    const { useState, useEffect, useRef, createContext, useContext } = React;
    const { createRoot } = ReactDOM;

    // 工具函数
    const formatMessage = (template, vars = {}) => {
      return template.replace(/{([^{}]+)}/g, (_, key) => vars[key] || '{' + key + '}');
    };
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const isValidAddress = (address) => /^0x[a-fA-F0-9]{40}$/.test(address);

    // 管理标志检测
    const ADMIN_QS_KEY = 'admin';
    const isAdmin = new URLSearchParams(window.location.search).has(ADMIN_QS_KEY);`;
  
  // 查找顶部部分结束的位置
  let topSectionEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const isAdmin =')) {
      topSectionEndIndex = i;
      break;
    }
  }
  
  console.log(`\n顶部部分结束于第 ${topSectionEndIndex + 1} 行`);
  
  // 创建修复后的脚本
  let fixedScript = '';
  fixedScript += newTopSection + '\n';
  
  // 添加剩余的代码
  for (let i = topSectionEndIndex + 1; i < lines.length; i++) {
    fixedScript += lines[i] + '\n';
  }
  
  // 保存修复后的HTML文件
  const targetOffset = scriptOffsets[6];
  const beforeScript = htmlContent.substring(0, targetOffset.start);
  const scriptTagStart = targetOffset.fullMatch.substring(0, targetOffset.fullMatch.indexOf('>') + 1);
  const scriptTagEnd = targetOffset.fullMatch.substring(targetOffset.fullMatch.lastIndexOf('<'));
  const newScriptBlock = scriptTagStart + fixedScript + scriptTagEnd;
  const afterScript = htmlContent.substring(targetOffset.end);
  
  const newHtmlContent = beforeScript + newScriptBlock + afterScript;
  const fixedHtmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_fixed.html';
  fs.writeFileSync(fixedHtmlPath, newHtmlContent, 'utf8');
  console.log(`\n修复后的HTML文件已保存到: ${fixedHtmlPath}`);
  console.log('已重写脚本顶部部分，移除可能的语法错误');
}

console.log('\n修复完成');