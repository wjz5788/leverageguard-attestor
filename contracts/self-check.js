#!/usr/bin/env node

/**
 * 30秒自检脚本 - 验证CheckoutUSDC合约基本功能
 * 使用方法：node self-check.js
 */

const { ethers } = require('ethers');

// 配置参数
const CONFIG = {
  CHECKOUT_USDC_ADDRESS: "0xc423c34b57730ba87fb74b99180663913a345d68",
  USDC_ADDRESS: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  TREASURY_ADDRESS: "0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b",
  RPC_URL: "https://mainnet.base.org",
  TIMEOUT: 30000 // 30秒超时
};

// CheckoutUSDC合约ABI（简化版，仅包含自检需要的函数）
const CHECKOUT_USDC_ABI = [
  "function USDC() public view returns (address)",
  "function treasury() public view returns (address)",
  "function owner() public view returns (address)",
  "function paused() public view returns (bool)",
  "function pause() external",
  "function unpause() external",
  "function updateTreasury(address newTreasury) external",
  "function version() external pure returns (string)",
  "function BASE_USDC() public view returns (address)",
  "function getContractInfo() external view returns (address, address, uint256, bool)"
];

async function main() {
  console.log("🚀 开始30秒自检...\n");
  
  try {
    // 1. 连接Base网络
    console.log("1. 连接Base网络...");
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    await provider.getNetwork();
    console.log("   ✅ 网络连接成功\n");

    // 2. 创建合约实例
    console.log("2. 创建合约实例...");
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, provider);
    console.log("   ✅ 合约实例创建成功\n");

    // 3. 验证合约基本信息
    console.log("3. 验证合约基本信息...");
    
    // 验证USDC地址
    const usdcAddress = await contract.USDC();
    console.log(`   USDC地址: ${usdcAddress}`);
    if (usdcAddress.toLowerCase() === CONFIG.USDC_ADDRESS.toLowerCase()) {
      console.log("   ✅ USDC地址正确");
    } else {
      console.log("   ❌ USDC地址不匹配");
      return;
    }

    // 验证Treasury地址
    const treasuryAddress = await contract.treasury();
    console.log(`   Treasury地址: ${treasuryAddress}`);
    if (treasuryAddress.toLowerCase() === CONFIG.TREASURY_ADDRESS.toLowerCase()) {
      console.log("   ✅ Treasury地址正确");
    } else {
      console.log("   ❌ Treasury地址不匹配");
      return;
    }

    // 验证Owner地址
    const ownerAddress = await contract.owner();
    console.log(`   Owner地址: ${ownerAddress}`);
    console.log("   ✅ Owner地址获取成功");

    // 验证合约版本
    const version = await contract.version();
    console.log(`   合约版本: ${version}`);
    console.log("   ✅ 合约版本获取成功\n");

    // 4. 验证合约状态
    console.log("4. 验证合约状态...");
    const isPaused = await contract.paused();
    console.log(`   合约暂停状态: ${isPaused ? '已暂停' : '运行中'}`);
    console.log("   ✅ 合约状态检查完成\n");

    console.log("🎉 自检完成！所有基础检查通过。");
    console.log("\n📋 下一步：");
    console.log("   • 在Basescan上手动测试pause()/unpause()权限");
    console.log("   • 验证setTreasury()函数（如果有）");
    console.log("   • 准备后端事件监听服务");

  } catch (error) {
    console.error("❌ 自检失败:", error.message);
    process.exit(1);
  }
}

// 运行自检
main().catch(console.error);