import fs from 'fs';
import { execSync } from 'child_process';

// 合约地址
const contractAddress = "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709";

// 读取合约源码
const sourceCode = fs.readFileSync('./contracts/CheckoutUSDC.sol', 'utf8');

// 创建一个临时文件来存储合约源码
const tempFile = '/tmp/CheckoutUSDC.sol';
fs.writeFileSync(tempFile, sourceCode);

console.log("合约源码已保存到临时文件:", tempFile);
console.log("请手动在以下页面验证合约:");
console.log(`https://basescan.org/verifyContract?a=${contractAddress}`);
console.log("\n验证步骤:");
console.log("1. 打开上述链接");
console.log("2. 选择 'Solidity (Single File)'");
console.log("3. 输入合约地址:", contractAddress);
console.log("4. 编译器版本选择: v0.8.24+commit.e11b9ed9");
console.log("5. 许可证选择: MIT License (MIT)");
console.log("6. 上传合约源码文件或复制粘贴内容");
console.log("7. 确保勾选 'Optimization' 并设置 Runs 为 200");
console.log("8. 构造参数输入: 000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000009aea8865a46a37a9db738fd0f1ee2bed49d143f1");
console.log("9. 点击 'Verify and Publish'");