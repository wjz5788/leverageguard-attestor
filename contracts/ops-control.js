#!/usr/bin/env node

/**
 * 运维风控开关脚本
 * 提供合约暂停/恢复、监控告警等功能
 * 使用方法：node ops-control.js --help
 */

const { ethers } = require('ethers');
const { Command } = require('commander');

// 配置参数
const CONFIG = {
  CHECKOUT_USDC_ADDRESS: "0xc423c34b57730ba87fb74b99180663913a345d68",
  RPC_URL: "https://mainnet.base.org",
  PRIVATE_KEY: process.env.OPS_WALLET_PRIVATE_KEY // 运维钱包私钥
};

// CheckoutUSDC合约ABI
const CHECKOUT_USDC_ABI = [
  "function pause() external",
  "function unpause() external",
  "function updateTreasury(address newTreasury) external",
  "function paused() public view returns (bool)",
  "function owner() public view returns (address)",
  "function treasury() public view returns (address)",
  "function emergencyWithdraw(address token, address to, uint256 amount) external"
];

const program = new Command();

program
  .name('ops-control')
  .description('CheckoutUSDC合约运维管理工具')
  .version('1.0.0');

// 检查合约状态命令
program
  .command('status')
  .description('检查合约状态')
  .action(async () => {
    await checkContractStatus();
  });

// 暂停合约命令
program
  .command('pause')
  .description('暂停合约（紧急止损）')
  .action(async () => {
    await pauseContract();
  });

// 恢复合约命令
program
  .command('unpause')
  .description('恢复合约运行')
  .action(async () => {
    await unpauseContract();
  });

// 更新金库地址命令
program
  .command('update-treasury <newTreasury>')
  .description('更新金库地址')
  .action(async (newTreasury) => {
    await updateTreasury(newTreasury);
  });

// 紧急提款命令
program
  .command('emergency-withdraw <token> <to> <amount>')
  .description('紧急提款（仅限非USDC代币）')
  .action(async (token, to, amount) => {
    await emergencyWithdraw(token, to, amount);
  });

// 监控命令
program
  .command('monitor')
  .description('启动实时监控')
  .option('-i, --interval <seconds>', '监控间隔（秒）', '30')
  .action(async (options) => {
    await startMonitoring(parseInt(options.interval));
  });

/**
 * 检查合约状态
 */
async function checkContractStatus() {
  console.log("🔍 检查合约状态...\n");
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, provider);
    
    const isPaused = await contract.paused();
    const owner = await contract.owner();
    const treasury = await contract.treasury();
    
    console.log("📋 合约状态:");
    console.log(`   • 暂停状态: ${isPaused ? '🔴 已暂停' : '🟢 运行中'}`);
    console.log(`   • Owner地址: ${owner}`);
    console.log(`   • Treasury地址: ${treasury}`);
    console.log(`   • 合约地址: ${CONFIG.CHECKOUT_USDC_ADDRESS}`);
    
    // 检查运维钱包权限
    if (CONFIG.PRIVATE_KEY) {
      const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
      const isOwner = wallet.address.toLowerCase() === owner.toLowerCase();
      console.log(`   • 运维钱包权限: ${isOwner ? '🟢 Owner' : '🔴 非Owner'}`);
    }
    
    console.log("\n✅ 状态检查完成");
    
  } catch (error) {
    console.error("❌ 状态检查失败:", error.message);
  }
}

/**
 * 暂停合约
 */
async function pauseContract() {
  console.log("🛑 准备暂停合约...\n");
  
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ 请设置 OPS_WALLET_PRIVATE_KEY 环境变量");
    return;
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, wallet);
    
    // 验证权限
    const owner = await contract.owner();
    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("❌ 当前钱包不是合约Owner，无法执行暂停操作");
      return;
    }
    
    // 检查当前状态
    const isPaused = await contract.paused();
    if (isPaused) {
      console.log("⚠️  合约已处于暂停状态");
      return;
    }
    
    console.log("📝 执行暂停交易...");
    const tx = await contract.pause();
    console.log(`   🔗 交易哈希: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ 暂停成功，区块: ${receipt.blockNumber}`);
    
    // 发送告警通知
    await sendAlert("合约已暂停", `合约已被暂停，交易哈希: ${tx.hash}`);
    
  } catch (error) {
    console.error("❌ 暂停失败:", error.message);
    await sendAlert("合约暂停失败", error.message);
  }
}

