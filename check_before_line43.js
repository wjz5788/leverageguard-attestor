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
  
  // 逐步检查第43行之前的代码
  console.log('\n逐步检查第43行之前的代码...');
  
  let errorFound = false;
  let accumulatedCode = '';
  
  for (let i = 0; i < 43; i++) {
    if (i >= lines.length) break;
    
    accumulatedCode += lines[i] + '\n';
    
    try {
      // 尝试使用Function构造函数检查语法
      new Function(accumulatedCode);
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.log(`\n在第 ${i + 1} 行发现语法错误: ${error.message}`);
        console.log(`出错的行: ${lines[i]}`);
        
        // 显示更多上下文
        console.log('\n错误上下文（前后3行）:');
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length, i + 4);
        
        for (let j = start; j < end; j++) {
          const prefix = (j === i) ? '>> ' : '   ';
          console.log(`${prefix}${j + 1}: ${lines[j]}`);
        }
        
        errorFound = true;
        break;
      }
    }
  }
  
  if (!errorFound) {
    console.log('\n第43行之前的代码没有明显的语法错误');
    console.log('尝试另一种方法：直接修复第43行之前的代码');
    
    // 创建一个新的修复后的第7个脚本块
    let fixedScript = '';
    
    // 前42行
    for (let i = 0; i < 42; i++) {
      if (i < lines.length) {
        let line = lines[i].trim();
        // 确保所有常量定义都有分号
        if (line.startsWith('const ') && !line.endsWith(';') && !line.includes('//') && !line.includes('/*')) {
          line += ';';
          console.log(`在第 ${i + 1} 行添加缺失的分号: ${line}`);
        }
        fixedScript += line + '\n';
      }
    }
    
    // 从第43行开始的其余代码
    for (let i = 42; i < lines.length; i++) {
      fixedScript += lines[i] + '\n';
    }
    
    // 替换HTML文件中的第7个脚本块
    let scriptCount = 0;
    const fixedHtml = htmlContent.replace(scriptRegex, (match, scriptContent) => {
      scriptCount++;
      if (scriptCount === 7) {
        return match.replace(scriptContent, fixedScript);
      }
      return match;
    });
    
    // 保存修复后的HTML文件
    const fixedHtmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final_fixed.html';
    fs.writeFileSync(fixedHtmlPath, fixedHtml, 'utf8');
    console.log(`\n修复后的HTML文件已保存到: ${fixedHtmlPath}`);
  }
}

console.log('\n分析完成');