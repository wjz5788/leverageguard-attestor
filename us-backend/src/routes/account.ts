import express from 'express';
import { z } from 'zod';
import AuthService from '../services/authService.js';
import { AuthenticatedRequest, RequireAuthMiddleware } from '../middleware/authMiddleware.js';

const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    language: z.string().min(2).max(10).optional(),
    timezone: z.string().min(2).max(40).optional(),
    metadata: z.record(z.any()).optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one profile field must be provided.'
  });

export default function accountRoutes(authService: AuthService, requireAuth: RequireAuthMiddleware) {
  const router = express.Router();

  router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    const profile = await authService.getProfile(userId);

    if (!profile) {
      return res.status(404).json({
        error: 'PROFILE_NOT_FOUND',
        message: 'Profile could not be located for the active session.'
      });
    }

    return res.json({ profile });
  });

  router.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.auth?.userId;

    if (!userId) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Active session is required.'
      });
    }

    const parseResult = updateProfileSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_UPDATE',
        message: 'Profile update payload is invalid.',
        issues: parseResult.error.issues
      });
    }

    const updated = await authService.updateProfile(userId, parseResult.data);

    return res.json({ profile: updated });
  });

  return router;
}