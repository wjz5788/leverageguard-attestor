// src/routes/orders.mjs
import { Router } from 'express';
import sqlite3 from 'sqlite3';

const r = Router();
const db = new sqlite3.Database(process.env.SQLITE_PATH || './db/liqpass.sqlite');

r.get('/:id', (req, res) => {
  db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'DATABASE_ERROR' });
    }
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(row);
  });
});

export default r;
