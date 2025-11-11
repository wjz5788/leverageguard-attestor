import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * API密钥配置
 */
export interface ApiKeyConfig {
  /** API密钥前缀 */
  prefix: string;
  /** 密钥长度 */
  keyLength: number;
  /** 签名算法 */
  algorithm: string;
  /** 签名有效期（秒） */
  signatureTtl: number;
}

/**
 * API密钥信息
 */
export interface ApiKeyInfo {
  /** 密钥ID */
  keyId: string;
  /** 密钥名称 */
  name: string;
  /** 权限范围 */
  scopes: string[];
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt?: Date;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * API密钥验证中间件
 */
export class ApiKeyAuthMiddleware {
  private apiKeys: Map<string, ApiKeyInfo> = new Map();
  private config: ApiKeyConfig;

  constructor(config?: Partial<ApiKeyConfig>) {
    this.config = {
      prefix: config?.prefix || 'lkp_',
      keyLength: config?.keyLength || 32,
      algorithm: config?.algorithm || 'sha256',
      signatureTtl: config?.signatureTtl || 300 // 5分钟
    };
  }

  /**
   * 生成API密钥
   */
  public generateApiKey(name: string, scopes: string[] = [], expiresInDays?: number): { key: string; info: ApiKeyInfo } {
    const keyId = crypto.randomBytes(16).toString('hex');
    const secret = crypto.randomBytes(this.config.keyLength).toString('hex');
    const apiKey = `${this.config.prefix}${keyId}_${secret}`;

    const now = new Date();
    const expiresAt = expiresInDays ? 
      new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000) : 
      undefined;

    const keyInfo: ApiKeyInfo = {
      keyId,
      name,
      scopes,
      createdAt: now,
      expiresAt,
      enabled: true
    };

    this.apiKeys.set(keyId, keyInfo);

    return { key: apiKey, info: keyInfo };
  }

  /**
   * 验证API密钥
   */
  public validateApiKey(apiKey: string): ApiKeyInfo | null {
    if (!apiKey.startsWith(this.config.prefix)) {
      return null;
    }

    const parts = apiKey.slice(this.config.prefix.length).split('_');
    if (parts.length !== 2) {
      return null;
    }

    const [keyId, secret] = parts;
    const keyInfo = this.apiKeys.get(keyId);

    if (!keyInfo || !keyInfo.enabled) {
      return null;
    }

    // 检查是否过期
    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      return null;
    }

    return keyInfo;
  }

  /**
   * 验证签名
   */
  public validateSignature(
    apiKey: string, 
    signature: string, 
    timestamp: string, 
    method: string, 
    path: string, 
    body?: string
  ): boolean {
    try {
      // 验证时间戳
      const requestTime = parseInt(timestamp, 10);
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - requestTime);

      if (timeDiff > this.config.signatureTtl * 1000) {
        return false; // 签名过期
      }

      // 验证API密钥
      const keyInfo = this.validateApiKey(apiKey);
      if (!keyInfo) {
        return false;
      }

      // 生成签名
      const expectedSignature = this.generateSignature(
        apiKey, 
        timestamp, 
        method, 
        path, 
        body
      );

      // 比较签名（使用恒定时间比较防止时序攻击）
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成签名
   */
  private generateSignature(
    apiKey: string, 
    timestamp: string, 
    method: string, 
    path: string, 
    body?: string
  ): string {
    const payload = [
      apiKey,
      timestamp,
      method.toUpperCase(),
      path,
      body || ''
    ].join('|');

    return crypto
      .createHash(this.config.algorithm)
      .update(payload)
      .digest('hex');
  }

  /**
   * 检查权限范围
   */
  public checkScopes(keyInfo: ApiKeyInfo, requiredScopes: string[]): boolean {
    if (requiredScopes.length === 0) {
      return true; // 不需要特定权限
    }

    return requiredScopes.every(scope => 
      keyInfo.scopes.includes(scope) || 
      keyInfo.scopes.includes('*') // 通配符权限
    );
  }

  /**
   * API密钥认证中间件
   */
  public middleware(requiredScopes: string[] = []) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // 提取API密钥
        const apiKey = this.extractApiKey(req);
        if (!apiKey) {
          return res.status(401).json({
            error: 'MISSING_API_KEY',
            message: 'API密钥是必需的'
          });
        }

        // 验证API密钥
        const keyInfo = this.validateApiKey(apiKey);
        if (!keyInfo) {
          return res.status(401).json({
            error: 'INVALID_API_KEY',
            message: '无效的API密钥'
          });
        }

        // 检查权限范围
        if (!this.checkScopes(keyInfo, requiredScopes)) {
          return res.status(403).json({
            error: 'INSUFFICIENT_SCOPES',
            message: 'API密钥权限不足',
            required: requiredScopes,
            granted: keyInfo.scopes
          });
        }

        // 验证签名（如果提供了签名）
        const signature = req.headers['x-signature'] as string;
        const timestamp = req.headers['x-timestamp'] as string;

        if (signature && timestamp) {
          const body = req.method !== 'GET' ? JSON.stringify(req.body) : undefined;
          
          if (!this.validateSignature(apiKey, signature, timestamp, req.method, req.path, body)) {
            return res.status(401).json({
              error: 'INVALID_SIGNATURE',
              message: '签名验证失败'
            });
          }
        }

        // 将密钥信息添加到请求对象
        (req as any).apiKey = keyInfo;

        next();
      } catch (error) {
        console.error('API key auth error:', error);
        return res.status(500).json({
          error: 'AUTH_ERROR',
          message: '认证过程发生错误'
        });
      }
    };
  }

  /**
   * 从请求中提取API密钥
   */
  private extractApiKey(req: Request): string | null {
    // 从Authorization头提取
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    // 从查询参数提取
    const queryKey = req.query.apiKey as string;
    if (queryKey) {
      return queryKey;
    }

    // 从请求体提取（仅限POST请求）
    if (req.method === 'POST' && req.body && req.body.apiKey) {
      return req.body.apiKey;
    }

    return null;
  }

  /**
   * 禁用API密钥
   */
  public disableApiKey(keyId: string): boolean {
    const keyInfo = this.apiKeys.get(keyId);
    if (keyInfo) {
      keyInfo.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * 获取所有API密钥
   */
  public listApiKeys(): ApiKeyInfo[] {
    return Array.from(this.apiKeys.values());
  }
}

/**
 * 默认API密钥认证中间件
 */
export const apiKeyAuth = new ApiKeyAuthMiddleware().middleware();