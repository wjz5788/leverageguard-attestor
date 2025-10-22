const fs = require('fs');
const path = require('path');

// 读取HTML文件
const htmlPath = '/Users/zhaomosheng/Desktop/100x/liqpass_combined_final.html';
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 提取所有script标签中的内容
const scriptRegex = /<script[^>]*>\s*([\s\S]*?)\s*<\/script>/g;
let match;
let scriptIndex = 0;
let scripts = [];

console.log('开始检查JavaScript语法...');

// 先收集所有脚本块
while ((match = scriptRegex.exec(htmlContent)) !== null) {
  scriptIndex++;
  scripts.push({
    index: scriptIndex,
    content: match[1]
  });
  console.log(`找到脚本块 ${scriptIndex}`);
}

// 特别检查第7个脚本块
if (scripts.length >= 7) {
  const targetScript = scripts[6]; // 索引从0开始
  console.log(`\n检查脚本块 ${targetScript.index}:`);
  
  // 检查整体括号平衡
  console.log('\n检查整体括号平衡:');
  let parenCount = 0;
  let braceCount = 0;
  let bracketCount = 0;
  
  for (let i = 0; i < targetScript.content.length; i++) {
    const char = targetScript.content[i];
    
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }
  
  console.log(`括号检查结果:`);
  console.log(`圆括号: ${parenCount} (应该为0)`);
  console.log(`大括号: ${braceCount} (应该为0)`);
  console.log(`方括号: ${bracketCount} (应该为0)`);
  
  // 尝试直接编译检查
  try {
    console.log('\n尝试直接编译检查...');
    new Function(targetScript.content);
    console.log('✓ 语法检查通过！');
  } catch (error) {
    console.log(`✗ 语法检查失败: ${error.message}`);
  }
}

console.log('\n语法检查完成');