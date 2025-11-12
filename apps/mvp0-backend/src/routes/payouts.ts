import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { db } from '../db';
import { requireAdmin } from '../middleware/requireAdmin';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

const createPayoutSchema = z.object({
  orderId: z.string().min(1)
});

const decisionSchema = z.object({
  decisionNote: z.string().optional()
});

const markPaidSchema = z.object({
  offchainRef: z.string().min(1)
});

type OrderRow = {
  id: string;
  wallet: string;
  status: string;
};

type PayoutRow = {
  id: string;
  order_id: string;
  status: string;
  reviewer: string | null;
  decision_note: string | null;
  offchain_ref: string | null;
  decided_at: string | null;
  paid_at: string | null;
  created_at: string;
};

const mapPayout = (payout: PayoutRow) => ({
  id: payout.id,
  orderId: payout.order_id,
  status: payout.status,
  reviewer: payout.reviewer,
  decisionNote: payout.decision_note,
  offchainRef: payout.offchain_ref,
  decidedAt: payout.decided_at,
  paidAt: payout.paid_at,
  createdAt: payout.created_at
});

const orderForWalletStmt = () =>
  db.prepare<OrderRow, [string, string]>(
    `SELECT id, wallet, status FROM orders WHERE id = ? AND wallet = ?`
  );

const activePayoutForOrderStmt = () =>
  db.prepare<PayoutRow, [string]>(
    `SELECT * FROM payouts WHERE order_id = ? AND status IN ('requested','approved','paid') ORDER BY created_at DESC LIMIT 1`
  );

const insertPayoutStmt = () =>
  db.prepare(
    `INSERT INTO payouts (id, order_id, status, created_at)
     VALUES (@id, @orderId, @status, @createdAt)`
  );

const payoutByIdStmt = () =>
  db.prepare<PayoutRow, [string]>(`SELECT * FROM payouts WHERE id = ?`);

const listPayoutsByStatusStmt = () =>
  db.prepare<PayoutRow, [string]>(
    `SELECT * FROM payouts WHERE status = ? ORDER BY created_at DESC`
  );

const listAllPayoutsStmt = () =>
  db.prepare<PayoutRow, []>(`SELECT * FROM payouts ORDER BY created_at DESC`);

const approvePayoutStmt = () =>
  db.prepare(
    `UPDATE payouts
     SET status = 'approved', reviewer = @reviewer, decision_note = @decisionNote, decided_at = @decidedAt
     WHERE id = @id`
  );

const denyPayoutStmt = () =>
  db.prepare(
    `UPDATE payouts
     SET status = 'denied', reviewer = @reviewer, decision_note = @decisionNote, decided_at = @decidedAt
     WHERE id = @id`
  );

const markPaidStmt = () =>
  db.prepare(
    `UPDATE payouts
     SET status = 'paid', offchain_ref = @offchainRef, paid_at = @paidAt
     WHERE id = @id`
  );

const insertAuditLogStmt = () =>
  db.prepare(
    `INSERT INTO audit_logs (id, entity, entity_id, action, payload_json)
     VALUES (@id, @entity, @entityId, @action, @payload)`
  );

const createAuditLog = (payoutId: string, action: string, payload: Record<string, unknown>) => {
  insertAuditLogStmt().run({
    id: nanoid(),
    entity: 'payout',
    entityId: payoutId,
    action,
    payload: JSON.stringify(payload)
  });
};

