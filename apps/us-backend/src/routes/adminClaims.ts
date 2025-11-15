import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import requireAdminApiKey from '../middleware/requireAdminApiKey.js';
import { db } from '../database/db.js';

const router = Router();
router.use(requireAdminApiKey);

router.get('/claims', async (_req, res) => {
  try {
    const rows = db.all(
      `SELECT
        c.id               AS claimId,
        c.status           AS status,
        c.verify_ref       AS evidenceId,
        c.reviewed_at      AS verifiedAt,
        c.payout_at        AS paidAt,
        c.payout_tx_hash   AS payoutTxHash,
        o.id               AS orderId,
        (
          SELECT substr(external_ref, instr(external_ref, ':') + 1)
          FROM order_references r
          WHERE r.order_id = c.order_id
          ORDER BY r.created_at DESC
          LIMIT 1
        )                  AS orderRef,
        o.premium_usdc     AS premium_usdc_6d,
        o.created_at       AS orderCreatedAt
      FROM claims c
      JOIN orders o ON o.id = c.order_id
      ORDER BY c.created_at DESC`
    );
    return res.json({ claims: rows });
  } catch (error: any) {
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: error?.message || '加载赔付记录失败' });
  }
});

const markPaidBody = z.object({ payoutTxHash: z.string().optional() });

router.post('/claims/:claimId/mark-paid', async (req, res) => {
  const { claimId } = req.params;
  const { payoutTxHash } = markPaidBody.parse(req.body || {});
  try {
    db.run(
      `UPDATE claims
       SET status = 'paid',
           payout_tx_hash = ?,
           payout_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      payoutTxHash ?? null,
      claimId
    );
    const updated = db.get(
      `SELECT id AS claimId, status, payout_at AS paidAt, payout_tx_hash AS payoutTxHash FROM claims WHERE id = ?`,
      claimId
    );
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: error?.message || '更新失败' });
  }
});

router.post('/claims/:claimId/verify', async (req, res) => {
  const { claimId } = req.params;
  try {
    const row = db.get(
      `SELECT c.*, o.order_ref AS oref, o.pair AS pair, o.exchange AS exchange
       FROM claims c
       JOIN orders o ON o.id = c.order_id
       WHERE c.id = ?`,
      claimId
    ) as any;
    if (!row) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'claim not found' });
    }

    const evidenceId = `evi_${Date.now()}_${row.oref || row.order_id}`;
    const evidenceJson = JSON.stringify({
      exchange: row.exchange || 'okx',
      symbol: row.pair || null,
      orderRef: row.oref || null
    });

    db.run(
      `UPDATE claims
       SET status = 'verified',
           verify_ref = ?,
           evidence_files = ?,
           reviewed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      evidenceId,
      evidenceJson,
      claimId
    );

    return res.json({
      claimId,
      status: 'verified',
      evidenceId,
      exchange: row.exchange || 'okx',
      symbol: row.pair || null,
      orderRef: row.oref || null
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: error?.message || '验证失败' });
  }
});

export default router;
