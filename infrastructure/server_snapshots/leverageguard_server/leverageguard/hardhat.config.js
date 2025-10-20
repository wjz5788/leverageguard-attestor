require('@nomiclabs/hardhat-ethers');
require('dotenv').config();

module.exports = {
  solidity: '0.8.0',
  networks: {
    arbitrumSepolia: {
      url: process.env.ARBITRUM_RPC,
      accounts: [process.env.PRIVATE_KEY, process.env.OWNER_PRIVATE_KEY]
    }
  },
  // 解决Node.js版本警告
  hardhat: {
    nodejs: {
      version: '18.17.0'
    }
  }
};