router.post('/payouts', requireAuth, (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const { orderId } = createPayoutSchema.parse(req.body);

  const order = orderForWalletStmt().get(orderId, walletAddress) as OrderRow | undefined;

  if (!order) {
    return res.status(404).json({ error: 'ERR_ORDER_NOT_FOUND' });
  }

  if (order.status !== 'paid') {
    return res.status(400).json({ error: 'ERR_ORDER_NOT_PAID' });
  }

  const active = activePayoutForOrderStmt().get(orderId) as PayoutRow | undefined;

  if (active) {
    return res.status(400).json({ error: 'ERR_PAYOUT_EXISTS' });
  }

  const payoutId = nanoid();
  const timestamp = new Date().toISOString();

  insertPayoutStmt().run({
    id: payoutId,
    orderId,
    status: 'requested',
    createdAt: timestamp
  });

  const payout = payoutByIdStmt().get(payoutId) as PayoutRow;

  res.status(201).json(mapPayout(payout));
});

router.get('/admin/payouts', requireAuth, requireAdmin, (req, res) => {
  const querySchema = z
    .object({
      status: z
        .enum(['requested', 'approved', 'denied', 'paid'])
        .optional()
    })
    .strict();

  const { status } = querySchema.parse(req.query);

  const rows = status
    ? listPayoutsByStatusStmt().all(status)
    : listAllPayoutsStmt().all();

  res.json(rows.map(mapPayout));
});

router.post('/admin/payouts/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const payload = decisionSchema.parse(req.body);
  const payoutId = req.params.id;

  const payout = payoutByIdStmt().get(payoutId) as PayoutRow | undefined;

  if (!payout) {
    return res.status(404).json({ error: 'ERR_PAYOUT_NOT_FOUND' });
  }

  if (payout.status !== 'requested') {
    return res.status(400).json({ error: 'ERR_INVALID_STATUS' });
  }

  const decidedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    approvePayoutStmt().run({
      id: payoutId,
      reviewer: walletAddress,
      decisionNote: payload.decisionNote ?? null,
      decidedAt
    });

    createAuditLog(payoutId, 'approved', {
      reviewer: walletAddress,
      decisionNote: payload.decisionNote ?? null,
      decidedAt
    });
  });

  tx();

  const updated = payoutByIdStmt().get(payoutId) as PayoutRow;

  res.json(mapPayout(updated));
});

router.post('/admin/payouts/:id/deny', requireAuth, requireAdmin, (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const payload = decisionSchema.parse(req.body);
  const payoutId = req.params.id;

  const payout = payoutByIdStmt().get(payoutId) as PayoutRow | undefined;

  if (!payout) {
    return res.status(404).json({ error: 'ERR_PAYOUT_NOT_FOUND' });
  }

  if (payout.status !== 'requested') {
    return res.status(400).json({ error: 'ERR_INVALID_STATUS' });
  }

  const decidedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    denyPayoutStmt().run({
      id: payoutId,
      reviewer: walletAddress,
      decisionNote: payload.decisionNote ?? null,
      decidedAt
    });

    createAuditLog(payoutId, 'denied', {
      reviewer: walletAddress,
      decisionNote: payload.decisionNote ?? null,
      decidedAt
    });
  });

  tx();

  const updated = payoutByIdStmt().get(payoutId) as PayoutRow;

  res.json(mapPayout(updated));
});

router.post('/admin/payouts/:id/mark-paid', requireAuth, requireAdmin, (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const payload = markPaidSchema.parse(req.body);
  const payoutId = req.params.id;

  const payout = payoutByIdStmt().get(payoutId) as PayoutRow | undefined;

  if (!payout) {
    return res.status(404).json({ error: 'ERR_PAYOUT_NOT_FOUND' });
  }

  if (payout.status !== 'approved') {
    return res.status(400).json({ error: 'ERR_INVALID_STATUS' });
  }

  const paidAt = new Date().toISOString();

  const tx = db.transaction(() => {
    markPaidStmt().run({
      id: payoutId,
      offchainRef: payload.offchainRef,
      paidAt
    });

    createAuditLog(payoutId, 'paid', {
      reviewer: walletAddress,
      offchainRef: payload.offchainRef,
      paidAt
    });
  });

  tx();

  const updated = payoutByIdStmt().get(payoutId) as PayoutRow;

  res.json(mapPayout(updated));
});

export default router;
