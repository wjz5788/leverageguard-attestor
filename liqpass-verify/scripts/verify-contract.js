import { execSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 合约地址
const contractAddress = "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709";

// 从原始args.js文件获取构造参数
const constructorArgs = [
  "0x833589fCd6EDB6E08F4c7C32D4F71B54bDa02913", // USDC 地址
  "0x9aEA8865A46A37a9dB738fD0F1eE2bED49D143F1"  // Treasury 地址
];

// 编码构造参数，使用原始地址格式
const ethers = require('ethers');
const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
  ['address', 'address'], 
  constructorArgs
).slice(2);

// 读取合约源码
const sourceCode = fs.readFileSync('./contracts/CheckoutUSDC.sol', 'utf8');

// 构建验证请求
const requestData = {
  apikey: "VHYN2NTDMRM2NWV9FUHR2NJ2M92KQ6FQQC",
  module: "contract",
  action: "verifysourcecode",
  contractaddress: contractAddress,
  sourceCode: sourceCode,
  codeformat: "solidity-single-file",
  contractname: "CheckoutUSDC",
  compilerversion: "v0.8.24+commit.e11b9ed9",
  optimizationUsed: 1,
  runs: 200,
  constructorArguements: encodedArgs
};

// 将请求转换为表单数据格式
const formData = new URLSearchParams();
Object.entries(requestData).forEach(([key, value]) => {
  formData.append(key, value);
});

console.log("正在提交合约验证请求...");

// 发送请求
try {
  const response = execSync(`curl -X POST "https://api.basescan.org/api" -d "${formData.toString()}"`, { encoding: 'utf8' });
  console.log("验证请求响应:", response);
  
  // 解析响应获取GUID
  const result = JSON.parse(response);
  if (result.status === "0") {
    console.error("验证请求失败:", result.message);
    process.exit(1);
  }
  
  const guid = result.result;
  console.log("验证请求已提交，GUID:", guid);
  
  // 等待几秒后检查验证状态
  console.log("等待5秒后检查验证状态...");
  setTimeout(() => {
    const statusResponse = execSync(`curl "https://api.basescan.org/api?apikey=VHYN2NTDMRM2NWV9FUHR2NJ2M92KQ6FQQC&module=contract&action=checkverifystatus&guid=${guid}"`, { encoding: 'utf8' });
    console.log("验证状态:", statusResponse);
  }, 5000);
  
} catch (error) {
  console.error("验证请求出错:", error);
  process.exit(1);
}