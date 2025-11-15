#!/usr/bin/env node

/**
 * 最小实单回路测试脚本
 * 在主网上进行小额USDC支付测试
 * 使用方法：node test-real-order.js
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// 加载环境变量
function loadEnv() {
  const envPath = path.join(__dirname, '.env.test');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key, value] = line.split('=').map(part => part.trim());
        if (key && value) {
          envVars[key] = value;
        }
      }
    });
    
    return envVars;
  }
  return {};
}

const env = loadEnv();

// 配置参数
const CONFIG = {
  CHECKOUT_USDC_ADDRESS: env.CHECKOUT_USDC_ADDRESS || "0xc423c34b57730ba87fb74b99180663913a345d68",
  USDC_ADDRESS: env.BASE_USDC_ADDRESS || "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  RPC_URL: env.BASE_RPC_URL || "https://mainnet.base.org",
  TEST_AMOUNT: env.TEST_AMOUNT || "1", // 1 USDC
  PRIVATE_KEY: env.TEST_WALLET_PRIVATE_KEY || process.env.TEST_WALLET_PRIVATE_KEY // 从环境变量读取私钥
};

// USDC合约ABI（简化版）
const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

// CheckoutUSDC合约ABI
const CHECKOUT_USDC_ABI = [
  "function buyPolicy(bytes32 orderId, uint256 amount, bytes32 quoteHash) external",
  "function isOrderProcessed(bytes32 orderId) external view returns (bool)",
  "function USDC() public view returns (address)",
  "function treasury() public view returns (address)",
  "function paused() public view returns (bool)"
];

async function main() {
  console.log("🚀 开始最小实单回路测试...\n");
  
  // 检查私钥
  if (!CONFIG.PRIVATE_KEY) {
    console.error("❌ 请设置 TEST_WALLET_PRIVATE_KEY 环境变量");
    console.log("   例如: export TEST_WALLET_PRIVATE_KEY=your_private_key_here");
    process.exit(1);
  }

  try {
    // 1. 连接Base网络
    console.log("1. 连接Base网络...");
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    const network = await provider.getNetwork();
    console.log(`   ✅ 网络连接成功: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`   🏦 测试钱包地址: ${wallet.address}\n`);

    // 2. 检查USDC余额
    console.log("2. 检查USDC余额...");
    const usdcContract = new ethers.Contract(CONFIG.USDC_ADDRESS, USDC_ABI, wallet);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    const decimals = await usdcContract.decimals();
    const formattedBalance = ethers.formatUnits(usdcBalance, decimals);
    
    console.log(`   USDC余额: ${formattedBalance} USDC`);
    
    if (parseFloat(formattedBalance) < parseFloat(CONFIG.TEST_AMOUNT)) {
      console.error("❌ USDC余额不足，请确保钱包有足够的USDC和ETH用于gas费");
      process.exit(1);
    }
    console.log("   ✅ USDC余额充足\n");

    // 3. 检查ETH余额（用于gas费）
    console.log("3. 检查ETH余额...");
    const ethBalance = await provider.getBalance(wallet.address);
    const formattedEthBalance = ethers.formatEther(ethBalance);
    console.log(`   ETH余额: ${formattedEthBalance} ETH`);
    
    if (parseFloat(formattedEthBalance) < 0.001) {
      console.error("❌ ETH余额不足，请确保钱包有足够的ETH用于gas费");
      process.exit(1);
    }
    console.log("   ✅ ETH余额充足\n");

    // 4. 检查CheckoutUSDC合约状态
    console.log("4. 检查CheckoutUSDC合约状态...");
    const checkoutContract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, wallet);
    
    const isPaused = await checkoutContract.paused();
    if (isPaused) {
      console.error("❌ 合约已暂停，无法进行支付");
      process.exit(1);
    }
    console.log("   ✅ 合约运行正常\n");

    // 5. 授权USDC给CheckoutUSDC合约
    console.log("5. 授权USDC给CheckoutUSDC合约...");
    const amount = ethers.parseUnits(CONFIG.TEST_AMOUNT, decimals);
    
    // 检查当前授权额度
    const currentAllowance = await usdcContract.allowance(wallet.address, CONFIG.CHECKOUT_USDC_ADDRESS);
    if (currentAllowance >= amount) {
      console.log("   ✅ 已有足够授权额度，跳过授权步骤");
    } else {
      console.log("   📝 执行授权交易...");
      const approveTx = await usdcContract.approve(CONFIG.CHECKOUT_USDC_ADDRESS, amount);
      console.log(`   🔗 授权交易哈希: ${approveTx.hash}`);
      
      const receipt = await approveTx.wait();
      console.log(`   ✅ 授权成功，区块: ${receipt.blockNumber}\n`);
    }

    // 6. 生成测试订单数据
    console.log("6. 生成测试订单数据...");
    const orderId = ethers.keccak256(ethers.toUtf8Bytes(`test-order-${Date.now()}`));
    const quoteHash = ethers.keccak256(ethers.toUtf8Bytes(`test-quote-${Date.now()}`));
    
    console.log(`   订单ID: ${orderId}`);
    console.log(`   报价哈希: ${quoteHash}`);
    console.log(`   支付金额: ${CONFIG.TEST_AMOUNT} USDC\n`);

    // 7. 执行购买操作
    console.log("7. 执行购买操作...");
    console.log("   📝 调用buyPolicy函数...");
    
    const buyTx = await checkoutContract.buyPolicy(orderId, amount, quoteHash);
    console.log(`   🔗 购买交易哈希: ${buyTx.hash}`);
    
    const buyReceipt = await buyTx.wait();
    console.log(`   ✅ 购买成功，区块: ${buyReceipt.blockNumber}`);
    
    // 检查订单状态
    const isProcessed = await checkoutContract.isOrderProcessed(orderId);
    console.log(`   📋 订单处理状态: ${isProcessed ? '已处理' : '未处理'}`);

    // 8. 验证事件
    console.log("\n8. 验证事件...");
    console.log("   请检查以下内容:");
    console.log("   • Basescan合约页Events是否出现PremiumPaid事件");
    console.log("   • 后端监听器是否打印事件信息");
    console.log("   • 订单状态是否被回填为paid\n");

    console.log("🎉 最小实单回路测试完成！");
    console.log("\n📋 测试结果汇总:");
    console.log(`   • 交易哈希: ${buyTx.hash}`);
    console.log(`   • 区块号: ${buyReceipt.blockNumber}`);
    console.log(`   • 订单ID: ${orderId}`);
    console.log(`   • 支付金额: ${CONFIG.TEST_AMOUNT} USDC`);
    console.log(`   • 订单状态: ${isProcessed ? '已处理' : '未处理'}`);

  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    if (error.transactionHash) {
      console.log(`   交易哈希: ${error.transactionHash}`);
    }
    process.exit(1);
  }
}

// 运行测试
main().catch(console.error);