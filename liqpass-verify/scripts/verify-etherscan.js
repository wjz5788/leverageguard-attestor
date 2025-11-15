import { execSync } from "child_process";
import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const contractAddress = "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709";
const apiKey = process.env.BASESCAN_API_KEY;

// 读取合约源码
const sourceCode = readFileSync("./contracts/CheckoutUSDC.sol", "utf8");

// 读取构造参数
const { default: args } = await import("./args.js");
console.log("构造参数:", args);

// 手动编码构造参数 - 两个地址参数
const usdcAddress = "0x833589fCd6EDb6E08F4c7C32D4F71B54bDa02913";
const treasuryAddress = "0x9aEA8865A46A37a9dB738fD0F1eE2bED49D143F1";

// 手动创建构造参数的十六进制编码
const encodedArgs = "000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913" +
                   "0000000000000000000000009aea8865a46a37a9db738fd0f1ee2bed49d143f1";

console.log("编码的构造参数:", encodedArgs);

// 构建验证请求的URL参数
const params = new URLSearchParams({
  apikey: apiKey,
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
});

console.log("正在提交合约验证请求...");

// 使用curl发送POST请求
try {
  // 尝试使用V2 API端点
  const response = execSync(`curl -X POST "https://api.basescan.org/api?module=contract&action=verifysourcecode" -H "Content-Type: application/x-www-form-urlencoded" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" -d "${params.toString()}"`, { encoding: 'utf8' });
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
  console.log("等待10秒后检查验证状态...");
  setTimeout(() => {
    try {
      const statusResponse = execSync(`curl "https://api.basescan.org/api?apikey=${apiKey}&module=contract&action=checkverifystatus&guid=${guid}"`, { encoding: 'utf8' });
      console.log("验证状态:", statusResponse);
      
      const statusResult = JSON.parse(statusResponse);
      if (statusResult.status === "1") {
        console.log("✅ 合约验证成功!");
      } else {
        console.error("❌ 合约验证失败:", statusResult.message, statusResult.result);
      }
    } catch (error) {
      console.error("检查验证状态出错:", error);
    }
  }, 10000);
  
} catch (error) {
  console.error("验证请求出错:", error);
  process.exit(1);
}