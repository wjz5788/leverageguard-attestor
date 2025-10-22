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

// 修复第7个脚本块中的第43行附近的问题
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  const lines = targetScript.split('\n');
  console.log(`\n检查第7个脚本块的第43行附近...`);
  
  // 显示第43行前后的代码
  console.log('错误位置附近的代码:');
  const contextStart = Math.max(0, 40);
  const contextEnd = Math.min(lines.length, 46);
  
  for (let i = contextStart; i < contextEnd; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
  
  // 检查第42行和第43行之间是否有语法问题
  // 一个常见问题是前面的代码缺少分号或括号
  console.log('\n尝试修复前面的常量定义部分...');
  
  // 确保所有常量定义都有分号
  let fixedLines = [...lines];
  
  // 检查并修复第40-42行附近的常量定义
  for (let i = 37; i <= 42; i++) {
    if (i < fixedLines.length) {
      const line = fixedLines[i];
      // 检查是否是常量定义行
      if (line.trim().startsWith('const ') && !line.trim().endsWith(';')) {
        console.log(`在第 ${i + 1} 行添加缺失的分号: ${line.trim()}`);
        fixedLines[i] = line.trim() + ';';
      }
    }
  }
  
  // 重新组合脚本内容
  let fixedScript = fixedLines.join('\n');
  
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
  console.log('已尝试在常量定义行添加缺失的分号');
}

console.log('\n修复完成');