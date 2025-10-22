const fs = require('fs');

// 读取HTML文件
const htmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 查找所有script标签内容
const scriptRegex = /<script[^>]*>\s*([\s\S]*?)\s*<\/script>/g;
let match;
let scripts = [];
let scriptOffsets = [];

console.log('开始提取脚本块...');

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

// 保存第7个脚本块到单独文件
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  const scriptPath = '/Users/zhaomosheng/Desktop/100x/script_block_7.js';
  fs.writeFileSync(scriptPath, targetScript, 'utf8');
  console.log(`\n第7个脚本块已保存到: ${scriptPath}`);
  console.log(`脚本块长度: ${targetScript.length} 字符, ${targetScript.split('\n').length} 行`);
  
  // 简单的括号计数检查
  let parenCount = 0;
  let braceCount = 0;
  let bracketCount = 0;
  
  for (let i = 0; i < targetScript.length; i++) {
    const char = targetScript[i];
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }
  
  console.log(`\n括号计数结果:`);
  console.log(`圆括号: ${parenCount} (正数表示多余的开括号，负数表示多余的闭括号)`);
  console.log(`大括号: ${braceCount}`);
  console.log(`方括号: ${bracketCount}`);
  
  // 逐行检查括号平衡，找出第一个不平衡的位置
  console.log('\n逐行检查括号平衡:');
  const lines = targetScript.split('\n');
  let lineParenCount = 0;
  let firstImbalanceLine = -1;
  let firstImbalanceCol = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '(') lineParenCount++;
      if (char === ')') lineParenCount--;
      
      // 检查是否出现负的括号计数（多余的闭括号）
      if (lineParenCount < 0 && firstImbalanceLine === -1) {
        firstImbalanceLine = i + 1;
        firstImbalanceCol = j + 1;
        console.log(`在第 ${firstImbalanceLine} 行第 ${firstImbalanceCol} 列发现多余的闭括号`);
        console.log(`该行内容: ${line}`);
        break;
      }
    }
    if (firstImbalanceLine !== -1) break;
  }
  
  if (firstImbalanceLine === -1) {
    console.log('未发现明显的括号不平衡');
  }
  
  // 尝试一个简单的修复：如果有多余的闭括号，移除第一个多余的闭括号
  if (parenCount < 0) {
    console.log(`\n尝试修复多余的 ${Math.abs(parenCount)} 个闭括号...`);
    let fixedScript = targetScript;
    let removedCount = 0;
    
    for (let i = 0; i < fixedScript.length && removedCount < Math.abs(parenCount); i++) {
      if (fixedScript[i] === ')') {
        fixedScript = fixedScript.substring(0, i) + fixedScript.substring(i + 1);
        removedCount++;
        console.log(`移除了第 ${i + 1} 个字符位置的闭括号`);
      }
    }
    
    // 保存修复后的脚本
    const fixedScriptPath = '/Users/zhaomosheng/Desktop/100x/script_block_7_fixed.js';
    fs.writeFileSync(fixedScriptPath, fixedScript, 'utf8');
    console.log(`修复后的脚本已保存到: ${fixedScriptPath}`);
    
    // 更新HTML文件中的第7个脚本块
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
}

console.log('\n提取和分析完成');