import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createHttpTerminator } from 'http-terminator';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';
import AuthService from './services/authService.js';
import OrderService from './services/orderService.js';
import ClaimsService from './services/claimsService.js';
import PaymentProofService from './services/paymentProofService.js';
import LinkService from './services/linkService.js';
import ContractListenerService from './services/contractListenerService.js';
import { dbManager } from './database/db.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { setupSwagger } from './utils/swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// 安全中间件
app.use(helmet());

// CORS配置 - 严格白名单
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // 允许无origin的请求（如移动应用或服务器间调用）
    if (!origin) return callback(null, true);
    
    // 从环境变量获取允许的来源
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // 检查来源是否在白名单中
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS阻止了来源: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.use(compression());

// 请求限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 限制每个IP 15分钟内最多100个请求
});
app.use(limiter);

// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 日志中间件
app.use(requestIdMiddleware);
app.use(requestLogger);

// Swagger 文档
try {
  const swaggerDocument = YAML.load(path.join(__dirname, '../docs/swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  console.warn('警告: 无法加载Swagger文档:', error);
}

// 初始化服务
const authService = new AuthService();
const orderService = new OrderService();
const claimsService = new ClaimsService();
const paymentProofService = new PaymentProofService();
const linkService = new LinkService();
const contractListenerService = new ContractListenerService();

// 注册路由
registerRoutes(app, { dbManager, authService, orderService, claimsService, paymentProofService, linkService, contractListenerService });

// 将数据库管理器附加到应用上
app.set('dbManager', dbManager);

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
const server = app.listen(port, () => {
  console.log(`🚀 US Backend listening at http://localhost:${port}`);
  console.log(`📖 API Docs available at http://localhost:${port}/api-docs`);
});

// 优雅关闭
const httpTerminator = createHttpTerminator({ server });
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await httpTerminator.terminate();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await httpTerminator.terminate();
  process.exit(0);
});

export default app;
