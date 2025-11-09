import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * 防重放攻击配置
 */
export interface ReplayProtectionConfig {
  /** 重放窗口时间（毫秒） */
  windowMs: number;
  /** 最大请求数限制 */
  maxRequests: number;
  /** 是否启用严格模式 */
  strictMode: boolean;
}

/**
 * 重放保护中间件
 */
export class ReplayProtectionMiddleware {
  private requestCache: Map<string, number[]> = new Map();
  private config: ReplayProtectionConfig;

  constructor(config?: Partial<ReplayProtectionConfig>) {
    this.config = {
      windowMs: config?.windowMs || 60000, // 默认1分钟
      maxRequests: config?.maxRequests || 5, // 默认5次请求
      strictMode: config?.strictMode !== false
    };

    // 定期清理过期缓存
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  /**
   * 生成请求指纹
   */
  private generateFingerprint(req: Request): string {
    const components = [
      req.method,
      req.path,
      req.headers['user-agent'],
      req.ip,
      JSON.stringify(req.query),
      JSON.stringify(req.body)
    ].filter(Boolean).join('|');

    return crypto.createHash('sha256').update(components).digest('hex');
  }

  /**
   * 生成请求ID（用于幂等性）
   */
  private generateRequestId(req: Request): string {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (idempotencyKey) {
      return `idempotency:${idempotencyKey}`;
    }

    // 如果没有幂等键，使用指纹+时间戳
    const fingerprint = this.generateFingerprint(req);
    const timestamp = Date.now().toString();
    return crypto.createHash('sha256').update(fingerprint + timestamp).digest('hex');
  }

  /**
   * 检查是否重放请求
   */
  private isReplayRequest(requestId: string, timestamp: number): boolean {
    const requests = this.requestCache.get(requestId) || [];
    
    // 检查时间窗口内的请求
    const recentRequests = requests.filter(t => 
      Date.now() - t <= this.config.windowMs
    );

    // 检查时间戳是否在合理范围内
    const timeDiff = Math.abs(Date.now() - timestamp);
    if (this.config.strictMode && timeDiff > this.config.windowMs) {
      return true; // 时间戳超出窗口
    }

    // 检查请求次数是否超过限制
    return recentRequests.length >= this.config.maxRequests;
  }

  /**
   * 记录请求
   */
  private recordRequest(requestId: string): void {
    const now = Date.now();
    const requests = this.requestCache.get(requestId) || [];
    
    // 添加新请求时间戳
    requests.push(now);
    
    // 清理过期请求
    const filteredRequests = requests.filter(t => 
      now - t <= this.config.windowMs
    );
    
    this.requestCache.set(requestId, filteredRequests);
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [requestId, requests] of this.requestCache.entries()) {
      const filteredRequests = requests.filter(t => 
        now - t <= this.config.windowMs
      );
      
      if (filteredRequests.length === 0) {
        this.requestCache.delete(requestId);
      } else {
        this.requestCache.set(requestId, filteredRequests);
      }
    }
  }

  /**
   * 中间件函数
   */
  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // 跳过GET请求的防重放检查
      if (req.method === 'GET') {
        return next();
      }

      try {
        const requestId = this.generateRequestId(req);
        const timestamp = this.extractTimestamp(req);

        // 检查重放
        if (this.isReplayRequest(requestId, timestamp)) {
          return res.status(429).json({
            error: 'REPLAY_DETECTED',
            message: '检测到重复请求，请稍后重试',
            retryAfter: Math.ceil(this.config.windowMs / 1000)
          });
        }

        // 记录请求
        this.recordRequest(requestId);

        // 添加请求ID到响应头
        res.setHeader('X-Request-Id', requestId);
        
        next();
      } catch (error) {
        console.error('Replay protection error:', error);
        // 防重放检查失败时，继续处理请求（安全第一）
        next();
      }
    };
  }

  /**
   * 提取请求时间戳
   */
  private extractTimestamp(req: Request): number {
    // 优先从自定义头获取时间戳
    const timestampHeader = req.headers['x-timestamp'] as string;
    if (timestampHeader) {
      const timestamp = parseInt(timestampHeader, 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    // 默认使用当前时间
    return Date.now();
  }

  /**
   * 重置缓存（用于测试）
   */
  public reset(): void {
    this.requestCache.clear();
  }
}

/**
 * 默认防重放中间件
 */
export const replayProtection = new ReplayProtectionMiddleware().middleware();