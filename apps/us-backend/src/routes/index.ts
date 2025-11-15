import type express from 'express';
// 精简路由注册：当前仅挂载健康、定价与订单
 
import healthRoutes from './health.js';
import pricingRoutes from './pricing.js';
import OrderService from '../services/orderService.js';
import ordersRoutes from './orders.js';
import okxVerifyRoutes from './okx-verify.js';
import apiKeysRoutes from './apiKeys.js';
import claimsRoutes from './claims.js';
import ClaimsService from '../services/claimsService.js';
import AuthService from '../services/authService.js';
import authRoutes from './auth.js';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

export interface RouteDependencies {
  orderService: OrderService;
}

export default function registerRoutes(app: express.Application, deps: RouteDependencies) {
  const { orderService } = deps;

  app.use('/api/v1/health', healthRoutes());
  app.use('/api/v1/pricing', pricingRoutes);
  app.use('/api/v1', ordersRoutes(orderService));
  app.use('/api/v1/verify', okxVerifyRoutes);
  app.use('/api/v1/api-keys', apiKeysRoutes);

  // 认证服务与路由
  const authService = new AuthService();
  const requireAuth = createAuthMiddleware(authService);
  app.use('/api/v1/auth', authRoutes(authService, requireAuth));

  // 赔付管理相关路由（共享同一认证后端）
  const claimsService = new ClaimsService(orderService);
  app.use('/api/v1', claimsRoutes(claimsService, authService));
}
