// 验证服务V2路由 - 支持多种交易所的订单验证接口
import express from 'express';
import { dbManager } from '../database/db.js';
import VerificationService from '../services/verificationService.js';
import { VerifyRequest, VerifyResponse } from '../types/index.js';

const router = express.Router();

/**
 * POST /api/v2/verify/:exchange
 * 执行特定交易所的订单验证
 * 支持：okx, binance, hyperliquid
 */
router.post('/:exchange', async (req, res) => {
  try {
    const { exchange } = req.params;
    const request: VerifyRequest = req.body;
    
    // 设置交易所参数
    request.exchange = exchange;
    
    // 验证交易所支持
    const supportedExchanges = ['okx', 'binance', 'hyperliquid'];
    if (!supportedExchanges.includes(exchange.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `不支持的交易所: ${exchange}`,
        requestId: `req_${Date.now()}`,
        timestamp: new Date().toISOString()
      });
    }

    // 创建验证服务实例
    const verificationService = new VerificationService(dbManager);
    
    // 执行验证
    const response = await verificationService.verifyApiKey(request);
    
    // 返回响应
    res.status(response.status === 'success' ? 200 : 400).json(response);
    
  } catch (error) {
    console.error('V2验证路由错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '内部服务器错误',
      requestId: `req_${Date.now()}`,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/v2/verify/result/:sessionId
 * 获取验证结果
 */
router.get('/result/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID是必填字段'
      });
    }

    // 创建验证服务实例
    const verificationService = new VerificationService(dbManager);
    
    // 获取验证结果
    const result = await verificationService.getVerificationResult(sessionId);
    
    if (!result) {
      return res.status(404).json({
        error: '验证结果未找到'
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('获取验证结果错误:', error);
    res.status(500).json({
      error: '内部服务器错误'
    });
  }
});

/**
 * GET /api/v2/verify/history/:accountId
 * 获取验证历史
 */
router.get('/history/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = '10' } = req.query;
    
    if (!accountId) {
      return res.status(400).json({
        error: '账户ID是必填字段'
      });
    }

    // 创建验证服务实例
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
    console.error('获取验证历史错误:', error);
    res.status(500).json({
      error: '内部服务器错误'
    });
  }
});

/**
 * GET /api/v2/verify/supported-exchanges
 * 获取支持的交易所列表和字段配置
 */
router.get('/supported-exchanges', (req, res) => {
  try {
    // 交易所字段定义（与前端保持一致）
    const EXCHANGES_META = {
      okx: {
        label: 'OKX',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true, required: true },
          { key: 'apiSecret', label: 'API Secret', sensitive: true, required: true },
          { key: 'passphrase', label: 'Passphrase', sensitive: true, required: true },
          { key: 'orderRef', label: '订单ID', sensitive: false, required: true },
          { key: 'pair', label: '交易对', sensitive: false, required: true },
        ],
        environments: ['live', 'testnet']
      },
      binance: {
        label: 'Binance',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true, required: true },
          { key: 'apiSecret', label: 'API Secret', sensitive: true, required: true },
          { key: 'orderRef', label: '订单ID', sensitive: false, required: true },
          { key: 'pair', label: '交易对', sensitive: false, required: true },
        ],
        environments: ['live', 'testnet']
      },
      hyperliquid: {
        label: 'Hyperliquid',
        fields: [
          { key: 'apiKey', label: 'API Key', sensitive: true, required: true },
          { key: 'apiSecret', label: 'API Secret', sensitive: true, required: true },
          { key: 'orderRef', label: '订单ID', sensitive: false, required: true },
          { key: 'pair', label: '交易对', sensitive: false, required: true },
        ],
        environments: ['live', 'testnet']
      }
    } as const;
    
    res.json({
      exchanges: Object.keys(EXCHANGES_META),
      fields: EXCHANGES_META,
      environments: ['live', 'testnet']
    });
    
  } catch (error) {
    console.error('获取支持的交易所错误:', error);
    res.status(500).json({
      error: '内部服务器错误'
    });
  }
});

/**
 * POST /api/v2/verify/batch
 * 批量验证多个交易所账户
 */
router.post('/batch', async (req, res) => {
  try {
    const { requests } = req.body;
    
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        error: '请求列表不能为空'
      });
    }

    // 限制批量请求数量
    if (requests.length > 10) {
      return res.status(400).json({
        error: '批量请求数量不能超过10个'
      });
    }

    const verificationService = new VerificationService(dbManager);
    
    // 并行执行验证
    const results = await Promise.all(
      requests.map(async (request: VerifyRequest) => {
        try {
          const response = await verificationService.verifyApiKey(request);
          return {
            exchange: request.exchange,
            success: response.status === 'success',
            data: response.result,
            error: response.error
          };
        } catch (error) {
          return {
            exchange: request.exchange,
            success: false,
            error: error instanceof Error ? error.message : '验证失败'
          };
        }
      })
    );
    
    res.json({
      batchId: `batch_${Date.now()}`,
      count: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
    
  } catch (error) {
    console.error('批量验证错误:', error);
    res.status(500).json({
      error: '内部服务器错误'
    });
  }
});

export default (dbManager: typeof dbManager) => {
  // 将数据库管理器注入到请求对象中
  router.use((req, res, next) => {
    req.app.set('dbManager', dbManager);
    next();
  });
  
  return router;
};