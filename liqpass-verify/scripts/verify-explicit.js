import hre from "hardhat";

(async () => {
  try {
    console.log("开始验证合约...");
    
    // 导入构造参数
    const constructorArgs = [
      "0x833589fCd6EDB6E08F4c7C32D4F71B54bDa02913", // USDC 地址
      "0x9aEA8865A46A37a9dB738fD0F1eE2bED49D143F1"  // Treasury 地址
    ];
    
    await hre.run("verify:verify", {
      address: "0xc4d1bedc8850771af2d9db2c6d24ec21a8829709",
      constructorArguments: constructorArgs,
      contract: "contracts/CheckoutUSDC.sol:CheckoutUSDC"
    });
    
    console.log("✅ 合约验证成功！");
  } catch (error) {
    console.error("❌ 验证失败:", error.message);
    process.exit(1);
  }
})();