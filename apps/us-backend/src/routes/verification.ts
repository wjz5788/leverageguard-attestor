import { Router } from 'express';
import { VerificationService } from '../services/verificationService.js';
import { dbManager } from '../database/db.js';
import { createApiKeyAuthMiddleware } from '../middleware/apiKeyAuth.js';
import { ZodError } from 'zod';
import { handleZodError } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';

export default function verificationRoutes(dbManager: typeof dbManager) {
  const router = Router();
  const verificationService = new VerificationService(dbManager);
  const requireApiKey = createApiKeyAuthMiddleware(dbManager);

  /**
   * @openapi
   * /api/v1/verification/verify:
   *   post:
   *     summary: 提交验证请求
   *     description: 提交一个新的验证请求，用于检查用户的资格
   *     security:
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 description: 钱包地址
   *               chainId:
   *                 type: number
   *                 description: 链ID
   *               signature:
   *                 type: string
   *                 description: 签名
   *               message:
   *                 type: string
   *                 description: 签名消息
   *             required:
   *               - walletAddress
   *               - chainId
   *               - signature
   *               - message
   *     responses:
   *       200:
   *         description: 验证请求已提交
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     status:
   *                       type: string
   *       400:
   *         description: 请求参数错误
   *       401:
   *         description: API密钥无效
   */
  router.post('/verification/verify', requireApiKey, async (req, res) => {
    try {
      const { walletAddress, chainId, signature, message } = req.body;
      
      // 调用验证服务处理验证请求
      const result = await verificationService.processVerification({
        walletAddress,
        chainId,
        signature,
        message
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return handleZodError(error, res);
      }
      
      logger.error('Verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * @openapi
   * /api/v1/verification/result/{id}:
   *   get:
   *     summary: 获取验证结果
   *     description: 根据验证ID获取验证结果
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: 验证ID
   *     responses:
   *       200:
   *         description: 返回验证结果
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     status:
   *                       type: string
   *                     result:
   *                       type: boolean
   *                     reason:
   *                       type: string
   *       400:
   *         description: 请求参数错误
   *       401:
   *         description: API密钥无效
   *       404:
   *         description: 验证记录未找到
   */
  router.get('/verification/result/:id', requireApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      
      // 获取验证结果
      const result = await verificationService.getVerificationResult(id);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Verification not found'
        });
      }
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return handleZodError(error, res);
      }
      
      logger.error('Get verification result error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * @openapi
   * /api/v1/verification/history:
   *   get:
   *     summary: 获取验证历史记录
   *     description: 获取指定钱包地址的验证历史记录
   *     security:
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: query
   *         name: walletAddress
   *         required: true
   *         schema:
   *           type: string
   *         description: 钱包地址
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           default: 10
   *         description: 返回记录数量限制
   *       - in: query
   *         name: offset
   *         required: false
   *         schema:
   *           type: integer
   *           default: 0
   *         description: 偏移量
   *     responses:
   *       200:
   *         description: 返回验证历史记录
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       walletAddress:
   *                         type: string
   *                       status:
   *                         type: string
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *       400:
   *         description: 请求参数错误
   *       401:
   *         description: API密钥无效
   */
  router.get('/verification/history', requireApiKey, async (req, res) => {
    try {
      const { walletAddress, limit = '10', offset = '0' } = req.query as { 
        walletAddress: string; 
        limit?: string; 
        offset?: string 
      };
      
      // 获取验证历史记录
      const history = await verificationService.getVerificationHistory(
        walletAddress,
        parseInt(limit),
        parseInt(offset)
      );
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return handleZodError(error, res);
      }
      
      logger.error('Get verification history error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  return router;
}