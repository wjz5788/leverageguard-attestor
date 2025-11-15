import "@nomicfoundation/hardhat-verify";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    base: {
      url: "https://mainnet.base.org",
      chainId: 8453
    }
  },
  etherscan: {
    apiKey: { base: "VHYN2NTDMRM2NWV9FUHR2NJ2M92KQ6FQQC" }
  }
};

export default config;