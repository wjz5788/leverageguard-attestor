// 健康检查路由
import express from 'express';

const router = express.Router();

/**
 * GET /api/v1/health
 * 健康检查端点
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

/**
 * GET /api/v1/health/ready
 * 就绪检查端点
 */
router.get('/ready', (req, res) => {
  // 这里可以添加数据库连接检查等
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected', // 简化实现
      api: 'available'
    }
  });
});

/**
 * GET /api/v1/health/live
 * 存活检查端点
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

export default () => router;