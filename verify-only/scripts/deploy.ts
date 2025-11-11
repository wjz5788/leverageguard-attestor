import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const USDC = "0x833589fCD6EdB6E08f4c7C32D4f71B54Bda02913"; // Base USDC (主网)
  const TREASURY = "0x9aea8865a46a37a9db738fd0f1ee2bed49d143f1";

  const CheckoutUSDC = await ethers.getContractFactory("CheckoutUSDC");
  const contract = await CheckoutUSDC.deploy(USDC, TREASURY);
  await contract.waitForDeployment();

  console.log("CheckoutUSDC deployed to:", await contract.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});