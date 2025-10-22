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
let lastIndex = 0;
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

// 检查第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  console.log('\n检查第7个脚本块...');
  
  // 尝试修复括号问题 - 添加一个闭括号
  console.log('尝试在脚本块末尾添加一个闭括号...');
  const newScriptContent = targetScript + ')';
  
  // 替换原文件中的脚本块
  const targetOffset = scriptOffsets[6];
  const beforeScript = htmlContent.substring(0, targetOffset.start);
  const scriptTagStart = targetOffset.fullMatch.substring(0, targetOffset.fullMatch.indexOf('>') + 1);
  const scriptTagEnd = targetOffset.fullMatch.substring(targetOffset.fullMatch.lastIndexOf('<'));
  const newScriptBlock = scriptTagStart + newScriptContent + scriptTagEnd;
  const afterScript = htmlContent.substring(targetOffset.end);
  
  const newHtmlContent = beforeScript + newScriptBlock + afterScript;
  
  // 保存修复后的文件
  const fixedPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_fixed.html';
  fs.writeFileSync(fixedPath, newHtmlContent, 'utf8');
  console.log(`\n修复后的文件已保存到: ${fixedPath}`);
  console.log('请尝试打开修复后的文件以验证是否解决了语法错误');
}

console.log('\n修复完成');