import express from 'express';
import { z } from 'zod';
import OrderService, { OrderError } from '../services/orderService.js';
import { createEnhancedAuthMiddleware } from '../middleware/enhancedAuth.js';
import AuthService from '../services/authService.js';
import { db, withTransaction } from '../database/db.js';

const previewSchema = z.object({
  skuId: z.string().min(1),
  principal: z.number().positive(),
  leverage: z.number().positive(),
  wallet: z.string().min(1)
});

const createSchema = z.object({
  skuId: z.string().min(1),
  principal: z.coerce.number().positive(),
  leverage: z.coerce.number().positive(),
  wallet: z.string().min(1),
  premiumUSDC: z.coerce.number().positive(),
  idempotencyKey: z.string().min(1),
  paymentMethod: z.enum(['permit2', 'approve_transfer']),
  paymentProofId: z.string().min(1).optional(),
  orderRef: z.string().min(1).optional(),
  exchange: z.string().min(1).optional(),
  pair: z.string().min(1).optional()
});

const toFixedString = (value: number, fractionDigits: number) =>
  value.toFixed(fractionDigits);

async function getIdempotency(key: string): Promise<any | null> {
  return new Promise((resolve) => {
    db.get('SELECT response_json FROM idempotency_store WHERE idempotency_key = ?', [key], (err: any, row: any) => {
      if (err || !row) return resolve(null);
      try { resolve(JSON.parse(row.response_json)); } catch { resolve(null); }
    });
  });
}

async function setIdempotency(key: string, response: any): Promise<void> {
  const payload = JSON.stringify(response);
  return withTransaction(async () => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO idempotency_store (idempotency_key, response_json, created_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, payload],
        (err: any) => (err ? reject(err) : resolve())
      );
    });
  });
}

export default function ordersRoutes(orderService: OrderService, authService: AuthService) {
  const router = express.Router();
  
  // 创建增强认证中间件
  const enhancedAuth = createEnhancedAuthMiddleware(authService);
  
  // 订单相关认证中间件
  const orderAuth = enhancedAuth.orderAuth();

  // 订单列表 - 需要认证
  router.get('/orders', orderAuth, (_req, res) => {
    const orders = orderService.listOrders();
    return res.json({ ok: true, orders });
  });

  // 产品目录 - 公开访问
  router.get('/catalog/skus', (_req, res) => {
    const skus = orderService.listSkus();
    res.json({
      ok: true,
      skus
    });
  });

  // 订单预览 - 需要认证
  router.post('/orders/preview', orderAuth, (req, res) => {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      const quote = orderService.preview(parsed.data);
      const payment = orderService.getPaymentConfig();

      return res.json({
        ok: true,
        quote: {
          idempotencyKey: quote.idempotencyKey,
          premiumUSDC6d: quote.premiumUSDC6d.toString(),
          feeRatio: toFixedString(quote.feeRatio, 6),
          payoutUSDC6d: quote.payoutUSDC6d.toString(),
          payoutRatio: toFixedString(quote.payoutRatio, 6),
          quoteTtl: Math.max(
            0,
            Math.round(
              (new Date(quote.expiresAt).getTime() - Date.now()) / 1000
            )
          ),
          expiresAt: quote.expiresAt,
          payment
        },
        sku: orderService.getSku(quote.skuId)
      });
    } catch (error) {
      if (error instanceof OrderError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while generating quote.'
      });
    }
  });

  // 创建订单 - 需要认证
  router.post('/orders', orderAuth, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
      // 先查幂等性：若存在则直接返回快照
      const existing = await getIdempotency(parsed.data.idempotencyKey);
      if (existing) {
        return res.status(200).json(existing);
      }

      const { order, created } = orderService.createOrder(parsed.data);
      const payment = orderService.getPaymentConfig();

      const response = {
        ok: true,
        order: {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          premiumUSDC6d: order.premiumUSDC6d.toString(),
          feeRatio: toFixedString(order.feeRatio, 6),
          payoutUSDC6d: order.payoutUSDC6d.toString(),
          payoutRatio: toFixedString(order.payoutRatio, 6),
          skuId: order.skuId,
          wallet: order.wallet,
          paymentMethod: order.paymentMethod,
          paymentProofId: order.paymentProofId,
          createdAt: order.createdAt,
          payment
        }
      };

      // 异步持久化幂等性快照（不阻塞响应）
      setIdempotency(order.idempotencyKey, response).catch(() => {});
      return res.status(created ? 201 : 200).json(response);
    } catch (error) {
      if (error instanceof OrderError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while creating order.'
      });
    }
  });

  // 获取订单详情 - 需要认证
  router.get('/orders/:orderId', orderAuth, (req, res) => {
    const { orderId } = req.params;

    try {
      const order = orderService.getOrder(orderId);
      if (!order) {
        return res.status(404).json({
          ok: false,
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.'
        });
      }

      const payment = orderService.getPaymentConfig();
      const sku = orderService.getSku(order.skuId);

      return res.json({
        ok: true,
        order: {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          premiumUSDC6d: order.premiumUSDC6d.toString(),
          feeRatio: toFixedString(order.feeRatio, 6),
          payoutUSDC6d: order.payoutUSDC6d.toString(),
          payoutRatio: toFixedString(order.payoutRatio, 6),
          skuId: order.skuId,
          sku: sku ? {
            id: sku.id,
            code: sku.code,
            title: sku.title,
            description: sku.description,
            windowHours: sku.windowHours
          } : undefined,
          wallet: order.wallet,
          paymentMethod: order.paymentMethod,
          paymentProofId: order.paymentProofId,
          exchange: order.exchange,
          pair: order.pair,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          payment
        }
      });
    } catch (error) {
      if (error instanceof OrderError) {
        return res.status(error.httpStatus).json({
          ok: false,
          code: error.code,
          message: error.message
        });
      }

      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while retrieving order.'
      });
    }
  });

  return router;
}
