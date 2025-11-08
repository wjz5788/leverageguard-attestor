const { run } = require("hardhat"); 
const args = require("./args.js");
 
async function main() { 
  const address = "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709"; 
  await run("verify:verify", { 
    address, 
    constructorArguments: args, 
    contract: "contracts/CheckoutUSDC.sol:CheckoutUSDC", 
  }); 
  console.log("✓ verify submitted"); 
} 
 
main().catch((e) => { console.error(e); process.exit(1); });