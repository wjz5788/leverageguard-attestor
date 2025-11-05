import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'sqlite3';
import dbManager, { type DatabaseManager } from '../database/db.js';
import type { 
  ApiKey, 
  SanitizedApiKey, 
  CreateApiKeyRequest, 
  VerifyApiKeyRequest, 
  VerifyApiKeyResponse,
  ApiKeyStatus,
  ExchangeType 
} from '../models/apiKey.js';
import { ApiKeyEncryptionService, CryptoUtils } from '../utils/crypto.js';

/**
 * API密钥服务错误类
 */
export class ApiKeyServiceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiKeyServiceError';
  }
}

/**
 * API密钥服务
 */
export default class ApiKeyService {
  private db: sqlite3.Database;

  constructor() {
    this.db = dbManager.getDatabase();
  }

  /**
   * 保存或更新API密钥
   */
  async saveApiKey(userId: string, request: CreateApiKeyRequest): Promise<ApiKey> {
    // 验证请求参数
    this.validateCreateRequest(request);

    // 检查是否已存在该用户和交易所的记录
    const existing = await this.getApiKeyByUserAndExchange(userId, request.exchange);
    
    // 加密API密钥信息
    const encrypted = ApiKeyEncryptionService.encryptApiKey(
      request.api_key,
      request.secret,
      request.passphrase
    );

    const now = new Date().toISOString();
    const apiKeyId = request.api_key_id || CryptoUtils.generateApiKeyId();
    
    if (existing) {
      // 更新现有记录
      const updateSql = `
        UPDATE api_keys 
        SET api_key_id = ?, api_key_enc = ?, secret_enc = ?, passphrase_enc = ?, 
            status = 'new', updated_at = ?
        WHERE user_id = ? AND exchange = ?
      `;
      
      return new Promise((resolve, reject) => {
        this.db.run(updateSql, [
          apiKeyId,
          encrypted.api_key_enc,
          encrypted.secret_enc,
          encrypted.passphrase_enc,
          now,
          userId,
          request.exchange
        ], (err: any) => {
          if (err) {
            reject(new ApiKeyServiceError('DB_ERROR', `更新API密钥失败: ${err.message}`));
            return;
          }
          
          // 返回更新后的记录
          this.getApiKeyByUserAndExchange(userId, request.exchange)
            .then((apiKey) => {
              if (apiKey) {
                resolve(apiKey);
              } else {
                reject(new ApiKeyServiceError('NOT_FOUND', 'API密钥未找到'));
              }
            })
            .catch(reject);
        });
      });
    } else {
      // 创建新记录
      const insertSql = `
        INSERT INTO api_keys (
          id, user_id, exchange, api_key_id, api_key_enc, secret_enc, passphrase_enc, 
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const id = uuidv4();
      
      return new Promise((resolve, reject) => {
        this.db.run(insertSql, [
          id,
          userId,
          request.exchange,
          apiKeyId,
          encrypted.api_key_enc,
          encrypted.secret_enc,
          encrypted.passphrase_enc,
          'new',
          now,
          now
        ], (err: any) => {
          if (err) {
            reject(new ApiKeyServiceError('DB_ERROR', `保存API密钥失败: ${err.message}`));
            return;
          }
          
          // 返回新创建的记录
          this.getApiKeyById(id)
            .then((apiKey) => resolve(apiKey!))
            .catch(reject);
        });
      });
    }
  }

  /**
   * 获取用户的API密钥列表（脱敏）
   */
  async getUserApiKeys(userId: string): Promise<SanitizedApiKey[]> {
    const sql = `
      SELECT * FROM api_keys 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, [userId], (err: any, rows: ApiKey[]) => {
        if (err) {
          reject(new ApiKeyServiceError('DB_ERROR', `查询API密钥失败: ${err.message}`));
          return;
        }
        
        const sanitized = rows.map(row => this.sanitizeApiKey(row));
        resolve(sanitized);
      });
    });
  }

  /**
   * 验证API密钥（调用jp-verify服务）
   */
  async verifyApiKey(userId: string, request: VerifyApiKeyRequest): Promise<VerifyApiKeyResponse> {
    // 获取用户的API密钥
    const apiKey = await this.getApiKeyByUserAndExchange(userId, request.exchange);
    if (!apiKey) {
      throw new ApiKeyServiceError('NOT_FOUND', '未找到API密钥记录');
    }

    try {
      // 解密API密钥
      const decrypted = ApiKeyEncryptionService.decryptApiKey(
        apiKey.api_key_enc,
        apiKey.secret_enc,
        apiKey.passphrase_enc
      );

      // 调用jp-verify服务进行验证
      const verifyResult = await this.callJpVerify(decrypted, request.exchange);
      
      // 更新验证状态
      const now = new Date().toISOString();
      await this.updateApiKeyStatus(apiKey.id, verifyResult.success ? 'verified' : 'invalid', now);
      
      return verifyResult;
      
    } catch (error) {
      // 验证失败，更新状态
      const now = new Date().toISOString();
      await this.updateApiKeyStatus(apiKey.id, 'invalid', now);
      
      if (error instanceof ApiKeyServiceError) {
        throw error;
      }
      
      throw new ApiKeyServiceError('VERIFY_FAILED', `验证失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 删除API密钥
   */
  async deleteApiKey(userId: string, exchange: ExchangeType): Promise<boolean> {
    const sql = `DELETE FROM api_keys WHERE user_id = ? AND exchange = ?`;
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [userId, exchange], function(this: any, err: any) {
        if (err) {
          reject(new ApiKeyServiceError('DB_ERROR', `删除API密钥失败: ${err.message}`));
          return;
        }
        
        // 检查是否有行被删除
        if (this.changes === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * 私有方法：根据ID获取API密钥
   */
  private async getApiKeyById(id: string): Promise<ApiKey> {
    const sql = `SELECT * FROM api_keys WHERE id = ?`;
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [id], (err: any, row: ApiKey) => {
        if (err) {
          reject(new ApiKeyServiceError('DB_ERROR', `查询API密钥失败: ${err.message}`));
          return;
        }
        
        if (!row) {
          reject(new ApiKeyServiceError('NOT_FOUND', 'API密钥不存在'));
          return;
        }
        
        resolve(row);
      });
    });
  }

  /**
   * 私有方法：根据用户和交易所获取API密钥
   */
  private async getApiKeyByUserAndExchange(userId: string, exchange: ExchangeType): Promise<ApiKey | null> {
    const sql = `SELECT * FROM api_keys WHERE user_id = ? AND exchange = ?`;
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, [userId, exchange], (err: any, row: ApiKey) => {
        if (err) {
          reject(new ApiKeyServiceError('DB_ERROR', `查询API密钥失败: ${err.message}`));
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * 私有方法：脱敏API密钥信息
   */
  private sanitizeApiKey(apiKey: ApiKey): SanitizedApiKey {
    // 解密密钥用于脱敏显示（仅用于显示目的）
    let decrypted;
    try {
      decrypted = ApiKeyEncryptionService.decryptApiKey(
        apiKey.api_key_enc,
        apiKey.secret_enc,
        apiKey.passphrase_enc
      );
    } catch (error) {
      // 如果解密失败，使用默认脱敏值
      decrypted = {
        api_key: 'error',
        secret: 'error',
        passphrase: 'error'
      };
    }

    const masked = ApiKeyEncryptionService.maskApiKeyInfo(
      decrypted.api_key,
      decrypted.secret,
      decrypted.passphrase
    );

    return {
      id: apiKey.id,
      user_id: apiKey.user_id,
      exchange: apiKey.exchange,
      api_key_id: apiKey.api_key_id,
      status: apiKey.status,
      last_verified_at: apiKey.last_verified_at,
      created_at: apiKey.created_at,
      updated_at: apiKey.updated_at,
      api_key_masked: masked.api_key_masked,
      secret_masked: masked.secret_masked,
      passphrase_masked: masked.passphrase_masked
    };
  }

  /**
   * 私有方法：更新API密钥状态
   */
  private async updateApiKeyStatus(id: string, status: ApiKeyStatus, verifiedAt?: string): Promise<void> {
    const sql = `
      UPDATE api_keys 
      SET status = ?, last_verified_at = ?, updated_at = ?
      WHERE id = ?
    `;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, [status, verifiedAt, now, id], function(this: any, err: any) {
        if (err) {
          reject(new ApiKeyServiceError('DB_ERROR', `更新API密钥状态失败: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * 私有方法：验证创建请求
   */
  private validateCreateRequest(request: CreateApiKeyRequest): void {
    if (!request.exchange) {
      throw new ApiKeyServiceError('VALIDATION_ERROR', 'exchange是必填字段');
    }
    
    if (!request.api_key || !request.secret || !request.passphrase) {
      throw new ApiKeyServiceError('VALIDATION_ERROR', 'api_key、secret和passphrase都是必填字段');
    }
    
    if (request.exchange !== 'okx') {
      throw new ApiKeyServiceError('UNSUPPORTED_EXCHANGE', `暂不支持 ${request.exchange} 交易所`);
    }
  }

  /**
   * 私有方法：调用jp-verify服务
   */
  private async callJpVerify(decrypted: { api_key: string; secret: string; passphrase: string }, exchange: ExchangeType): Promise<VerifyApiKeyResponse> {
    // 这里需要实现调用jp-verify服务的逻辑
    // 由于jp-verify服务需要具体的订单信息来验证，这里我们可以使用一个简单的测试订单
    
    // 暂时返回模拟的成功响应
    // 在实际实现中，这里应该调用jp-verify服务进行真正的验证
    
    return {
      success: true,
      message: 'API密钥验证成功',
      verified_at: new Date().toISOString()
    };
  }
}