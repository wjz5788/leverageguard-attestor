/**
 * 环境变量校验工具
 * 用于启动时校验关键环境变量配置
 */

export class EnvValidator {
  /**
   * 校验支付相关环境变量
   * @throws {Error} 如果环境变量缺失或非法
   */
  static validatePaymentConfig(): void {
    const errors: string[] = [];

    // 校验 PAYMENT_VAULT_ADDRESS
    const vaultAddress = process.env.PAYMENT_VAULT_ADDRESS;
    if (!vaultAddress) {
      errors.push('PAYMENT_VAULT_ADDRESS 环境变量缺失');
    } else if (!this.isValidEthereumAddress(vaultAddress)) {
      errors.push('PAYMENT_VAULT_ADDRESS 不是有效的以太坊地址');
    } else if (this.isBlackholeAddress(vaultAddress)) {
      errors.push('PAYMENT_VAULT_ADDRESS 不能是黑洞地址 (0x000000000000000000000000000000000000dEaD)');
    }

    // 校验 PAYMENT_CHAIN_ID
    const chainId = process.env.PAYMENT_CHAIN_ID;
    if (!chainId) {
      errors.push('PAYMENT_CHAIN_ID 环境变量缺失');
    } else if (!this.isValidChainId(chainId)) {
      errors.push('PAYMENT_CHAIN_ID 不是有效的链ID');
    }

    // 校验 USDC_ADDRESS
    const usdcAddress = process.env.USDC_ADDRESS;
    if (!usdcAddress) {
      errors.push('USDC_ADDRESS 环境变量缺失');
    } else if (!this.isValidEthereumAddress(usdcAddress)) {
      errors.push('USDC_ADDRESS 不是有效的以太坊地址');
    } else if (this.isBlackholeAddress(usdcAddress)) {
      errors.push('USDC_ADDRESS 不能是黑洞地址');
    }

    if (errors.length > 0) {
      throw new Error(`支付配置校验失败:\n${errors.join('\n')}`);
    }

    console.log('✅ 支付环境变量校验通过');
    console.log(`   Vault地址: ${vaultAddress}`);
    console.log(`   链ID: ${chainId}`);
    console.log(`   USDC地址: ${usdcAddress}`);
  }

  /**
   * 校验是否为有效的以太坊地址
   */
  private static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * 校验是否为黑洞地址
   */
  private static isBlackholeAddress(address: string): boolean {
    const blackholeAddresses = [
      '0x0000000000000000000000000000000000000000', // 零地址
      '0x000000000000000000000000000000000000dEaD', // 常用黑洞地址
      '0x0000000000000000000000000000000000000001', // 其他黑洞地址
    ];
    return blackholeAddresses.includes(address.toLowerCase());
  }

  /**
   * 校验是否为有效的链ID
   */
  private static isValidChainId(chainId: string): boolean {
    // 支持十进制和十六进制格式
    const decimalRegex = /^\d+$/;
    const hexRegex = /^0x[a-fA-F0-9]+$/;
    
    if (decimalRegex.test(chainId)) {
      const num = parseInt(chainId, 10);
      return num > 0 && num <= 9999999999; // 合理的链ID范围
    }
    
    if (hexRegex.test(chainId)) {
      return chainId.length >= 3 && chainId.length <= 20; // 合理的十六进制长度
    }
    
    return false;
  }

  /**
   * 获取支付配置
   */
  static getPaymentConfig(): {
    vaultAddress: string;
    chainId: string;
    usdcAddress: string;
  } {
    return {
      vaultAddress: process.env.PAYMENT_VAULT_ADDRESS!,
      chainId: process.env.PAYMENT_CHAIN_ID!,
      usdcAddress: process.env.USDC_ADDRESS!,
    };
  }
}