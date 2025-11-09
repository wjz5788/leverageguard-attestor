import 'dotenv/config';
import express from 'express';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DATABASE_PATH || './database.db';

// 中间件
app.use(express.json());

// 数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    process.exit(1);
  }
  console.log('数据库连接成功');
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取订单
app.get('/orders/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('查询订单错误:', err);
      return res.status(500).json({ error: '数据库查询失败' });
    }
    
    if (!row) {
      return res.status(404).json({ error: '订单未找到' });
    }
    
    res.json(row);
  });
});

// 获取支付记录
app.get('/premium-paid', (req, res) => {
  const { orderId, limit = 10, offset = 0 } = req.query;
  
  let sql = 'SELECT * FROM premium_paid';
  let params = [];
  
  if (orderId) {
    sql += ' WHERE order_id = ?';
    params.push(orderId);
  }
  
  sql += ' ORDER BY block_number DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查询支付记录错误:', err);
      return res.status(500).json({ error: '数据库查询失败' });
    }
    
    res.json(rows);
  });
});

// 获取未匹配支付
app.get('/unmatched-payments', (req, res) => {
  const { limit = 10, offset = 0 } = req.query;
  
  const sql = 'SELECT * FROM unmatched_payments ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  db.all(sql, [parseInt(limit), parseInt(offset)], (err, rows) => {
    if (err) {
      console.error('查询未匹配支付错误:', err);
      return res.status(500).json({ error: '数据库查询失败' });
    }
    
    res.json(rows);
  });
});

// 获取统计信息
app.get('/stats', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as count FROM orders',
    'SELECT COUNT(*) as count FROM premium_paid',
    'SELECT COUNT(*) as count FROM unmatched_payments',
    'SELECT MAX(last_block) as last_synced_block FROM chain_cursor'
  ];
  
  Promise.all(queries.map(sql => 
    new Promise((resolve, reject) => {
      db.get(sql, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  ))
  .then(results => {
    res.json({
      orders: results[0].count,
      premium_paid: results[1].count,
      unmatched_payments: results[2].count,
      last_synced_block: results[3].last_synced_block || 0
    });
  })
  .catch(err => {
    console.error('查询统计信息错误:', err);
    res.status(500).json({ error: '数据库查询失败' });
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`链监听器API服务器运行在端口 ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`订单查询: http://localhost:${PORT}/orders/:id`);
  console.log(`支付记录: http://localhost:${PORT}/premium-paid`);
  console.log(`未匹配支付: http://localhost:${PORT}/unmatched-payments`);
  console.log(`统计信息: http://localhost:${PORT}/stats`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  db.close((err) => {
    if (err) {
      console.error('关闭数据库连接错误:', err);
    } else {
      console.log('数据库连接已关闭');
    }
    process.exit(0);
  });
});