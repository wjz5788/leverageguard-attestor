// 主应用文件
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import memoryDbManager from './database/memoryDb.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import rateLimit from 'express-rate-limit';
import { RateLimitError } from './types/errors.js';
import AuthService from './services/authService.js';
import OrderService from './services/orderService.js';
import ClaimsService from './services/claimsService.js';
import PaymentProofService from './services/paymentProofService.js';
import { LinkService } from './services/linkService.js';
import { ContractListenerService } from './services/contractListenerService.js';
import registerRoutes from './routes/index.js';

// 创建Express应用
const app = express();

// 中间件配置
app.use(requestIdMiddleware); // 请求ID
app.use(helmet()); // 安全头
app.use(compression()); // 压缩响应
app.use(cors()); // CORS支持
app.use(express.json({ limit: '10mb' })); // JSON解析
app.use(express.urlencoded({ extended: true })); // URL编码解析

// 日志中间件
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// 防重放中间件（保护所有非GET请求）
import { replayProtection } from './middleware/replayProtection.js';
app.use(replayProtection);

// 速率限制（仅应用于写请求）
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    // 将 429 交由统一错误处理
    // Retry-After 由错误处理中间件根据 details 自动设置
    next(new RateLimitError('请求过于频繁，请稍后重试', 60));
  },
});
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
  return (writeLimiter as any)(req, res, next);
});

// 初始化依赖
const authService = new AuthService();
const orderService = new OrderService();
const claimsService = new ClaimsService(orderService);
const paymentProofService = new PaymentProofService();
const linkService = new LinkService();
const contractListenerService = new ContractListenerService(orderService);

// 路由配置
registerRoutes(app, { dbManager: memoryDbManager, authService, orderService, claimsService, paymentProofService, linkService, contractListenerService });

// 注入依赖到应用实例
app.set('dbManager', memoryDbManager);
app.set('authService', authService);
app.set('orderService', orderService);
app.set('claimsService', claimsService);
app.set('paymentProofService', paymentProofService);
app.set('linkService', linkService);
app.set('contractListenerService', contractListenerService);

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: 'LiqPass API Server',
    version: '1.0.0',
    endpoints: {
      verification: '/api/v1/verification',
      health: '/api/v1/health',
      verify: '/api/v1/verify',
      auth: '/api/v1/auth',
      account: '/api/v1/account'
    }
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// 错误处理中间件
import { createErrorHandlers, notFoundHandler } from './middleware/errorHandler.js';

// 404处理
app.use(notFoundHandler);

// 统一错误处理链
app.use(createErrorHandlers({
  includeStackTrace: process.env.NODE_ENV === 'development',
  logErrors: true,
  exposeErrors: process.env.NODE_ENV === 'development',
}));

export default app;
