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

// 检查并修复第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  const lines = targetScript.split('\n');
  console.log(`\n第7个脚本块有 ${lines.length} 行`);
  
  // 显示第1-15行的代码
  console.log('\n显示第1-15行的代码:');
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
  
  // 检查第1-7行是否有多余的右括号
  let prefixCode = '';
  for (let i = 0; i < 7; i++) {
    if (i < lines.length) {
      prefixCode += lines[i] + '\n';
    }
  }
  
  console.log('\n检查第1-7行的括号平衡...');
  let openParens = 0;
  let closeParens = 0;
  
  for (let char of prefixCode) {
    if (char === '(') openParens++;
    else if (char === ')') closeParens++;
  }
  
  console.log(`开括号数量: ${openParens}, 闭括号数量: ${closeParens}`);
  
  // 创建修复后的脚本块
  let fixedScript = '';
  
  // 如果闭括号比开括号多，说明有多余的右括号
  if (closeParens > openParens) {
    console.log(`发现多余的 ${closeParens - openParens} 个右括号`);
    console.log('尝试修复...');
    
    // 从第1行开始重新构建脚本，尝试移除多余的右括号
    let fixedLines = [];
    let parenCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let modifiedLine = '';
      
      for (let char of line) {
        if (char === '(') {
          parenCount++;
          modifiedLine += char;
        } else if (char === ')') {
          // 只有当parenCount > 0时才添加右括号，否则跳过多余的右括号
          if (parenCount > 0) {
            parenCount--;
            modifiedLine += char;
          } else {
            console.log(`在第 ${i + 1} 行移除多余的右括号`);
          }
        } else {
          modifiedLine += char;
        }
      }
      
      fixedLines.push(modifiedLine);
    }
    
    fixedScript = fixedLines.join('\n');
  } else {
    console.log('括号平衡正常，尝试重新格式化第8行附近的代码');
    // 如果括号平衡正常，尝试重新格式化第8行附近的代码
    fixedScript = lines.join('\n');
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
}

console.log('\n修复完成');