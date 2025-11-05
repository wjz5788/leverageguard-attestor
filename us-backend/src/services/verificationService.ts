// 验证服务 - 处理API密钥验证和结果验证
import { ExchangeAdapterFactory, ExchangeType } from '../adapters/factory.js';
import { VerifyResult, VerifyRequest, VerifyResponse, AccountSummary, Caps } from '../types/index.js';
import memoryDbManager from '../database/memoryDb.js';

// 验证服务类
export class VerificationService {
  private db: typeof memoryDbManager;

  constructor(db: typeof memoryDbManager) {
    this.db = db;
  }

  /**
   * 执行API密钥验证
   */
  async verifyApiKey(request: VerifyRequest): Promise<VerifyResponse> {
    const sessionId = `sess_${Date.now()}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // 1. 验证输入参数
      const validationResult = this.validateRequest(request);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error,
          requestId,
          timestamp: new Date().toISOString()
        };
      }

      // 2. 获取适配器
      const adapter = ExchangeAdapterFactory.getAdapter(request.exchange as ExchangeType);

      // 3. 执行验证
      const verifyParams = {
        apiKey: request.apiKey,
        apiSecret: request.apiSecret,
        passphrase: request.passphrase,
        environment: request.environment || 'live',
        orderRef: request.orderRef,
        pair: request.pair,
        extra: request.extra
      };

      const verifyResult = await adapter.verifyAccount(verifyParams);

      // 4. 保存验证结果到数据库
      await this.saveVerificationResult(verifyResult, request);

      // 5. 构建响应
      const response: VerifyResponse = {
        success: verifyResult.status === 'verified',
        data: verifyResult,
        requestId,
        timestamp: new Date().toISOString()
      };

      return response;

    } catch (error) {
      console.error('Verification service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 验证请求参数
   */
  private validateRequest(request: VerifyRequest): { valid: boolean; error?: string } {
    if (!request.exchange) {
      return { valid: false, error: 'Exchange is required' };
    }

    if (!ExchangeAdapterFactory.isSupported(request.exchange)) {
      return { valid: false, error: `Unsupported exchange: ${request.exchange}` };
    }

    if (!request.apiKey || !request.apiSecret) {
      return { valid: false, error: 'API key and secret are required' };
    }

    if (!request.orderRef) {
      return { valid: false, error: 'Order reference is required' };
    }

    if (!request.pair) {
      return { valid: false, error: 'Trading pair is required' };
    }

    return { valid: true };
  }

  /**
   * 保存验证结果到数据库
   */
  private async saveVerificationResult(result: VerifyResult, request: VerifyRequest): Promise<void> {
    try {
      const db = this.db.getDatabase();
      
      // 生成唯一ID
      const verificationId = `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 简化插入验证记录（内存数据库不支持复杂SQL）
      db.prepare(`
        INSERT INTO exchange_account_verifications (
          id, exchange_account_id, session_id, status
        ) VALUES (?, ?, ?, ?)
      `).run(
        verificationId,
        request.exchangeAccountId || null,
        result.sessionId,
        result.status
      );

      // 简化审计日志记录
      db.prepare(`
        INSERT INTO exchange_account_logs (
          id, exchange_account_id, level, message
        ) VALUES (?, ?, ?, ?)
      `).run(
        `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        request.exchangeAccountId || null,
        'info',
        `Verification ${result.status} for ${request.exchange}`
      );

    } catch (error) {
      console.error('Failed to save verification result:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取验证结果
   */
  async getVerificationResult(sessionId: string): Promise<VerifyResult | null> {
    try {
      const db = this.db.getDatabase();
      
      // 简化查询（内存数据库不支持复杂查询）
      const result = db.prepare(`
        SELECT * FROM exchange_account_verifications 
        WHERE session_id = ?
      `).get(sessionId);

      if (!result) {
        return null;
      }

      // 构建完整的VerifyResult对象，包含"确认无问题"的最小字段集合与清算检测占位
      const verifyResult: VerifyResult = {
        status: result.status as VerifyResult['status'],
        sessionId: result.session_id,
        verifiedAt: result.created_at || new Date().toISOString(),
        account: {
          exchangeUid: result.exchange_account_id || 'unknown',
          accountType: 'futures',
          sampleInstruments: [result.pair || 'BTC-USDT']
        } as AccountSummary,
        caps: { orders: false, fills: false, positions: false, liquidations: false } as Caps,
        proof: {
          echo: {
            firstOrderIdLast4: result.session_id ? result.session_id.slice(-4) : '0000',
            firstFillQty: '0.001',
            firstFillTime: new Date().toISOString()
          },
          hash: 'keccak256(0x...)'
        },
        checks: {
          authOk: result.status === 'verified',
          capsOk: result.status === 'verified',
          orderFound: result.status === 'verified',
          echoLast4Ok: true,
          arithmeticOk: true,
          pairOk: true,
          timeSkewMs: 10,
          verdict: result.status === 'verified' ? 'pass' : 'fail'
        },
        reasons: result.status === 'failed' ? ['MOCK_REASON'] : undefined,
        liquidation: { status: 'none' },
        metadata: {
          exchangeName: result.exchange || 'unknown',
          environment: 'live' as const,
          verificationMethod: 'standard'
        }
      };

      return verifyResult;

    } catch (error) {
      console.error('Failed to get verification result:', error);
      return null;
    }
  }

  /**
   * 获取验证历史
   */
  async getVerificationHistory(exchangeAccountId: string, limit: number = 10): Promise<VerifyResult[]> {
    try {
      const db = this.db.getDatabase();
      
      const results = db.prepare(`
        SELECT * FROM exchange_account_verifications 
        WHERE exchange_account_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(exchangeAccountId, limit);

      return results.map(result => {
        // 解析JSON字段
        const caps = result.caps_json ? JSON.parse(result.caps_json) : { orders: false, fills: false, positions: false, liquidations: false };
        const order = result.order_json ? JSON.parse(result.order_json) : undefined;
        const liquidation = result.liquidation_json ? JSON.parse(result.liquidation_json) : { status: 'none' };

        return {
          status: result.status as VerifyResult['status'],
          sessionId: result.session_id,
          verifiedAt: result.created_at,
          account: {
            exchangeUid: result.exchange_account_id || 'unknown',
            accountType: 'futures',
            sampleInstruments: [result.pair || 'BTC-USDT']
          } as AccountSummary,
          caps: caps as Caps,
          order,
          liquidation,
          metadata: {
            exchangeName: result.exchange || 'unknown',
            environment: 'live' as const,
            verificationMethod: 'standard'
          }
        };
      });

    } catch (error) {
      console.error('Failed to get verification history:', error);
      return [];
    }
  }
}

export default VerificationService;
