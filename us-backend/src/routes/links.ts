import express from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, RequireAuthMiddleware } from '../middleware/authMiddleware.js';
import { LinkService, CreateLinkSchema } from '../services/linkService.js';

export default function linksRoutes(requireAuth: RequireAuthMiddleware, linkService: LinkService) {
  const router = express.Router();

  // 创建支付链接
  router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    const parseResult = CreateLinkSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Link creation payload is invalid.',
        issues: parseResult.error.issues
      });
    }

    try {
      const link = await linkService.createLink(parseResult.data);
      return res.status(201).json({ link });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create payment link.'
      });
    }
  });

  // 根据ID获取链接
  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    try {
      const link = await linkService.getLinkById(id);
      if (!link) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Payment link not found.'
        });
      }
      return res.status(200).json({ link });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve payment link.'
      });
    }
  });

  // 根据订单ID获取链接
  router.get('/order/:orderId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { orderId } = req.params;
    
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    try {
      const link = await linkService.getLinkByOrderId(orderId);
      if (!link) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Payment link for this order not found.'
        });
      }
      return res.status(200).json({ link });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve payment link.'
      });
    }
  });

  // 更新链接状态
  router.put('/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    const statusSchema = z.enum(['pending', 'paid', 'expired']);
    const parseResult = statusSchema.safeParse(status);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Invalid status value.',
        issues: parseResult.error.issues
      });
    }

    try {
      const link = await linkService.updateLinkStatus(id, parseResult.data);
      if (!link) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Payment link not found.'
        });
      }
      return res.status(200).json({ link });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to update payment link status.'
      });
    }
  });

  // 获取所有链接（管理员功能）
  router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    try {
      const links = await linkService.getAllLinks();
      return res.status(200).json({ links });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve payment links.'
      });
    }
  });

  // 删除链接
  router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    
    // 检查是否是AuthenticatedUser类型
    if (!('userId' in req.auth!)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }
    
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    try {
      const success = await linkService.deleteLink(id);
      if (!success) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Payment link not found.'
        });
      }
      return res.status(200).json({ message: 'Payment link deleted successfully.' });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete payment link.'
      });
    }
  });

  return router;
}
