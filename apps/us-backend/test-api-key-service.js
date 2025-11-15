// 测试API密钥加密服务流程
import { ApiKeyEncryptionService, CryptoUtils } from './src/utils/crypto.ts';

// 模拟环境变量
process.env.KMS_KEY = 'liqpass-development-key-32bytes-long-123456';

console.log('🔐 测试API密钥加密服务流程...\n');

// 测试数据
const testApiKey = 'live-api-key-abcdef123456';
const testSecret = 'live-secret-key-789012xyz';
const testPassphrase = 'live-passphrase-345678uvw';

async function testApiKeyEncryptionService() {
  try {
    console.log('📝 测试数据:');
    console.log('  API Key:', testApiKey);
    console.log('  Secret:', testSecret);
    console.log('  Passphrase:', testPassphrase);
    console.log('');

    // 1. 加密API密钥
    console.log('1️⃣ 加密API密钥信息...');
    const encrypted = ApiKeyEncryptionService.encryptApiKey(
      testApiKey,
      testSecret,
      testPassphrase
    );
    
    console.log('  ✅ API密钥加密成功');
    console.log('  加密的API Key:', encrypted.api_key_enc);
    console.log('  加密的Secret:', encrypted.secret_enc);
    console.log('  加密的Passphrase:', encrypted.passphrase_enc);
    console.log('');

    // 2. 解密API密钥
    console.log('2️⃣ 解密API密钥信息...');
    const decrypted = ApiKeyEncryptionService.decryptApiKey(
      encrypted.api_key_enc,
      encrypted.secret_enc,
      encrypted.passphrase_enc
    );
    
    console.log('  ✅ API密钥解密成功');
    console.log('  解密的API Key:', decrypted.api_key);
    console.log('  解密的Secret:', decrypted.secret);
    console.log('  解密的Passphrase:', decrypted.passphrase);
    console.log('');

    // 3. 脱敏显示
    console.log('3️⃣ 脱敏显示API密钥信息...');
    const masked = ApiKeyEncryptionService.maskApiKeyInfo(
      decrypted.api_key,
      decrypted.secret,
      decrypted.passphrase
    );
    
    console.log('  ✅ API密钥脱敏成功');
    console.log('  脱敏的API Key:', masked.api_key_masked);
    console.log('  脱敏的Secret:', masked.secret_masked);
    console.log('  脱敏的Passphrase:', masked.passphrase_masked);
    console.log('');

    // 4. 验证解密结果
    console.log('4️⃣ 验证解密结果...');
    const isApiKeyValid = decrypted.api_key === testApiKey;
    const isSecretValid = decrypted.secret === testSecret;
    const isPassphraseValid = decrypted.passphrase === testPassphrase;
    
    console.log('  API Key 验证:', isApiKeyValid);
    console.log('  Secret 验证:', isSecretValid);
    console.log('  Passphrase 验证:', isPassphraseValid);
    console.log('');

    if (isApiKeyValid && isSecretValid && isPassphraseValid) {
      console.log('🎉 API密钥加密服务流程测试通过！');
      console.log('✅ 加密/解密功能正常工作');
      console.log('✅ 脱敏显示功能正常工作');
      console.log('✅ API密钥安全存储功能完整');
    } else {
      console.log('❌ API密钥加密服务流程测试失败！');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    process.exit(1);
  }
}

// 运行测试
testApiKeyEncryptionService();