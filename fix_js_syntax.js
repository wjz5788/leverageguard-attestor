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
  
  // 逐行尝试解析，找出错误所在行
  const lines = targetScript.split('\n');
  let accumulatedCode = '';
  let errorLine = -1;
  let errorColumn = -1;
  
  console.log('逐行解析代码以查找错误...');
  
  for (let i = 0; i < lines.length; i++) {
    accumulatedCode += lines[i] + '\n';
    
    try {
      // 尝试使用Function构造函数来检查语法
      new Function(accumulatedCode);
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.log(`错误在第 ${i + 1} 行: ${error.message}`);
        errorLine = i + 1;
        
        // 尝试提取错误列
        const columnMatch = error.message.match(/column (\d+)/);
        if (columnMatch) {
          errorColumn = parseInt(columnMatch[1], 10);
        }
        
        // 显示错误行及其前后几行
        console.log('\n错误上下文:');
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        
        for (let j = start; j < end; j++) {
          const prefix = (j === i) ? '>> ' : '   ';
          console.log(`${prefix}${j + 1}: ${lines[j]}`);
          
          // 在错误行下方显示错误位置
          if (j === i && errorColumn > 0) {
            const pointer = ' '.repeat(errorColumn) + '^';
            console.log(`   ${pointer}`);
          }
        }
        
        break;
      }
    }
  }
  
  // 尝试另一种修复方法：在第7个脚本块中查找所有useState调用，确保它们都正确闭合
  console.log('\n尝试修复所有useState调用...');
  
  // 查找并修复所有useState调用
  let fixedScript = targetScript;
  const useStateRegex = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\(([^)]*)\)(?!;)/g;
  fixedScript = fixedScript.replace(useStateRegex, 'const [$1, $2] = useState($3);');
  
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
  console.log('尝试在useState调用后添加缺失的分号');
}

console.log('\n分析和修复完成');