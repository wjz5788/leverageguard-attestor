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

// 分析函数
function analyzeBrackets(script) {
  const lines = script.split('\n');
  let parens = []; // 存储圆括号的位置和类型
  let braces = []; // 存储大括号的位置和类型
  let brackets = []; // 存储方括号的位置和类型
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      // 简单的括号匹配检查
      if (char === '(') {
        parens.push({ type: '(', line: i + 1, col: j + 1 });
      } else if (char === ')') {
        if (parens.length > 0 && parens[parens.length - 1].type === '(') {
          parens.pop();
        } else {
          parens.push({ type: ')', line: i + 1, col: j + 1 });
        }
      } else if (char === '{') {
        braces.push({ type: '{', line: i + 1, col: j + 1 });
      } else if (char === '}') {
        if (braces.length > 0 && braces[braces.length - 1].type === '{') {
          braces.pop();
        } else {
          braces.push({ type: '}', line: i + 1, col: j + 1 });
        }
      } else if (char === '[') {
        brackets.push({ type: '[', line: i + 1, col: j + 1 });
      } else if (char === ']') {
        if (brackets.length > 0 && brackets[brackets.length - 1].type === '[') {
          brackets.pop();
        } else {
          brackets.push({ type: ']', line: i + 1, col: j + 1 });
        }
      }
    }
  }
  
  return { parens, braces, brackets };
}

// 检查第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6];
  console.log('\n检查第7个脚本块的括号平衡...');
  
  const analysis = analyzeBrackets(targetScript);
  
  console.log(`\n圆括号状态: ${analysis.parens.length} 个不平衡`);
  console.log(`大括号状态: ${analysis.braces.length} 个不平衡`);
  console.log(`方括号状态: ${analysis.brackets.length} 个不平衡`);
  
  // 尝试添加括号直到平衡
  console.log('\n尝试添加括号直到平衡...');
  let balancedScript = targetScript;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const currentAnalysis = analyzeBrackets(balancedScript);
    
    if (currentAnalysis.parens.length === 0 && 
        currentAnalysis.braces.length === 0 && 
        currentAnalysis.brackets.length === 0) {
      console.log(`成功在第 ${attempts} 次尝试后平衡括号`);
      break;
    }
    
    // 根据不平衡情况添加相应的括号
    if (currentAnalysis.parens.length > 0 && currentAnalysis.parens[currentAnalysis.parens.length - 1].type === '(') {
      balancedScript += ')';
      console.log('添加了一个闭圆括号');
    } else if (currentAnalysis.braces.length > 0 && currentAnalysis.braces[currentAnalysis.braces.length - 1].type === '{') {
      balancedScript += '}';
      console.log('添加了一个闭大括号');
    } else if (currentAnalysis.brackets.length > 0 && currentAnalysis.brackets[currentAnalysis.brackets.length - 1].type === '[') {
      balancedScript += ']';
      console.log('添加了一个闭方括号');
    } else {
      // 如果无法确定，就添加一个闭圆括号
      balancedScript += ')';
      console.log('添加了一个闭圆括号（默认）');
    }
    
    attempts++;
  }
  
  // 保存修复后的文件
  const targetOffset = scriptOffsets[6];
  const beforeScript = htmlContent.substring(0, targetOffset.start);
  const scriptTagStart = targetOffset.fullMatch.substring(0, targetOffset.fullMatch.indexOf('>') + 1);
  const scriptTagEnd = targetOffset.fullMatch.substring(targetOffset.fullMatch.lastIndexOf('<'));
  const newScriptBlock = scriptTagStart + balancedScript + scriptTagEnd;
  const afterScript = htmlContent.substring(targetOffset.end);
  
  const newHtmlContent = beforeScript + newScriptBlock + afterScript;
  
  const fixedPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_fixed.html';
  fs.writeFileSync(fixedPath, newHtmlContent, 'utf8');
  console.log(`\n修复后的文件已保存到: ${fixedPath}`);
  console.log(`添加了 ${attempts} 个闭括号`);
}

console.log('\n分析和修复完成');