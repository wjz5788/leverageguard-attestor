const fs = require('fs');

// 读取HTML文件
const htmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final.html';
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 提取所有script标签中的内容
const scriptRegex = /<script[^>]*>\s*([\s\S]*?)\s*<\/script>/g;
let match;
let scripts = [];

// 收集所有脚本块
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  scripts.push(match[1]);
}

// 获取第7个脚本块
const script7 = scripts[6];
const lines = script7.split('\n');

console.log('开始逐行检查括号匹配...');
console.log(`脚本块共有 ${lines.length} 行`);

let parenCount = 0;
let braceCount = 0;
let bracketCount = 0;
let errorFound = false;

// 逐行检查并记录括号计数
for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];
  let lineParenCount = 0;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '(') {
      parenCount++;
      lineParenCount++;
    } else if (char === ')') {
      parenCount--;
      lineParenCount--;
    } else if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
    } else if (char === '[') {
      bracketCount++;
    } else if (char === ']') {
      bracketCount--;
    }
  }
  
  // 记录每一行的括号变化
  if (lineParenCount !== 0) {
    console.log(`第 ${lineNum + 1} 行: 括号变化 ${lineParenCount}, 累计: ${parenCount} | ${line.trim()}`);
  }
  
  // 检查是否出现负数
  if (parenCount < 0) {
    console.log(`\n错误！第 ${lineNum + 1} 行: 出现多余的右括号 )`);
    console.log(`当前行内容: ${line}`);
    errorFound = true;
    break;
  }
}

if (!errorFound) {
  console.log('\n没有发现多余的右括号，但最终括号计数不平衡');
  console.log(`最终圆括号计数: ${parenCount}`);
  
  // 尝试找到可能的问题区域
  console.log('\n尝试找到可能的问题区域（函数定义附近）:');
  for (let lineNum = 0; lineNum < Math.min(lines.length, 200); lineNum++) {
    const line = lines[lineNum];
    if (line.includes('function') || line.includes('useState')) {
      console.log(`第 ${lineNum + 1} 行: ${line.trim()}`);
    }
  }
}

console.log('\n检查完成');