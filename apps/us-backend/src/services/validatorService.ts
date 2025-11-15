// 校验器服务 - 处理API密钥验证和安全性检查
import { VerifyRequest, VerifyResponse } from '../types/index.js';

// 校验器服务类
export class ValidatorService {
  
  /**
   * 验证API密钥格式
   */
  validateApiKeyFormat(apiKey: string): { valid: boolean; error?: string } {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API key is required' };
    }

    if (apiKey.length < 20) {
      return { valid: false, error: 'API key is too short' };
    }

    if (apiKey.length > 100) {
      return { valid: false, error: 'API key is too long' };
    }

    // 检查API密钥格式（基本格式检查）
    const apiKeyRegex = /^[a-zA-Z0-9_-]+$/;
    if (!apiKeyRegex.test(apiKey)) {
      return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * 验证API密钥格式
   */
  validateApiSecretFormat(apiSecret: string): { valid: boolean; error?: string } {
    if (!apiSecret || apiSecret.trim().length === 0) {
      return { valid: false, error: 'API secret is required' };
    }

    if (apiSecret.length < 30) {
      return { valid: false, error: 'API secret is too short' };
    }

    if (apiSecret.length > 200) {
      return { valid: false, error: 'API secret is too long' };
    }

    // API密钥通常包含各种字符，不做严格格式检查
    return { valid: true };
  }

  /**
   * 验证交易对格式
   */
  validatePairFormat(pair: string): { valid: boolean; error?: string } {
    if (!pair || pair.trim().length === 0) {
      return { valid: false, error: 'Trading pair is required' };
    }

    // 基本交易对格式检查（例如：BTC-USDT, ETH-USD）
    const pairRegex = /^[A-Z0-9]+-[A-Z0-9]+$/;
    if (!pairRegex.test(pair.toUpperCase())) {
      return { valid: false, error: 'Invalid trading pair format' };
    }

    return { valid: true };
  }

  /**
   * 验证订单引用格式
   */
  validateOrderRefFormat(orderRef: string): { valid: boolean; error?: string } {
    if (!orderRef || orderRef.trim().length === 0) {
      return { valid: false, error: 'Order reference is required' };
    }

    if (orderRef.length < 5) {
      return { valid: false, error: 'Order reference is too short' };
    }

    if (orderRef.length > 50) {
      return { valid: false, error: 'Order reference is too long' };
    }

    // 订单引用通常包含字母、数字和特殊字符
    const orderRefRegex = /^[a-zA-Z0-9_-]+$/;
    if (!orderRefRegex.test(orderRef)) {
      return { valid: false, error: 'Order reference contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * 验证环境参数
   */
  validateEnvironment(environment: string): { valid: boolean; error?: string } {
    if (!environment) {
      return { valid: true }; // 环境参数可选
    }

    const validEnvironments = ['live', 'testnet'];
    if (!validEnvironments.includes(environment)) {
      return { valid: false, error: 'Invalid environment. Must be "live" or "testnet"' };
    }

    return { valid: true };
  }

  /**
   * 验证交易所类型
   */
  validateExchange(exchange: string): { valid: boolean; error?: string } {
    if (!exchange) {
      return { valid: false, error: 'Exchange is required' };
    }

    const validExchanges = ['okx', 'binance', 'hyperliquid'];
    if (!validExchanges.includes(exchange.toLowerCase())) {
      return { valid: false, error: 'Unsupported exchange' };
    }

    return { valid: true };
  }

  /**
   * 执行完整的请求验证
   */
  validateRequest(request: VerifyRequest): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // 验证交易所
    const exchangeValidation = this.validateExchange(request.exchange);
    if (!exchangeValidation.valid) {
      errors.push(exchangeValidation.error!);
    }

    // 验证API密钥
    const apiKeyValidation = this.validateApiKeyFormat(request.apiKey);
    if (!apiKeyValidation.valid) {
      errors.push(apiKeyValidation.error!);
    }

    // 验证API密钥
    const apiSecretValidation = this.validateApiSecretFormat(request.apiSecret);
    if (!apiSecretValidation.valid) {
      errors.push(apiSecretValidation.error!);
    }

    // 验证交易对
    const pairValidation = this.validatePairFormat(request.pair);
    if (!pairValidation.valid) {
      errors.push(pairValidation.error!);
    }

    // 验证订单引用
    const orderRefValidation = this.validateOrderRefFormat(request.orderRef);
    if (!orderRefValidation.valid) {
      errors.push(orderRefValidation.error!);
    }

    // 验证环境参数
    if (request.environment) {
      const envValidation = this.validateEnvironment(request.environment);
      if (!envValidation.valid) {
        errors.push(envValidation.error!);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 检查API密钥安全性
   */
  checkApiKeySecurity(apiKey: string): { secure: boolean; warnings?: string[] } {
    const warnings: string[] = [];

    // 检查是否包含常见测试模式
    const testPatterns = ['test', 'demo', 'example', 'fake'];
    const lowerApiKey = apiKey.toLowerCase();
    
    testPatterns.forEach(pattern => {
      if (lowerApiKey.includes(pattern)) {
        warnings.push(`API key contains test pattern: ${pattern}`);
      }
    });

    // 检查是否过于简单（如连续字符）
    const simplePatterns = [/^[a-z]+$/, /^[A-Z]+$/, /^[0-9]+$/, /^(.)\1+$/];
    simplePatterns.forEach(pattern => {
      if (pattern.test(apiKey)) {
        warnings.push('API key appears to be too simple');
      }
    });

    return {
      secure: warnings.length === 0,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * 生成验证报告
   */
  generateValidationReport(request: VerifyRequest): {
    overall: 'pass' | 'fail' | 'warning';
    details: Array<{ field: string; status: 'pass' | 'fail' | 'warning'; message: string }>;
  } {
    const details: Array<{ field: string; status: 'pass' | 'fail' | 'warning'; message: string }> = [];

    // 验证各个字段
    const exchangeValidation = this.validateExchange(request.exchange);
    details.push({
      field: 'exchange',
      status: exchangeValidation.valid ? 'pass' : 'fail',
      message: exchangeValidation.valid ? 'Valid exchange' : exchangeValidation.error!
    });

    const apiKeyValidation = this.validateApiKeyFormat(request.apiKey);
    details.push({
      field: 'apiKey',
      status: apiKeyValidation.valid ? 'pass' : 'fail',
      message: apiKeyValidation.valid ? 'Valid API key format' : apiKeyValidation.error!
    });

    const apiSecretValidation = this.validateApiSecretFormat(request.apiSecret);
    details.push({
      field: 'apiSecret',
      status: apiSecretValidation.valid ? 'pass' : 'fail',
      message: apiSecretValidation.valid ? 'Valid API secret format' : apiSecretValidation.error!
    });

    const pairValidation = this.validatePairFormat(request.pair);
    details.push({
      field: 'pair',
      status: pairValidation.valid ? 'pass' : 'fail',
      message: pairValidation.valid ? 'Valid trading pair' : pairValidation.error!
    });

    const orderRefValidation = this.validateOrderRefFormat(request.orderRef);
    details.push({
      field: 'orderRef',
      status: orderRefValidation.valid ? 'pass' : 'fail',
      message: orderRefValidation.valid ? 'Valid order reference' : orderRefValidation.error!
    });

    // 安全检查
    const securityCheck = this.checkApiKeySecurity(request.apiKey);
    if (!securityCheck.secure) {
      details.push({
        field: 'security',
        status: 'warning',
        message: securityCheck.warnings?.join(', ') || 'Security concerns detected'
      });
    }

    // 确定总体状态
    const hasFail = details.some(d => d.status === 'fail');
    const hasWarning = details.some(d => d.status === 'warning');
    
    const overall = hasFail ? 'fail' : hasWarning ? 'warning' : 'pass';

    return { overall, details };
  }
}

export default ValidatorService;