/**
 * 恢复合约
 */
async function unpauseContract() {
  console.log("🟢 准备恢复合约...\n");
  
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ 请设置 OPS_WALLET_PRIVATE_KEY 环境变量");
    return;
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, wallet);
    
    // 验证权限
    const owner = await contract.owner();
    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("❌ 当前钱包不是合约Owner，无法执行恢复操作");
      return;
    }
    
    // 检查当前状态
    const isPaused = await contract.paused();
    if (!isPaused) {
      console.log("⚠️  合约已处于运行状态");
      return;
    }
    
    console.log("📝 执行恢复交易...");
    const tx = await contract.unpause();
    console.log(`   🔗 交易哈希: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ 恢复成功，区块: ${receipt.blockNumber}`);
    
    // 发送告警通知
    await sendAlert("合约已恢复", `合约已恢复运行，交易哈希: ${tx.hash}`);
    
  } catch (error) {
    console.error("❌ 恢复失败:", error.message);
    await sendAlert("合约恢复失败", error.message);
  }
}

/**
 * 更新金库地址
 */
async function updateTreasury(newTreasury) {
  console.log("🏦 准备更新金库地址...\n");
  
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ 请设置 OPS_WALLET_PRIVATE_KEY 环境变量");
    return;
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, wallet);
    
    // 验证权限
    const owner = await contract.owner();
    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("❌ 当前钱包不是合约Owner，无法执行更新操作");
      return;
    }
    
    console.log(`   📝 更新金库地址: ${newTreasury}`);
    const tx = await contract.updateTreasury(newTreasury);
    console.log(`   🔗 交易哈希: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ 更新成功，区块: ${receipt.blockNumber}`);
    
    // 发送告警通知
    await sendAlert("金库地址已更新", `金库地址已更新为: ${newTreasury}`);
    
  } catch (error) {
    console.error("❌ 更新失败:", error.message);
    await sendAlert("金库地址更新失败", error.message);
  }
}

/**
 * 紧急提款
 */
async function emergencyWithdraw(token, to, amount) {
  console.log("🚨 准备紧急提款...\n");
  
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ 请设置 OPS_WALLET_PRIVATE_KEY 环境变量");
    return;
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, wallet);
    
    // 验证权限
    const owner = await contract.owner();
    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("❌ 当前钱包不是合约Owner，无法执行紧急提款");
      return;
    }
    
    console.log(`   📝 紧急提款: ${amount} 代币到 ${to}`);
    const tx = await contract.emergencyWithdraw(token, to, amount);
    console.log(`   🔗 交易哈希: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ 提款成功，区块: ${receipt.blockNumber}`);
    
    // 发送告警通知
    await sendAlert("紧急提款执行", `从合约提取 ${amount} 代币到 ${to}`);
    
  } catch (error) {
    console.error("❌ 提款失败:", error.message);
    await sendAlert("紧急提款失败", error.message);
  }
}

/**
 * 启动实时监控
 */
async function startMonitoring(interval) {
  console.log(`🔍 启动实时监控，间隔: ${interval}秒\n`);
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, provider);
    
    let lastBlock = await provider.getBlockNumber();
    
    setInterval(async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        const isPaused = await contract.paused();
        
        console.log(`[${new Date().toISOString()}] 监控状态 - 区块: ${currentBlock}, 暂停: ${isPaused}`);
        
        // 检查新区块
        if (currentBlock > lastBlock) {
          console.log(`   📦 新区块: ${lastBlock + 1} -> ${currentBlock}`);
          lastBlock = currentBlock;
        }
        
        // 检查合约状态变化
        if (isPaused) {
          console.log("   ⚠️  合约处于暂停状态");
        }
        
      } catch (error) {
        console.error("❌ 监控错误:", error.message);
        await sendAlert("监控服务异常", error.message);
      }
    }, interval * 1000);
    
  } catch (error) {
    console.error("❌ 监控启动失败:", error.message);
  }
}

/**
 * 发送告警通知
 */
async function sendAlert(title, message) {
  console.log(`\n🚨 告警通知: ${title}`);
  console.log(`   📢 ${message}\n`);
  
  // TODO: 集成Slack/Telegram/邮件通知
  // 这里可以添加实际的通知集成代码
}

// 解析命令行参数
program.parse();