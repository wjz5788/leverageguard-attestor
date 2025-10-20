const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  // 获取合约地址
  const contractAddress = process.env.LEVERAGEGUARD_ADDRESS;
  if (!contractAddress) {
    console.error('Error: LEVERAGEGUARD_ADDRESS not found in .env file');
    console.error('Please add LEVERAGEGUARD_ADDRESS=0x... to your .env file');
    process.exit(1);
  }
  
  // 获取owner钱包（用于注入资金）
  const [owner] = await ethers.getSigners();
  console.log('Adding funds from account:', owner.address);
  
  // 检查钱包余额
  const balance = await owner.getBalance();
  console.log('Account balance:', ethers.utils.formatEther(balance), 'ETH');
  
  // 连接到LeverageGuard合约
  const LeverageGuard = await ethers.getContractFactory('LeverageGuard');
  const leverageGuard = await LeverageGuard.attach(contractAddress);
  
  // 注入资金金额（修改为0.02 ETH，因为钱包余额有限）
  const amount = ethers.utils.parseEther('0.02');
  
  console.log('Adding funds to contract...');
  const tx = await leverageGuard.addFunds({ value: amount });
  
  console.log('Transaction sent:', tx.hash);
  
  // 等待交易确认
  await tx.wait(1);
  
  // 获取合约最新余额
  const contractBalance = await leverageGuard.contractBalance();
  
  console.log('\nFunding Summary:');
  console.log('----------------');
  console.log('Contract Address:', contractAddress);
  console.log('Funded Amount:', ethers.utils.formatEther(amount), 'ETH');
  console.log('Transaction Hash:', tx.hash);
  console.log('Contract Balance:', ethers.utils.formatEther(contractBalance), 'ETH');
}

// 执行资金注入
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Funding failed:', error);
    process.exit(1);
  });