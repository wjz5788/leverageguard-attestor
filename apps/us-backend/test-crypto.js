// 测试加密功能
import crypto from 'crypto';

// 模拟环境变量
process.env.KMS_KEY = 'liqpass-development-key-32bytes-long-123456';

// 导入加密工具
import { CryptoUtils, ApiKeyEncryptionService } from './src/utils/crypto.ts';

console.log('🔐 测试API密钥加密功能...\n');

// 测试数据
const testApiKey = 'test-api-key-123456';
const testSecret = 'test-secret-key-789012';
const testPassphrase = 'test-passphrase-345678';

try {
  console.log('📝 原始数据:');
  console.log('  API Key:', testApiKey);
  console.log('  Secret:', testSecret);
  console.log('  Passphrase:', testPassphrase);
  console.log('');

  // 测试单个加密/解密
  console.log('🔒 测试单个加密/解密:');
  const encrypted = CryptoUtils.encrypt(testApiKey);
  console.log('  加密结果:', encrypted);
  
  const decrypted = CryptoUtils.decrypt(encrypted);
  console.log('  解密结果:', decrypted);
  console.log('  解密成功:', decrypted === testApiKey);
  console.log('');

  // 测试API密钥加密服务
  console.log('🔐 测试API密钥加密服务:');
  const encryptedApiKey = ApiKeyEncryptionService.encryptApiKey(
    testApiKey, 
    testSecret, 
    testPassphrase
  );
  
  console.log('  加密的API Key:', encryptedApiKey.api_key_enc);
  console.log('  加密的Secret:', encryptedApiKey.secret_enc);
  console.log('  加密的Passphrase:', encryptedApiKey.passphrase_enc);
  console.log('');

  // 测试解密
  const decryptedApiKey = ApiKeyEncryptionService.decryptApiKey(
    encryptedApiKey.api_key_enc,
    encryptedApiKey.secret_enc,
    encryptedApiKey.passphrase_enc
  );
  
  console.log('🔓 解密结果:');
  console.log('  解密API Key:', decryptedApiKey.api_key);
  console.log('  解密Secret:', decryptedApiKey.secret);
  console.log('  解密Passphrase:', decryptedApiKey.passphrase);
  console.log('');

  // 验证解密结果
  const isApiKeyValid = decryptedApiKey.api_key === testApiKey;
  const isSecretValid = decryptedApiKey.secret === testSecret;
  const isPassphraseValid = decryptedApiKey.passphrase === testPassphrase;
  
  console.log('✅ 验证结果:');
  console.log('  API Key 验证:', isApiKeyValid);
  console.log('  Secret 验证:', isSecretValid);
  console.log('  Passphrase 验证:', isPassphraseValid);
  console.log('');

  if (isApiKeyValid && isSecretValid && isPassphraseValid) {
    console.log('🎉 所有加密/解密测试通过！API密钥安全存储功能正常工作。');
  } else {
    console.log('❌ 加密/解密测试失败！');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ 测试过程中发生错误:', error.message);
  process.exit(1);
}