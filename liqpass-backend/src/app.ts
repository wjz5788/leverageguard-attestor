// 主应用文件
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import memoryDbManager from './database/memoryDb.js';
import verificationRoutes from './routes/verification.js';
import healthRoutes from './routes/health.js';

// 创建Express应用
const app = express();

// 中间件配置
app.use(helmet()); // 安全头
app.use(cors()); // CORS支持
app.use(express.json({ limit: '10mb' })); // JSON解析
app.use(express.urlencoded({ extended: true })); // URL编码解析

// 日志中间件
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// 初始化内存数据库
const dbManager = memoryDbManager;

// 路由配置
app.use('/api/v1/verification', verificationRoutes(dbManager));
app.use('/api/v1/health', healthRoutes());

// 注入数据库管理器到应用实例
app.set('dbManager', dbManager);

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: 'LiqPass API Server',
    version: '1.0.0',
    endpoints: {
      verification: '/api/v1/verification',
      health: '/api/v1/health'
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

// 全局错误处理
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});

export default app;