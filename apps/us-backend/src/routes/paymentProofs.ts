import express from 'express';
import { z } from 'zod';
import PaymentProofService, { PaymentProofError } from '../services/paymentProofService.js';
import OrderService from '../services/orderService.js';
import { createEnhancedAuthMiddleware } from '../middleware/enhancedAuth.js';
import AuthService from '../services/authService.js';

const createProofSchema = z.object({
  orderId: z.string().min(1),
  chainId: z.string().min(1),
  token: z.string().min(1),
  fromAddr: z.string().min(1),
  toAddr: z.string().min(1),
  amountMinUnit: z.string().min(1),
  amountUsdc: z.number().positive(),
  txHash: z.string().min(1)
});

const validateProofSchema = z.object({
  proofId: z.string().min(1)
});

const batchValidateSchema = z.object({
  proofIds: z.array(z.string().min(1)).min(1).max(50)
});

export default function paymentProofsRoutes(
  paymentProofService: PaymentProofService,
  orderService: OrderService,
  authService: AuthService
) {
  const router = express.Router();
  
  // 创建增强认证中间件
  const enhancedAuth = createEnhancedAuthMiddleware(authService);
  
  // 支付证明相关认证中间件
  const proofAuth = enhancedAuth.orderAuth();

  /**
   * 创建支付证明
   */
  router.post('/payment-proofs', proofAuth, (req, res) => {
    const parsed = createProofSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      // 验证订单存在
      const order = orderService.getOrder(parsed.data.orderId);
      if (!order) {
        return res.status(404).json({
          ok: false,
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found'
        });
      }

      // 创建支付证明
      const proof = paymentProofService.createProof(parsed.data);

      return res.status(201).json({
        ok: true,
        proof: {
          id: proof.id,
          orderId: proof.orderId,
          chainId: proof.chainId,
          token: proof.token,
          fromAddr: proof.fromAddr,
          toAddr: proof.toAddr,
          amountMinUnit: proof.amountMinUnit,
          amountUsdc: proof.amountUsdc,
          txHash: proof.txHash,
          status: proof.status,
          createdAt: proof.createdAt
        }
      });
    } catch (error) {
      if (error instanceof PaymentProofError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while creating payment proof.'
      });
    }
  });

  /**
   * 验证支付证明
   */
  router.post('/payment-proofs/validate', proofAuth, async (req, res) => {
    const parsed = validateProofSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const result = await paymentProofService.validateProof(parsed.data.proofId);

      if (!result.isValid) {
        return res.status(400).json({
          ok: false,
          code: 'PROOF_VALIDATION_FAILED',
          message: result.error || 'Payment proof validation failed'
        });
      }

      return res.json({
        ok: true,
        proof: {
          id: result.proof!.id,
          orderId: result.proof!.orderId,
          chainId: result.proof!.chainId,
          token: result.proof!.token,
          fromAddr: result.proof!.fromAddr,
          toAddr: result.proof!.toAddr,
          amountMinUnit: result.proof!.amountMinUnit,
          amountUsdc: result.proof!.amountUsdc,
          txHash: result.proof!.txHash,
          status: result.proof!.status,
          blockNumber: result.proof!.blockNumber,
          createdAt: result.proof!.createdAt,
          confirmedAt: result.proof!.confirmedAt
        }
      });
    } catch (error) {
      if (error instanceof PaymentProofError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while validating payment proof.'
      });
    }
  });

  /**
   * 批量验证支付证明
   */
  router.post('/payment-proofs/validate-batch', proofAuth, async (req, res) => {
    const parsed = batchValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const results = await paymentProofService.validateProofsBatch(parsed.data.proofIds);

      const validatedProofs = results.map(result => ({
        isValid: result.isValid,
        error: result.error,
        proof: result.proof ? {
          id: result.proof.id,
          orderId: result.proof.orderId,
          status: result.proof.status,
          blockNumber: result.proof.blockNumber,
          confirmedAt: result.proof.confirmedAt
        } : undefined
      }));

      return res.json({
        ok: true,
        results: validatedProofs
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while batch validating payment proofs.'
      });
    }
  });

  /**
   * 获取订单的支付证明
   */
  router.get('/payment-proofs/order/:orderId', proofAuth, (req, res) => {
    const { orderId } = req.params;

    try {
      const proof = paymentProofService.getProofByOrderId(orderId);

      if (!proof) {
        return res.status(404).json({
          ok: false,
          code: 'PROOF_NOT_FOUND',
          message: 'Payment proof not found for this order'
        });
      }

      return res.json({
        ok: true,
        proof: {
          id: proof.id,
          orderId: proof.orderId,
          chainId: proof.chainId,
          token: proof.token,
          fromAddr: proof.fromAddr,
          toAddr: proof.toAddr,
          amountMinUnit: proof.amountMinUnit,
          amountUsdc: proof.amountUsdc,
          txHash: proof.txHash,
          status: proof.status,
          blockNumber: proof.blockNumber,
          createdAt: proof.createdAt,
          confirmedAt: proof.confirmedAt
        }
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while fetching payment proof.'
      });
    }
  });

  /**
   * 获取交易哈希对应的支付证明
   */
  router.get('/payment-proofs/tx/:txHash', proofAuth, (req, res) => {
    const { txHash } = req.params;

    try {
      const proof = paymentProofService.getProofByTxHash(txHash);

      if (!proof) {
        return res.status(404).json({
          ok: false,
          code: 'PROOF_NOT_FOUND',
          message: 'Payment proof not found for this transaction hash'
        });
      }

      return res.json({
        ok: true,
        proof: {
          id: proof.id,
          orderId: proof.orderId,
          chainId: proof.chainId,
          token: proof.token,
          fromAddr: proof.fromAddr,
          toAddr: proof.toAddr,
          amountMinUnit: proof.amountMinUnit,
          amountUsdc: proof.amountUsdc,
          txHash: proof.txHash,
          status: proof.status,
          blockNumber: proof.blockNumber,
          createdAt: proof.createdAt,
          confirmedAt: proof.confirmedAt
        }
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while fetching payment proof.'
      });
    }
  });

  /**
   * 获取所有支付证明（管理用途）
   */
  router.get('/payment-proofs', proofAuth, (req, res) => {
    try {
      const proofs = paymentProofService.listProofs();

      return res.json({
        ok: true,
        proofs: proofs.map(proof => ({
          id: proof.id,
          orderId: proof.orderId,
          txHash: proof.txHash,
          status: proof.status,
          amountUsdc: proof.amountUsdc,
          createdAt: proof.createdAt,
          confirmedAt: proof.confirmedAt
        }))
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while listing payment proofs.'
      });
    }
  });

  return router;
}