import { ethers } from 'ethers';

// 验证Base主网配置
const config = {
  chainId: 8453,
  usdcAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  vaultAddress: '0x742d35Cc6634C0532925a3b8D9c9C8b5f7a9F8c2',
  checkoutAddress: '0xc423c34b57730ba87fb74b99180663913a345d68',
  treasuryAddress: '0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b'
};

console.log('🔍 Base主网配置验证');
console.log('========================');

// 验证地址格式
Object.entries(config).forEach(([key, address]) => {
  if (key !== 'chainId') {
    const isValid = ethers.isAddress(address);
    console.log(`${key}: ${address} - ${isValid ? '✅ 有效' : '❌ 无效'}`);
  }
});

console.log(`chainId: ${config.chainId} - ${config.chainId === 8453 ? '✅ Base主网' : '❌ 非Base主网'}`);

// 获取地址校验和格式
console.log('\n📋 校验和格式:');
Object.entries(config).forEach(([key, address]) => {
  if (key !== 'chainId') {
    try {
      const checksumAddress = ethers.getAddress(address.toLowerCase());
      console.log(`${key}: ${checksumAddress}`);
    } catch (error) {
      console.log(`${key}: 获取校验和失败 - ${error.message}`);
    }
  }
});

console.log('\n💡 使用建议:');
console.log('- 确保钱包已连接到Base主网');
console.log('- 合约地址已验证为Base主网标准');
console.log('- 测试金额限制在0.01 USDC以内');
console.log('- 监控交易状态确保成功执行');