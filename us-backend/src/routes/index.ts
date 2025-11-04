import type express from 'express';
import memoryDbManager from '../database/memoryDb';
import AuthService from '../services/authService';
import { createAuthMiddleware } from '../middleware/authMiddleware';
import verificationRoutes from './verification';
import healthRoutes from './health';
import okxVerifyRoutes from './okx-verify';
import authRoutes from './auth';
import accountRoutes from './account';
import linksRoutes from './links';

export interface RouteDependencies {
  dbManager: typeof memoryDbManager;
  authService: AuthService;
}

export default function registerRoutes(app: express.Application, deps: RouteDependencies) {
  const { dbManager, authService } = deps;
  const requireAuth = createAuthMiddleware(authService);

  app.use('/api/v1/health', healthRoutes());
  app.use('/api/v1/verification', verificationRoutes(dbManager));
  app.use('/api/v1/verify', okxVerifyRoutes);
  app.use('/api/v1/auth', authRoutes(authService, requireAuth));
  app.use('/api/v1/account', accountRoutes(authService, requireAuth));
  app.use('/api/v1/links', linksRoutes(requireAuth));
}
