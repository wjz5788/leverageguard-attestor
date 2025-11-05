import express from 'express';
import { QuoteService } from '../services/quoteService';
import { CreateQuoteRequest } from '../models/product';

const router = express.Router();

/**
 * POST /api/quotes
 * 创建报价
 * 输入: product_id, principal, leverage
 * 返回: premium/payout 与 expires_at
 */
router.post('/', async (req, res) => {
  try {
    const { product_id, principal, leverage } = req.body;
    
    // 验证必填字段
    if (!product_id || !principal || !leverage) {
      return res.status(400).json({
        error: '缺少必要参数: product_id, principal, leverage'
      });
    }

    // 验证数据类型
    if (typeof principal !== 'number' || principal <= 0) {
      return res.status(400).json({
        error: 'principal 必须是正数'
      });
    }

    if (typeof leverage !== 'number' || leverage <= 0) {
      return res.status(400).json({
        error: 'leverage 必须是正数'
      });
    }

    // 获取用户ID（这里简化处理，实际应该从认证中间件获取）
    const userId = req.headers['x-user-id'] as string || 'demo_user';

    const request: CreateQuoteRequest = {
      product_id,
      principal,
      leverage
    };

    // 创建报价
    const quote = await QuoteService.createQuote(userId, request);

    res.json({
      success: true,
      data: quote
    });

  } catch (error: any) {
    console.error('创建报价失败:', error);
    res.status(400).json({
      error: error.message || '创建报价失败'
    });
  }
});

/**
 * GET /api/quotes/products
 * 获取产品列表
 */
router.get('/products', async (req, res) => {
  try {
    const products = await QuoteService.getProducts();
    res.json({
      success: true,
      data: products
    });
  } catch (error: any) {
    console.error('获取产品列表失败:', error);
    res.status(500).json({
      error: '获取产品列表失败'
    });
  }
});

/**
 * GET /api/quotes/products/:code
 * 根据产品代码获取产品信息
 */
router.get('/products/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const product = await QuoteService.getProductByCode(code.toUpperCase());
    
    if (!product) {
      return res.status(404).json({
        error: '产品不存在'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error: any) {
    console.error('获取产品信息失败:', error);
    res.status(500).json({
      error: '获取产品信息失败'
    });
  }
});

/**
 * GET /api/quotes/:id
 * 获取报价详情
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isValid = await QuoteService.validateQuote(id);
    
    if (!isValid) {
      return res.status(404).json({
        error: '报价不存在或已过期'
      });
    }

    // 这里可以返回更详细的报价信息
    res.json({
      success: true,
      data: { id, valid: true }
    });
  } catch (error: any) {
    console.error('获取报价详情失败:', error);
    res.status(500).json({
      error: '获取报价详情失败'
    });
  }
});

/**
 * POST /api/quotes/cleanup
 * 清理过期报价（管理接口）
 */
router.post('/cleanup', async (req, res) => {
  try {
    const cleanedCount = await QuoteService.cleanupExpiredQuotes();
    res.json({
      success: true,
      data: {
        cleaned_count: cleanedCount
      }
    });
  } catch (error: any) {
    console.error('清理过期报价失败:', error);
    res.status(500).json({
      error: '清理过期报价失败'
    });
  }
});

/**
 * GET /api/quotes/stats/:productId
 * 获取报价统计信息（管理接口）
 */
router.get('/stats/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const stats = await QuoteService.getQuoteStats(productId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('获取报价统计失败:', error);
    res.status(500).json({
      error: '获取报价统计失败'
    });
  }
});

export default router;