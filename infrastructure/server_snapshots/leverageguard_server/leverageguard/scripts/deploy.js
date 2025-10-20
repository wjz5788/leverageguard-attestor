const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  // 获取部署钱包
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contract with the account:', deployer.address);
  
  // 检查钱包余额
  const balance = await deployer.getBalance();
  console.log('Account balance:', ethers.utils.formatEther(balance), 'ETH');
  
  // 部署LeverageGuard合约
  // 参数: 清算阈值(80表示80%)，手续费(1表示1%)
  const LeverageGuard = await ethers.getContractFactory('LeverageGuard');
  const leverageGuard = await LeverageGuard.deploy(80, 1);
  
  console.log('Deploying contract...');
  await leverageGuard.deployed();
  
  console.log('LeverageGuard contract deployed to:', leverageGuard.address);
  console.log('\nPlease save this address in your .env file as LEVERAGEGUARD_ADDRESS');
  
  // 输出合约部署信息
  console.log('\nDeployment Summary:');
  console.log('--------------------');
  console.log('Deployer Address:', deployer.address);
  console.log('Contract Address:', leverageGuard.address);
  console.log('Chain:', 'Arbitrum Sepolia');
  console.log('Liquidation Threshold:', '80%');
  console.log('Fee Percentage:', '1%');
}

// 执行部署
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });