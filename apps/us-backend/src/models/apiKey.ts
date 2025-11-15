import type { StatusState } from './status';

/**
 * API密钥状态枚举
 */
export type ApiKeyStatus = 'new' | 'verified' | 'invalid';

/**
 * 支持的交易所枚举
 */
export type ExchangeType = 'okx';

/**
 * API密钥模型
 */
export interface ApiKey {
  id: string;
  user_id: string;
  exchange: ExchangeType;
  api_key_id?: string; // 可选，API密钥ID
  api_key_enc: string; // AES-GCM加密的API密钥
  secret_enc: string; // AES-GCM加密的Secret密钥
  passphrase_enc: string; // AES-GCM加密的Passphrase
  status: ApiKeyStatus;
  last_verified_at?: string; // 最后验证时间
  created_at: string;
  updated_at: string;
}

/**
 * 脱敏的API密钥信息（用于返回给前端）
 */
export interface SanitizedApiKey {
  id: string;
  user_id: string;
  exchange: ExchangeType;
  api_key_id?: string;
  status: ApiKeyStatus;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
  // 脱敏的密钥信息
  api_key_masked: string; // ****/最后4位
  secret_masked: string; // ****/最后4位
  passphrase_masked: string; // ****/最后4位
}

/**
 * 创建/更新API密钥的请求体
 */
export interface CreateApiKeyRequest {
  exchange: ExchangeType;
  api_key_id?: string;
  api_key: string; // 明文API密钥
  secret: string; // 明文Secret密钥
  passphrase: string; // 明文Passphrase
}

/**
 * 验证API密钥的请求体
 */
export interface VerifyApiKeyRequest {
  exchange: ExchangeType;
  // 验证时不需要密钥明文，使用已保存的加密密钥
}

/**
 * 验证API密钥的响应体
 */
export interface VerifyApiKeyResponse {
  success: boolean;
  message: string;
  verified_at?: string;
  error?: string;
}