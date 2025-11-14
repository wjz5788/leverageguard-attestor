import express from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import OrderService, { OrderError } from '../services/orderService.js';
import { appendOrder } from '../database/fileLedger.js';
// 注：移除对数据库的幂等性快照依赖，改由服务层与文件账本保证一致性

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
  premiumUSDC6d: z.coerce.number().positive(),
  idempotencyKey: z.string().min(1),
  paymentMethod: z.enum(['permit2', 'approve_transfer']),
  paymentProofId: z.string().min(1).optional(),
  orderRef: z.string().min(1).optional(),
  exchange: z.string().min(1).optional(),
  pair: z.string().min(1).optional()
});

const toFixedString = (value: number, fractionDigits: number) =>
  value.toFixed(fractionDigits);

// 幂等性快照改由 OrderService 内部索引与文件账本保障，路由层不再写入独立快照

export default function ordersRoutes(orderService: OrderService) {
  const router = express.Router();

  // 轻量认证：使用 X-API-Key 校验，仅用于创建/查询订单接口；预览匿名
  const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = (req.headers['x-api-key'] || req.headers['X-API-Key'] || '') as string;
    const admin = (process.env.ADMIN_API_KEY || '').trim();
    if (!admin || !key || key.trim() !== admin) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Missing or invalid API key' });
    }
    next();
  };

  // 订单列表 - 需要认证（API Key）
  router.get('/orders', requireApiKey, async (_req, res) => {
    const orders = await orderService.listOrdersPersisted();
    return res.json({ ok: true, orders });
  });

  router.get('/orders/my', async (req, res) => {
    const addrRaw = (req.query.address || req.query.wallet || '') as string;
    const address = addrRaw.toString().toLowerCase();
    try {
      const all = await orderService.listOrdersPersisted();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        const sorted = Array.isArray(all) ? all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()) : [];
        return res.json({ ok: true, orders: sorted });
      }
      const list = all.filter(o => o.wallet.toLowerCase() === address);
      return res.json({ ok: true, orders: list });
    } catch (error) {
      return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: '查询我的订单失败' });
    }
  });

  // 产品目录 - 公开访问
  router.get('/catalog/skus', (_req, res) => {
    const skus = orderService.listSkus();
    res.json({
      ok: true,
      skus
    });
  });

  // 订单预览 - 匿名访问
  router.post('/orders/preview', (req, res) => {
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

  // 创建订单 - 需要认证（API Key）
  router.post('/orders', requireApiKey, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_REQUEST',
        issues: parsed.error.issues
      });
    }

    try {
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

  // 获取订单详情 - 需要认证（API Key）
  router.get('/orders/:orderId', requireApiKey, (req, res) => {
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

  const submitSchema = z.object({
    txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  });

  router.post('/orders/:orderId/submit-tx', async (req, res) => {
    const { orderId } = req.params;
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: 'INVALID_REQUEST', issues: parsed.error.issues });
    }

    const order = orderService.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND', message: '订单不存在' });
    }
    if (order.status === 'paid') {
      return res.json({ ok: true, alreadyPaid: true, order });
    }

    const rpc = (process.env.BASE_RPC || 'https://mainnet.base.org').toString();
    const provider = new ethers.JsonRpcProvider(rpc);
    const targetContract = (process.env.CHECKOUT_CONTRACT_ADDRESS || process.env.CHECKOUT_ADDR || process.env.POLICY_ADDR || '').toLowerCase();
    const expectedChainId = String(process.env.PAYMENT_CHAIN_ID || '8453');

    try {
      const txHash = parsed.data.txHash;
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        return res.status(400).json({ ok: false, code: 'TX_NOT_FOUND', message: '交易未找到' });
      }
      const receipt = await provider.waitForTransaction(txHash, 1);
      if (!receipt || receipt.status !== 1) {
        return res.status(400).json({ ok: false, code: 'TX_FAILED', message: '交易未上链或失败' });
      }
      const toAddr = (tx.to || '').toLowerCase();
      if (!targetContract || toAddr !== targetContract) {
        return res.status(400).json({ ok: false, code: 'TX_TO_MISMATCH', message: '交易目标地址不匹配' });
      }
      const network = await provider.getNetwork();
      const networkChainId = String(network.chainId);
      if (networkChainId !== expectedChainId) {
        return res.status(400).json({ ok: false, code: 'CHAIN_MISMATCH', message: '链ID不匹配' });
      }

      order.status = 'paid';
      order.paymentStatus = 'paid';
      order.paymentTx = txHash;
      order.updatedAt = new Date().toISOString();
      await appendOrder(order);
      return res.json({ ok: true, order });
    } catch (error: any) {
      return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: error?.message || '提交交易处理失败' });
    }
  });

  return router;
}
