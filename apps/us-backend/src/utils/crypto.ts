import crypto from 'crypto';

/**
 * AES-GCM加密工具
 * 使用环境变量KMS_KEY作为加密密钥
 */
export class CryptoUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 对于GCM模式，推荐12字节IV
  private static readonly TAG_LENGTH = 16; // GCM认证标签长度
  private static readonly SALT_LENGTH = 16; // 盐值长度

  /**
   * 获取加密密钥
   * 从环境变量KMS_KEY获取，如果不存在则抛出错误
   */
  private static getKey(): Buffer {
    const kmsKey = process.env.KMS_KEY;
    if (!kmsKey) {
      throw new Error('KMS_KEY environment variable is required for encryption');
    }
    
    // 如果密钥长度不是32字节，使用PBKDF2派生
    if (kmsKey.length === 32) {
      return Buffer.from(kmsKey, 'utf8');
    }
    
    // 使用PBKDF2派生32字节密钥
    return crypto.pbkdf2Sync(kmsKey, 'liqpass-salt', 100000, 32, 'sha256');
  }

  /**
   * 加密文本
   * @param plaintext 明文
   * @returns 加密后的Base64字符串(格式: iv.tag.ciphertext)
   */
  static encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // 返回格式: iv.tag.ciphertext
    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted}`;
  }

  /**
   * 解密文本
   * @param encryptedText 加密文本(格式: iv.tag.ciphertext)
   * @returns 解密后的明文
   */
  static decrypt(encryptedText: string): string {
    const key = this.getKey();
    const parts = encryptedText.split('.');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * 验证加密文本格式
   * @param encryptedText 加密文本
   * @returns 是否有效格式
   */
  static isValidEncryptedFormat(encryptedText: string): boolean {
    const parts = encryptedText.split('.');
    return parts.length === 3;
  }

  /**
   * 脱敏显示密钥(显示最后4位)
   * @param text 原始文本
   * @returns 脱敏后的文本
   */
  static maskSensitiveText(text: string): string {
    if (text.length <= 4) {
      return '****';
    }
    return `****${text.slice(-4)}`;
  }

  /**
   * 生成随机密钥ID(可选)
   * @returns 随机密钥ID
   */
  static generateApiKeyId(): string {
    return `key_${crypto.randomBytes(8).toString('hex')}`;
  }
}

/**
 * API密钥加密服务
 */
export class ApiKeyEncryptionService {
  /**
   * 加密API密钥信息
   */
  static encryptApiKey(apiKey: string, secret: string, passphrase: string): {
    api_key_enc: string;
    secret_enc: string;
    passphrase_enc: string;
  } {
    return {
      api_key_enc: CryptoUtils.encrypt(apiKey),
      secret_enc: CryptoUtils.encrypt(secret),
      passphrase_enc: CryptoUtils.encrypt(passphrase)
    };
  }

  /**
   * 解密API密钥信息
   */
  static decryptApiKey(apiKeyEnc: string, secretEnc: string, passphraseEnc: string): {
    api_key: string;
    secret: string;
    passphrase: string;
  } {
    return {
      api_key: CryptoUtils.decrypt(apiKeyEnc),
      secret: CryptoUtils.decrypt(secretEnc),
      passphrase: CryptoUtils.decrypt(passphraseEnc)
    };
  }

  /**
   * 验证加密格式
   */
  static validateEncryptedFormat(apiKeyEnc: string, secretEnc: string, passphraseEnc: string): boolean {
    return CryptoUtils.isValidEncryptedFormat(apiKeyEnc) &&
           CryptoUtils.isValidEncryptedFormat(secretEnc) &&
           CryptoUtils.isValidEncryptedFormat(passphraseEnc);
  }

  /**
   * 脱敏显示API密钥信息
   */
  static maskApiKeyInfo(apiKey: string, secret: string, passphrase: string): {
    api_key_masked: string;
    secret_masked: string;
    passphrase_masked: string;
  } {
    return {
      api_key_masked: CryptoUtils.maskSensitiveText(apiKey),
      secret_masked: CryptoUtils.maskSensitiveText(secret),
      passphrase_masked: CryptoUtils.maskSensitiveText(passphrase)
    };
  }
}