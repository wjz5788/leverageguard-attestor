import { defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

export default defineConfig({
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    localhost: { 
      chainId: 31337,
      url: "http://127.0.0.1:8545"
    },
    base: {
      chainId: 8453,
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: PRIVATE_KEY, // 仅当你真的要在主网部署时才需要
    },
  },
  // 兼容新旧配置：任一有值即可
  verify: {
    etherscan: {
      apiKey: {
        base: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      },
    },
  },
  etherscan: { // 老字段也配上，避免插件版本差异
    apiKey: {
      base: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
});