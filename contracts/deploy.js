const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 开始部署 CheckoutUSDC 合约...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("📝 部署者地址:", await deployer.getAddress());

  // Base 主网配置
  const BASE_USDC = "0x833589fCD6EdB6E08f4c7C32D4f71B54Bda02913";
  const TREASURY = "0x9aea8865a46a37a9db738fd0f1ee2bed49d143f1"; // 替换为你的金库地址

  console.log("📊 配置信息:");
  console.log("  - Base USDC 地址:", BASE_USDC);
  console.log("  - 金库地址:", TREASURY);
  console.log("  - 网络:", (await ethers.provider.getNetwork()).name);
  console.log("  - 链ID:", (await ethers.provider.getNetwork()).chainId);

  // 验证部署者余额
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 部署者余额:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.01")) {
    throw new Error("部署者余额不足，请确保有足够的ETH支付gas费用");
  }

  // 部署合约
  console.log("\n📦 正在部署 CheckoutUSDC 合约...");
  const CheckoutUSDC = await ethers.getContractFactory("CheckoutUSDC");
  const contract = await CheckoutUSDC.deploy(BASE_USDC, TREASURY);
  
  console.log("⏳ 等待部署确认...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("✅ CheckoutUSDC 合约部署成功!");
  console.log("📄 合约地址:", contractAddress);

  // 验证合约部署
  console.log("\n🔍 验证合约部署...");
  const usdcAddress = await contract.USDC();
  const treasuryAddress = await contract.treasury();
  const baseUsdc = await contract.BASE_USDC();

  console.log("✅ 合约验证通过:");
  console.log("  - USDC 地址:", usdcAddress);
  console.log("  - 金库地址:", treasuryAddress);
  console.log("  - Base USDC 常量:", baseUsdc);

  // 保存部署信息
  const deploymentInfo = {
    contractName: "CheckoutUSDC",
    contractAddress: contractAddress,
    deployer: await deployer.getAddress(),
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deploymentTime: new Date().toISOString(),
    constructorArgs: {
      usdc: BASE_USDC,
      treasury: TREASURY
    }
  };

  console.log("\n📋 部署信息:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log("\n🎉 部署完成! 合约已成功部署到 Base 主网");
  console.log("💡 下一步操作:");
  console.log("  1. 在前端更新合约地址");
  console.log("  2. 配置 quoteHash 注册机制");
  console.log("  3. 测试支付功能");
}

main().catch((error) => {
  console.error("❌ 部署失败:", error);
  process.exit(1);
});