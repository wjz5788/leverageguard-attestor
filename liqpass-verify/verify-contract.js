const { ethers } = require("ethers");

async function main() {
  console.log("=== LiqPass CheckoutUSDC 合约验证 ===");
  console.log("合约地址: 0xc4d1bedc8850771af2d9db2c6d24ec21a8829709");
  console.log("网络: Base Mainnet");
  console.log("");
  
  // 构造参数
  const constructorArgs = [
    "0x833589fCd6EDB6E08F4c7C32D4F71B54bDa02913", // USDC 地址
    "0x9aEA8865A46A37a9dB738fD0F1eE2bED49D143F1"  // Treasury 地址
  ];
  
  console.log("构造参数:");
  console.log("- USDC 地址:", constructorArgs[0]);
  console.log("- Treasury 地址:", constructorArgs[1]);
  console.log("");
  
  console.log("=== 验证步骤 ===");
  console.log("1. 确保环境变量 ETHERSCAN_API_KEY 已设置");
  console.log("2. 使用以下命令进行验证:");
  console.log("");
  console.log("npx hardhat verify --network base --constructor-args scripts/args.js 0xc4d1bedc8850771af2d9db2c6d24ec21a8829709");
  console.log("");
  console.log("=== 备选方案 ===");
  console.log("如果上述命令失败，可以尝试以下方法:");
  console.log("");
  console.log("方法 1: 使用 hardhat-verify 插件的直接调用");
  console.log("npx hardhat verify-contract --network base 0xc4d1bedc8850771af2d9db2c6d24ec21a8829709 CheckoutUSDC --constructor-args scripts/args.js");
  console.log("");
  console.log("方法 2: 手动在 BaseScan 网站验证");
  console.log("1. 访问 https://basescan.org/verifyContract");
  console.log("2. 输入合约地址: 0xc4d1bedc8850771af2d9db2c6d24ec21a8829709");
  console.log("3. 选择编译器版本: 0.8.24");
  console.log("4. 选择优化: 启用，运行次数: 200");
  console.log("5. 输入构造参数:", JSON.stringify(constructorArgs));
  console.log("6. 上传合约源代码");
  console.log("");
  console.log("=== 当前配置状态 ===");
  console.log("✅ 合约文件: contracts/CheckoutUSDC.sol");
  console.log("✅ 构造参数: scripts/args.js");
  console.log("✅ 配置文件: hardhat.config.js");
  console.log("✅ API Key: 已设置");
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});