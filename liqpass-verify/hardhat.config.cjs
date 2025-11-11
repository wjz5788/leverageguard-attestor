require("dotenv/config");
require("@nomicfoundation/hardhat-verify");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    base: {
      url: "https://mainnet.base.org", // Explicitly set the RPC URL
      chainId: 8453,
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
  },
  etherscan: {
    apiKey: { base: process.env.BASESCAN_API_KEY },
    // customChains: [], // 注释掉 customChains
  },
};
