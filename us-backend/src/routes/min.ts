import express from 'express';
import dbManager, { db as sqlite } from '../database/db.js';

// SQLite3 回调风格转 Promise
const runAsync = (sql: string, params: any[] = []) => new Promise<{ changes: number; lastID?: number }>((resolve, reject) => {
  sqlite.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve({ changes: this.changes, lastID: this.lastID });
  });
});

const allAsync = <T = any>(sql: string, params: any[] = []) => new Promise<T[]>((resolve, reject) => {
  sqlite.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows as T[]);
  });
});

const getAsync = <T = any>(sql: string, params: any[] = []) => new Promise<T | undefined>((resolve, reject) => {
  sqlite.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row as T | undefined);
  });
});

export default function minSchemaRoutes() {
  const router = express.Router();

  // 1) API Accounts
  router.post('/api-accounts', async (req, res) => {
    try {
      const { user_id, exchange, label, api_key, secret_enc, passphrase_enc } = req.body || {};
      if (!user_id || !exchange || !label || !api_key || !secret_enc) {
        return res.status(400).json({ ok: false, message: 'missing required fields' });
      }
      const info = await runAsync(
        `INSERT INTO api_accounts (user_id,exchange,label,api_key,secret_enc,passphrase_enc)
         VALUES (?,?,?,?,?,?)`,
        [user_id, exchange, label, api_key, secret_enc, passphrase_enc ?? null]
      );
      const row = await getAsync(`SELECT * FROM api_accounts WHERE id=?`, [info.lastID]);
      return res.json({ ok: true, account: row });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: e?.message || 'insert failed' });
    }
  });

  router.get('/api-accounts', async (req, res) => {
    try {
      const { user_id } = req.query as any;
      const rows = await allAsync(`SELECT id,user_id,exchange,label,status,last_verified_at,created_at,updated_at FROM api_accounts WHERE (? IS NULL OR user_id=?)`, [user_id ?? null, user_id ?? null]);
      return res.json({ ok: true, items: rows });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: e?.message || 'query failed' });
    }
  });

  // 2) Verify Requests
  router.post('/verify-requests', async (req, res) => {
    try {
      const { user_id, account_id, exchange, ord_id, inst_id, live = 1, fresh = 1, no_cache = 0 } = req.body || {};
      if (!user_id || !account_id || !exchange || !ord_id || !inst_id) {
        return res.status(400).json({ ok: false, message: 'missing required fields' });
      }
      const info = await runAsync(
        `INSERT INTO verify_requests (user_id,account_id,exchange,ord_id,inst_id,live,fresh,no_cache,status)
         VALUES (?,?,?,?,?,?,?,?, 'pending')`,
        [user_id, account_id, exchange, ord_id, inst_id, live ? 1 : 0, fresh ? 1 : 0, no_cache ? 1 : 0]
      );
      const row = await getAsync(`SELECT * FROM verify_requests WHERE id=?`, [info.lastID]);
      return res.json({ ok: true, request: row });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: e?.message || 'insert failed' });
    }
  });

  router.get('/verify-requests', async (req, res) => {
    try {
      const { user_id } = req.query as any;
      const rows = await allAsync(`SELECT * FROM verify_requests WHERE (? IS NULL OR user_id=?) ORDER BY created_at DESC`, [user_id ?? null, user_id ?? null]);
      return res.json({ ok: true, items: rows });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: e?.message || 'query failed' });
    }
  });

  // 3) Verify Results & Evidence
  router.post('/verify-results', async (req, res) => {
    try {
      const { request_id, normalized_json, raw_json, meta_json, evidence } = req.body || {};
      if (!request_id || !normalized_json || !raw_json || !meta_json) {
        return res.status(400).json({ ok: false, message: 'missing required fields' });
      }
      await runAsync(
        `INSERT OR REPLACE INTO verify_results (request_id, normalized_json, raw_json, meta_json)
         VALUES (?, ?, ?, ?)`,
        [request_id, typeof normalized_json === 'string' ? normalized_json : JSON.stringify(normalized_json), typeof raw_json === 'string' ? raw_json : JSON.stringify(raw_json), typeof meta_json === 'string' ? meta_json : JSON.stringify(meta_json)]
      );
      // 更新请求状态为 success
      await runAsync(`UPDATE verify_requests SET status='success', error_msg=NULL WHERE id=?`, [request_id]);

      if (evidence && evidence.root) {
        const root = evidence.root;
        const parent_root = evidence.parent_root ?? null;
        const leaves_count = evidence.leaves_count ?? (Array.isArray(evidence.leaves) ? evidence.leaves.length : null);
        await runAsync(
          `INSERT OR REPLACE INTO evidence_blobs (request_id, root, parent_root, leaves_count, evidence_json)
           VALUES (?, ?, ?, ?, ?)`,
          [request_id, root, parent_root, leaves_count ?? 0, JSON.stringify(evidence)]
        );
      }

      const result = await getAsync(`SELECT * FROM verify_results WHERE request_id=?`, [request_id]);
      const ev = await getAsync(`SELECT * FROM evidence_blobs WHERE request_id=?`, [request_id]);
      return res.json({ ok: true, result, evidence: ev });
    } catch (e: any) {
      return res.status(500).json({ ok: false, message: e?.message || 'insert failed' });
    }
  });

  return router;
}

