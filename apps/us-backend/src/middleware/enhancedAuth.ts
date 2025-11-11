import { Request, Response, NextFunction } from 'express';
import { ApiKeyAuthMiddleware, ApiKeyInfo } from './apiKeyAuth.js';
import { AuthenticatedRequest, extractToken } from './authMiddleware.js';
import AuthService from '../services/authService.js';

/**
 * 增强认证配置
 */
export interface EnhancedAuthConfig {
  /** 是否要求认证 */
  requireAuth: boolean;
  /** 允许的认证方式 */
  allowedMethods: ('jwt' | 'apiKey')[];
  /** 权限要求 */
  requiredPermissions: string[];
  /** 是否启用审计日志 */
  enableAuditLog: boolean;
}

/**
 * 增强认证中间件
 */
export class EnhancedAuthMiddleware {
  private authService: AuthService;
  private apiKeyAuth: ApiKeyAuthMiddleware;

  constructor(authService: AuthService, apiKeyAuth?: ApiKeyAuthMiddleware) {
    this.authService = authService;
    this.apiKeyAuth = apiKeyAuth || new ApiKeyAuthMiddleware();
  }

  /**
   * 增强认证中间件
   */
  public middleware(config: Partial<EnhancedAuthConfig> = {}) {
    const fullConfig: EnhancedAuthConfig = {
      requireAuth: config.requireAuth !== false,
      allowedMethods: config.allowedMethods || ['jwt', 'apiKey'],
      requiredPermissions: config.requiredPermissions || [],
      enableAuditLog: config.enableAuditLog !== false
    };

    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        // 审计日志
        if (fullConfig.enableAuditLog) {
          this.logAuthAttempt(req);
        }

        // 尝试JWT认证
        if (fullConfig.allowedMethods.includes('jwt')) {
          const jwtResult = await this.authenticateJWT(req);
          if (jwtResult.authenticated) {
            return this.handleSuccess(req, res, next, 'jwt', jwtResult.userInfo);
          }
        }

        // 尝试API密钥认证
        if (fullConfig.allowedMethods.includes('apiKey')) {
          const apiKeyResult = await this.authenticateApiKey(req);
          if (apiKeyResult.authenticated) {
            return this.handleSuccess(req, res, next, 'apiKey', apiKeyResult.keyInfo);
          }
        }

        // 认证失败处理
        if (fullConfig.requireAuth) {
          return this.handleFailure(res, fullConfig.allowedMethods);
        }

        // 允许匿名访问
        next();
      } catch (error) {
        console.error('Enhanced auth error:', error);
        return res.status(500).json({
          error: 'AUTH_ERROR',
          message: '认证过程发生错误'
        });
      }
    };
  }

  /**
   * JWT认证
   */
  private async authenticateJWT(req: AuthenticatedRequest): Promise<{
    authenticated: boolean;
    userInfo?: any;
  }> {
    try {
      const token = extractToken(req);
      if (!token) {
        return { authenticated: false };
      }

      const user = await this.authService.validateSession(token);
      if (!user) {
        return { authenticated: false };
      }

      return {
        authenticated: true,
        userInfo: {
          type: 'user',
          id: user.userId,
          loginType: user.loginType,
          profile: user.profile
        }
      };
    } catch (error) {
      return { authenticated: false };
    }
  }

  /**
   * API密钥认证
   */
  private async authenticateApiKey(req: Request): Promise<{
    authenticated: boolean;
    keyInfo?: ApiKeyInfo;
  }> {
    try {
      // 提取API密钥
      const authHeader = req.headers.authorization;
      let apiKey: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7).trim();
      } else if (req.headers['x-api-key']) {
        apiKey = req.headers['x-api-key'] as string;
      } else if (req.query.apiKey) {
        apiKey = req.query.apiKey as string;
      }

      if (!apiKey) {
        return { authenticated: false };
      }

      const keyInfo = this.apiKeyAuth.validateApiKey(apiKey);
      if (!keyInfo) {
        return { authenticated: false };
      }

      return {
        authenticated: true,
        keyInfo
      };
    } catch (error) {
      return { authenticated: false };
    }
  }

  /**
   * 处理认证成功
   */
  private handleSuccess(
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction,
    method: string,
    authInfo: any
  ) {
    // 设置认证信息
    req.auth = {
      ...req.auth,
      method,
      authInfo,
      authenticatedAt: new Date().toISOString()
    };

    // 添加审计头
    res.setHeader('X-Auth-Method', method);
    res.setHeader('X-Auth-Identity', authInfo.id || 'unknown');

    // 审计日志
    this.logAuthSuccess(req, method, authInfo);

    next();
  }

  /**
   * 处理认证失败
   */
  private handleFailure(res: Response, allowedMethods: string[]) {
    const errorMessage = allowedMethods.length === 1 
      ? `需要${allowedMethods[0] === 'jwt' ? 'JWT令牌' : 'API密钥'}认证`
      : '需要有效的认证凭证';

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: errorMessage,
      allowedMethods
    });
  }

  /**
   * 记录认证尝试
   */
  private logAuthAttempt(req: Request): void {
    console.log(`[AUTH] 认证尝试: ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录认证成功
   */
  private logAuthSuccess(req: Request, method: string, authInfo: any): void {
    console.log(`[AUTH] 认证成功: ${req.method} ${req.path}`, {
      method,
      identity: authInfo.id,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 订单相关认证中间件（严格模式）
   */
  public orderAuth() {
    return this.middleware({
      requireAuth: true,
      allowedMethods: ['jwt', 'apiKey'],
      requiredPermissions: ['orders:create', 'orders:read'],
      enableAuditLog: true
    });
  }

  /**
   * 赔付相关认证中间件（严格模式）
   */
  public payoutAuth() {
    return this.middleware({
      requireAuth: true,
      allowedMethods: ['jwt', 'apiKey'],
      requiredPermissions: ['payouts:create', 'payouts:read'],
      enableAuditLog: true
    });
  }

  /**
   * 索赔相关认证中间件（严格模式）
   */
  public claimAuth() {
    return this.middleware({
      requireAuth: true,
      allowedMethods: ['jwt', 'apiKey'],
      requiredPermissions: ['claims:create', 'claims:read'],
      enableAuditLog: true
    });
  }

  /**
   * 管理接口认证中间件（管理员权限）
   */
  public adminAuth() {
    return this.middleware({
      requireAuth: true,
      allowedMethods: ['jwt'], // 管理接口只允许JWT认证
      requiredPermissions: ['admin:*'],
      enableAuditLog: true
    });
  }
}

/**
 * 创建增强认证中间件
 */
export function createEnhancedAuthMiddleware(
  authService: AuthService, 
  apiKeyAuth?: ApiKeyAuthMiddleware
): EnhancedAuthMiddleware {
  return new EnhancedAuthMiddleware(authService, apiKeyAuth);
}