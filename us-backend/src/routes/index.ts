import type express from 'express';
import memoryDbManager from '../database/memoryDb.js';
import AuthService from '../services/authService.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import verificationRoutes from './verification.js';
import healthRoutes from './health.js';
import okxVerifyRoutes from './okx-verify.js';
import authRoutes from './auth.js';
import accountRoutes from './account.js';
import linksRoutes from './links.js';
import ordersRoutes from './orders.js';
import OrderService from '../services/orderService.js';
import minSchemaRoutes from './min.js';

export interface RouteDependencies {
  dbManager: typeof memoryDbManager;
  authService: AuthService;
  orderService: OrderService;
}

export default function registerRoutes(app: express.Application, deps: RouteDependencies) {
  const { dbManager, authService, orderService } = deps;
  const requireAuth = createAuthMiddleware(authService);

  app.use('/api/v1/health', healthRoutes());
  app.use('/api/v1/verification', verificationRoutes(dbManager));
  app.use('/api/v1/verify', okxVerifyRoutes);
  app.use('/api/verify', okxVerifyRoutes);
  app.use('/api/v1/auth', authRoutes(authService, requireAuth));
  app.use('/api/v1/account', accountRoutes(authService, requireAuth));
  app.use('/api/v1/links', linksRoutes(requireAuth));
  app.use('/api/v1', ordersRoutes(orderService));
  app.use('/api/v1/min', minSchemaRoutes());
}
