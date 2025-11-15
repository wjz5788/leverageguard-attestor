import express from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { LinkService, CreateLinkSchema } from '../services/linkService.js';

const statusSchema = z.enum(['pending', 'paid', 'expired']);

export default function linksRoutes(linkService: LinkService) {
  const router = express.Router();

  router.post('/', async (req: AuthenticatedRequest, res) => {
    const payload = { ...req.body, userId: (req.auth as any)?.userId };
    const parsed = CreateLinkSchema.safeParse(payload);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Link creation payload is invalid.',
        issues: parsed.error.issues
      });
    }

    try {
      const link = await linkService.createLink(parsed.data);
      return res.status(201).json({ link });
    } catch (error) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create payment link.'
      });
    }
  });

  router.get('/', async (_req, res) => {
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

  router.get('/order/:orderId', async (req, res) => {
    try {
      const link = await linkService.getLinkByOrderId(req.params.orderId);
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

  router.get('/:id', async (req, res) => {
    try {
      const link = await linkService.getLinkById(req.params.id);
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

  router.put('/:id/status', async (req, res) => {
    const parsed = statusSchema.safeParse(req.body.status);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Invalid status value.',
        issues: parsed.error.issues
      });
    }

    try {
      const link = await linkService.updateLinkStatus(req.params.id, parsed.data);
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

  router.delete('/:id', async (req, res) => {
    try {
      const success = await linkService.deleteLink(req.params.id);
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
