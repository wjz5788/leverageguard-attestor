import { execSync } from 'child_process';
import fs from 'fs';

// 合约地址
const contractAddress = "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709";

// 读取合约源码
const sourceCode = fs.readFileSync('./contracts/CheckoutUSDC.sol', 'utf8');

// 构造参数编码 (手动计算)
const constructorArgs = "000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda029130000000000000000000000009aea8865a46a37a9db738fd0f1ee2bed49d143f1";

console.log("正在提交合约验证请求...");

// 使用V2 API
try {
  const response = execSync(`curl -X POST "https://api.basescan.org/api" \
    -H "Content-Type: application/json" \
    -d '{
      "apikey": "VHYN2NTDMRM2NWV9FUHR2NJ2M92KQ6FQQC",
      "module": "contract",
      "action": "verifysourcecode",
      "contractaddress": "${contractAddress}",
      "sourceCode": ${JSON.stringify(sourceCode)},
      "codeformat": "solidity-single-file",
      "contractname": "CheckoutUSDC",
      "compilerversion": "v0.8.24+commit.e11b9ed9",
      "optimizationUsed": 1,
      "runs": 200,
      "constructorArguements": "${constructorArgs}"
    }'`, { encoding: 'utf8' });
  
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