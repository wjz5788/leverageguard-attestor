import { ethers } from 'ethers';

// 测试地址
const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';

console.log('=== 钱包地址验证测试 ===');
console.log('测试地址:', testAddress);
console.log('地址长度:', testAddress.length);
console.log('ethers.isAddress结果:', ethers.isAddress(testAddress));

// 检查地址格式
const isValidFormat = /^0x[a-fA-F0-9]{40}$/.test(testAddress);
console.log('格式验证结果:', isValidFormat);

// 尝试小写版本
const lowerCaseAddress = testAddress.toLowerCase();
console.log('\n=== 小写版本测试 ===');
console.log('小写地址:', lowerCaseAddress);
console.log('ethers.isAddress结果:', ethers.isAddress(lowerCaseAddress));

// 尝试检查地址是否有效
console.log('\n=== 地址详细信息 ===');
try {
  const addressObj = ethers.getAddress(testAddress);
  console.log('getAddress结果:', addressObj);
} catch (error) {
  console.log('getAddress错误:', error.message);
}