// 验证路由 - 处理API密钥验证请求
import express from 'express';
import memoryDbManager from '../database/memoryDb.js';
import VerificationService from '../services/verificationService.js';
import ValidatorService from '../services/validatorService.js';
import { VerifyRequest, VerifyResponse } from '../types/index.js';

const router = express.Router();

/**
 * POST /api/v1/verification/verify
 * 验证API密钥
 */
router.post('/verify', async (req, res) => {
  try {
    const request: VerifyRequest = req.body;
    
    // 验证请求参数
    const validator = new ValidatorService();
    const validationResult = validator.validateRequest(request);
    
    if (!validationResult.valid) {
      return res.status(400).json({
        status: 'failed',
        error: 'Validation failed',
        details: validationResult.errors
      });
    }

    // 创建验证服务实例
    const dbManager = req.app.get('dbManager') as typeof memoryDbManager;
    const verificationService = new VerificationService(dbManager);
    
    // 执行验证
    const response = await verificationService.verifyApiKey(request);
    
    // 返回响应
    res.status(response.status === 'success' ? 200 : 400).json(response);
    
  } catch (error) {
    console.error('Verification route error:', error);
    res.status(500).json({
      status: 'failed',
      error: 'Internal server error',
      sessionId: `sess_${Date.now()}`,
      verifiedAt: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v1/verification/result/:sessionId
 * 获取验证结果
 */
router.get('/result/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    // 创建验证服务实例
    const dbManager = req.app.get('dbManager') as typeof memoryDbManager;
    const verificationService = new VerificationService(dbManager);
    
    // 获取验证结果
    const result = await verificationService.getVerificationResult(sessionId);
    
    if (!result) {
      return res.status(404).json({
        error: 'Verification result not found'
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Get verification result error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/verification/history/:accountId
 * 获取验证历史
 */
router.get('/history/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = '10' } = req.query;
    
    if (!accountId) {
      return res.status(400).json({
        error: 'Account ID is required'
      });
    }

    // 创建验证服务实例
    const dbManager = req.app.get('dbManager') as typeof memoryDbManager;
    const verificationService = new VerificationService(dbManager);
    
    // 获取验证历史
    const history = await verificationService.getVerificationHistory(
      accountId, 
      parseInt(limit as string)
    );
    
    res.json({
      accountId,
      count: history.length,
      history
    });
    
  } catch (error) {
    console.error('Get verification history error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/verification/validate
 * 验证请求参数（不执行实际验证）
 */
router.post('/validate', async (req, res) => {
  try {
    const request: VerifyRequest = req.body;
    
    // 验证请求参数
    const validator = new ValidatorService();
    const validationResult = validator.validateRequest(request);
    const securityCheck = validator.checkApiKeySecurity(request.apiKey);
    const report = validator.generateValidationReport(request);
    
    res.json({
      validation: validationResult,
      security: securityCheck,
      report
    });
    
  } catch (error) {
    console.error('Validation route error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/verification/supported-exchanges
 * 获取支持的交易所列表和字段配置
 */
router.get('/supported-exchanges', (req, res) => {
  try {
    // 交易所字段定义（与前端保持一致）
    const EXCHANGES_META = {
      OKX: {
        label: 'OKX',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true },
          { key: 'apiSecret', label: 'API Secret', sensitive: true },
          { key: 'passphrase', label: 'Passphrase', sensitive: true },
        ],
      },
      Hyperliquid: {
        label: 'Hyperliquid',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true },
          { key: 'apiSecret', label: 'API Secret / Signing Key', sensitive: true },
          { key: 'accountId', label: 'Account ID / SubAccount', sensitive: false },
        ],
      },
      Binance: {
        label: 'Binance',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true },
          { key: 'apiSecret', label: 'API Secret', sensitive: true },
        ],
      },
    } as const;
    
    res.json({
      exchanges: Object.keys(EXCHANGES_META),
      fields: EXCHANGES_META,
      environments: ['live', 'testnet']
    });
    
  } catch (error) {
    console.error('Supported exchanges route error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

export default (dbManager: typeof memoryDbManager) => {
  // 将数据库管理器注入到请求对象中
  router.use((req, res, next) => {
    req.app.set('dbManager', dbManager);
    next();
  });
  
  return router;
};