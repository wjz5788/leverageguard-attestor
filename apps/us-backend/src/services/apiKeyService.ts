import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import dbManager, { type DatabaseInterface } from '../database/db.js';
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
  private db: DatabaseInterface;

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
      const updateSql = `
        UPDATE api_keys
        SET api_key_id = ?, key_id = ?, api_key_enc = ?, secret_enc = ?, passphrase_enc = ?,
            status = 'new', updated_at = ?
        WHERE user_id = ? AND exchange = ?
      `;
      const r = this.db.run(updateSql, apiKeyId, apiKeyId, encrypted.api_key_enc, encrypted.secret_enc, encrypted.passphrase_enc, now, userId, request.exchange);
      if (!r || r.changes < 0) {
        throw new ApiKeyServiceError('DB_ERROR', '更新API密钥失败');
      }
      const apiKey = await this.getApiKeyByUserAndExchange(userId, request.exchange);
      if (!apiKey) {
        throw new ApiKeyServiceError('NOT_FOUND', 'API密钥未找到');
      }
      return apiKey;
    } else {
      const insertSql = `
        INSERT INTO api_keys (
          id, user_id, exchange, api_key_id, key_id, api_key_enc, secret_enc, passphrase_enc,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const id = uuidv4();
      const r = this.db.run(insertSql, id, userId, request.exchange, apiKeyId, apiKeyId, encrypted.api_key_enc, encrypted.secret_enc, encrypted.passphrase_enc, 'new', now, now);
      if (!r || r.changes !== 1) {
        throw new ApiKeyServiceError('DB_ERROR', '保存API密钥失败');
      }
      const apiKey = await this.getApiKeyById(id);
      return apiKey;
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
    
    const rows = this.db.all(sql, userId) as ApiKey[];
    const sanitized = rows.map(row => this.sanitizeApiKey(row));
    return sanitized;
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
    
    const r = this.db.run(sql, userId, exchange);
    return !!(r && r.changes > 0);
  }

  /**
   * 私有方法：根据ID获取API密钥
   */
  private async getApiKeyById(id: string): Promise<ApiKey> {
    const sql = `SELECT * FROM api_keys WHERE id = ?`;
    
    const row = this.db.get(sql, id) as ApiKey | undefined;
    if (!row) {
      throw new ApiKeyServiceError('NOT_FOUND', 'API密钥不存在');
    }
    return row;
  }

  /**
   * 私有方法：根据用户和交易所获取API密钥
   */
  private async getApiKeyByUserAndExchange(userId: string, exchange: ExchangeType): Promise<ApiKey | null> {
    const sql = `SELECT * FROM api_keys WHERE user_id = ? AND exchange = ?`;
    
    const row = this.db.get(sql, userId, exchange) as ApiKey | undefined;
    return row || null;
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
    
    const r = this.db.run(sql, status, verifiedAt, now, id);
    if (!r) {
      throw new ApiKeyServiceError('DB_ERROR', '更新API密钥状态失败');
    }
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
    // 统一走本后端的 OKX 验证代理，从而写入 verify_results，供理赔校验复用
    const backendBase = (process.env.BACKEND_BASE_URL || `http://127.0.0.1:${process.env.PORT || '3006'}`).toString();
    const verifyUrl = `${backendBase}/api/v1/verify/standard`;

    // 在测试模式下，jp-verify 会接受测试订单；可由环境变量覆盖
    const ordId = (process.env.VERIFY_TEST_ORD_ID || 'TEST-ORDER').toString();
    const instId = (process.env.VERIFY_TEST_INST_ID || 'BTC-USDT-SWAP').toString();

    if (exchange !== 'okx') {
      throw new ApiKeyServiceError('UNSUPPORTED_EXCHANGE', `暂不支持 ${exchange} 交易所`);
    }

    try {
      const payload = {
        exchange: 'okx',
        ordId,
        instId,
        keyMode: 'inline',
        apiKey: decrypted.api_key,
        secretKey: decrypted.secret,
        passphrase: decrypted.passphrase,
        clientMode: 'minimal'
      };

      const resp = await axios.post(verifyUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
      const data = resp.data as any;
      const status = String(data?.status || '').toLowerCase();
      const success = status === 'verified';
      return {
        success,
        message: success ? 'API密钥验证成功' : 'API密钥验证失败',
        verified_at: data?.meta?.verifiedAt || new Date().toISOString(),
        error: success ? undefined : (data?.error?.code || 'VERIFY_FAILED')
      };
    } catch (error: any) {
      const code = error?.response?.data?.error?.code || (error?.code === 'ECONNREFUSED' ? 'SERVICE_UNAVAILABLE' : 'VERIFY_FAILED');
      throw new ApiKeyServiceError(code, `验证失败: ${error?.response?.data?.error?.msg || error?.message || String(error)}`);
    }
  }
}
