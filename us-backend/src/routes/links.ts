import express from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, RequireAuthMiddleware } from '../middleware/authMiddleware.js';
import { db } from '../database/memoryDb.js';
import { v4 as uuidv4 } from 'uuid';

const createLinkSchema = z.object({
  product: z.string().min(1),
  symbol: z.string().min(1),
  amount: z.number().positive(),
  duration: z.number().positive(),
});

export default function linksRoutes(requireAuth: RequireAuthMiddleware) {
  const router = express.Router();

  router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    const parseResult = createLinkSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Link creation payload is invalid.',
        issues: parseResult.error.issues
      });
    }

    const { product, symbol, amount, duration } = parseResult.data;

    // This is a placeholder for the actual link generation logic
    const url = `https://example.com/pay?product=${product}&symbol=${symbol}&amount=${amount}&duration=${duration}`;

    const newLink = {
      id: uuidv4(),
      userId,
      product,
      symbol,
      amount,
      duration,
      url,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stmt = db.prepare('INSERT INTO payment_links (id, userId, product, symbol, amount, duration, url, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(newLink.id, newLink.userId, newLink.product, newLink.symbol, newLink.amount, newLink.duration, newLink.url, newLink.status, newLink.createdAt, newLink.updatedAt);

    return res.status(201).json({ link: newLink });
  });

  return router;
}
