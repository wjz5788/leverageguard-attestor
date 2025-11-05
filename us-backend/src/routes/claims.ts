import express from 'express';
import { z } from 'zod';
import ClaimsService, { ClaimsError } from '../services/claimsService.js';
import { createEnhancedAuthMiddleware } from '../middleware/enhancedAuth.js';
import AuthService from '../services/authService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// 请求验证模式
const createClaimSchema = z.object({
  orderId: z.string().min(1),
  claimType: z.enum(['liquidation', 'technical', 'dispute', 'other']),
  amountUSDC: z.number().positive(),
  description: z.string().min(10),
  evidenceFiles: z.array(z.string()).max(5)
});

const updateClaimSchema = z.object({
  status: z.enum(['pending', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'cancelled']).optional(),
  reviewNotes: z.string().optional(),
  payoutTxHash: z.string().optional(),
  payoutStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  payoutAmountUSDC: z.number().positive().optional()
});

const listClaimsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'cancelled']).optional()
});

export default function claimsRoutes(claimsService: ClaimsService, authService: AuthService) {
  const router = express.Router();
  
  // 创建增强认证中间件
  const enhancedAuth = createEnhancedAuthMiddleware(authService);
  
  // 赔付相关认证中间件
  const claimAuth = enhancedAuth.claimAuth();
  const payoutAuth = enhancedAuth.payoutAuth();
  const adminAuth = enhancedAuth.adminAuth();

  // 创建赔付申请 - 需要用户认证
  router.post('/claims', claimAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = createClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const claim = await claimsService.createClaim(userId, parsed.data);
      
      return res.status(201).json({
        ok: true,
        claim
      });
    } catch (error) {
      if (error instanceof ClaimsError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      console.error('创建赔付申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '创建赔付申请时发生意外错误'
      });
    }
  });

  // 获取赔付申请详情 - 需要用户认证或管理员权限
  router.get('/claims/:claimId', claimAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { claimId } = req.params;
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const claim = await claimsService.getClaim(claimId);
      if (!claim) {
        return res.status(404).json({
          ok: false,
          code: 'CLAIM_NOT_FOUND',
          message: '赔付申请不存在'
        });
      }

      // 检查权限：用户只能查看自己的赔付申请，管理员可以查看所有
      const isAdmin = (req.auth as any)?.method === 'jwt' && authInfo?.profile?.role === 'admin';
      if (!isAdmin && claim.userId !== userId) {
        return res.status(403).json({
          ok: false,
          code: 'FORBIDDEN',
          message: '无权查看此赔付申请'
        });
      }

      return res.json({
        ok: true,
        claim
      });
    } catch (error) {
      console.error('获取赔付申请详情错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '获取赔付申请详情时发生意外错误'
      });
    }
  });

  // 获取用户赔付申请列表 - 需要用户认证
  router.get('/claims', claimAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = listClaimsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const { claims, total } = await claimsService.getUserClaims(userId, parsed.data.page, parsed.data.pageSize);
      
      return res.json({
        ok: true,
        claims,
        total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize
      });
    } catch (error) {
      console.error('获取赔付申请列表错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '获取赔付申请列表时发生意外错误'
      });
    }
  });

  // 获取所有赔付申请 - 需要管理员权限
  router.get('/admin/claims', adminAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = listClaimsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const { claims, total } = await claimsService.getAllClaims(
        parsed.data.page, 
        parsed.data.pageSize, 
        parsed.data.status
      );
      
      return res.json({
        ok: true,
        claims,
        total,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize
      });
    } catch (error) {
      console.error('获取所有赔付申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '获取赔付申请列表时发生意外错误'
      });
    }
  });

  // 提交赔付申请 - 需要用户认证
  router.post('/claims/:claimId/submit', claimAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { claimId } = req.params;
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const claim = await claimsService.submitClaim(claimId, userId);
      
      return res.json({
        ok: true,
        claim
      });
    } catch (error) {
      if (error instanceof ClaimsError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      console.error('提交赔付申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '提交赔付申请时发生意外错误'
      });
    }
  });

  // 更新赔付申请 - 需要管理员权限
  router.patch('/admin/claims/:claimId', adminAuth, async (req: AuthenticatedRequest, res) => {
    const parsed = updateClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const { claimId } = req.params;
      const authInfo = (req.auth as any)?.authInfo;
      const reviewerId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!reviewerId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '管理员认证信息缺失'
        });
      }

      const claim = await claimsService.updateClaim(claimId, parsed.data, reviewerId);
      
      return res.json({
        ok: true,
        claim
      });
    } catch (error) {
      if (error instanceof ClaimsError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      console.error('更新赔付申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '更新赔付申请时发生意外错误'
      });
    }
  });

  // 获取赔付统计 - 需要管理员权限
  router.get('/admin/claims/stats', adminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await claimsService.getClaimsStats();
      
      return res.json({
        ok: true,
        stats
      });
    } catch (error) {
      console.error('获取赔付统计错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '获取赔付统计时发生意外错误'
      });
    }
  });

  // 准备理赔申请 - 前端需要的接口
  router.post('/claims/prepare', claimAuth, async (req: AuthenticatedRequest, res) => {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_ORDER_ID',
        message: '订单ID不能为空'
      });
    }

    try {
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const result = await claimsService.prepareClaim(orderId, userId);
      
      return res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      if (error instanceof ClaimsError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      console.error('准备理赔申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '准备理赔申请时发生意外错误'
      });
    }
  });

  // 验证理赔申请 - 前端需要的接口
  router.post('/claims/verify', claimAuth, async (req: AuthenticatedRequest, res) => {
    const { orderId, orderRef, claimToken } = req.body;
    
    if (!orderId || !orderRef || !claimToken) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_PARAMETERS',
        message: '订单ID、订单引用和理赔令牌不能为空'
      });
    }

    try {
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const result = await claimsService.verifyClaim(orderId, orderRef, claimToken, userId);
      
      return res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      if (error instanceof ClaimsError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      console.error('验证理赔申请错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '验证理赔申请时发生意外错误'
      });
    }
  });

  // 获取理赔统计数据 - 前端需要的接口
  router.get('/claims/stats', claimAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authInfo = (req.auth as any)?.authInfo;
      const userId = authInfo?.type === 'user' ? authInfo.id : null;
      
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: 'UNAUTHORIZED',
          message: '用户认证信息缺失'
        });
      }

      const stats = await claimsService.getClaimsStats(userId);
      
      return res.json({
        ok: true,
        stats
      });
    } catch (error) {
      console.error('获取理赔统计数据错误:', error);
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: '获取理赔统计数据时发生意外错误'
      });
    }
  });

  return router;
}