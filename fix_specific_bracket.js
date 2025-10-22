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

// 检查第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  console.log('\n检查第7个脚本块...');
  
  // 显示第7个脚本块的开头部分
  const firstFewLines = targetScript.split('\n').slice(0, 20).join('\n');
  console.log('\n脚本块开头内容:');
  console.log(firstFewLines);
  
  // 检查开头是否有多余的右括号
  console.log('\n检查开头是否有多余的右括号...');
  
  // 移除开头可能存在的多余右括号
  let fixedScript = targetScript;
  
  // 检查是否以右括号开头
  if (fixedScript.trim().startsWith(')')) {
    console.log('发现脚本块以右括号开头，尝试移除...');
    fixedScript = fixedScript.trim().substring(1).trimLeft();
  }
  
  // 也检查是否有多个连续的右括号
  const leadingParensMatch = fixedScript.trim().match(/^\)+/);
  if (leadingParensMatch) {
    console.log(`发现开头有 ${leadingParensMatch[0].length} 个连续的右括号，尝试移除...`);
    fixedScript = fixedScript.trim().substring(leadingParensMatch[0].length).trimLeft();
  }
  
  // 保存修复后的文件
  const targetOffset = scriptOffsets[6];
  const beforeScript = htmlContent.substring(0, targetOffset.start);
  const scriptTagStart = targetOffset.fullMatch.substring(0, targetOffset.fullMatch.indexOf('>') + 1);
  const scriptTagEnd = targetOffset.fullMatch.substring(targetOffset.fullMatch.lastIndexOf('<'));
  const newScriptBlock = scriptTagStart + fixedScript + scriptTagEnd;
  const afterScript = htmlContent.substring(targetOffset.end);
  
  const newHtmlContent = beforeScript + newScriptBlock + afterScript;
  
  const fixedPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_fixed.html';
  fs.writeFileSync(fixedPath, newHtmlContent, 'utf8');
  console.log(`\n修复后的文件已保存到: ${fixedPath}`);
  console.log('尝试移除开头可能存在的多余右括号');
}

console.log('\n分析和修复完成');