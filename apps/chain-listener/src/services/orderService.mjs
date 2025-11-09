// src/services/orderService.mjs
import sqlite3 from 'sqlite3';
import { JsonRpcProvider } from 'ethers';

const CONFIRMATIONS = 12;

export function createOrderService(dbPath = './db/liqpass.sqlite') {
  const db = new sqlite3.Database(dbPath);

  async function getOrder(orderId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async function markPaid(orderId, status, payer, txHash, logIndex, blockNumber, paidAmountUsdc, paidToken, treasury) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE orders
           SET status = ?, payer = ?, tx_hash = ?, log_index = ?, block_number = ?, 
               paid_amount_usdc = ?, paid_token = ?, treasury = ?, paid_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `;
      db.run(sql, [status, payer, txHash, logIndex, blockNumber, paidAmountUsdc, paidToken, treasury, orderId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async function markPaidUnconfirmed(orderId, status, payer, txHash, logIndex, blockNumber, paidAmountUsdc, paidToken, treasury) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE orders
           SET status = ?, payer = ?, tx_hash = ?, log_index = ?, block_number = ?, 
               paid_amount_usdc = ?, paid_token = ?, treasury = ?
         WHERE id = ?
      `;
      db.run(sql, [status, payer, txHash, logIndex, blockNumber, paidAmountUsdc, paidToken, treasury, orderId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async function insertUnmatchedPayment(id, txHash, logIndex, blockNumber, orderId, payer, token, treasury, amount) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO unmatched_payments
          (id, tx_hash, log_index, block_number, order_id, payer, token, treasury, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [id, txHash, logIndex, blockNumber, orderId, payer, token, treasury, amount], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async function upsertOrderIfMissing(orderId) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO orders (id, status, created_at)
        VALUES (?, 'pending', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO NOTHING
      `;
      db.run(sql, [orderId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async function onPremiumPaid(
    evt,
    provider,
    { USDC, TREASURY }
  ) {
    const orderId = normalize0x(evt.orderId);
    const token = (evt.token || '').toLowerCase();
    const treasury = (evt.treasury || '').toLowerCase();

    await insertUnmatchedPayment(
      evt.id,
      evt.txHash,
      evt.logIndex,
      evt.blockNumber,
      orderId || null,
      (evt.payer || '')?.toLowerCase() || null,
      token || null,
      treasury || null,
      evt.amount || null
    );

    if (!orderId) {
      return { matched: false, reason: 'no-orderId' };
    }

    await upsertOrderIfMissing(orderId);

    const tip = await provider.getBlockNumber();
    const conf = Math.max(0, tip - evt.blockNumber + 1);
    const nextStatus = conf >= CONFIRMATIONS ? 'paid' : 'paid_unconfirmed';

    const tokenOk = token === USDC.toLowerCase();
    const treOk = treasury === TREASURY.toLowerCase();
    if (!tokenOk || !treOk) {
      console.warn(`! token/treasury mismatch on ${evt.txHash}`, { token, treasury });
    }

    const update = conf >= CONFIRMATIONS ? markPaid : markPaidUnconfirmed;
    await update(
      orderId,
      nextStatus,
      (evt.payer || '')?.toLowerCase() || null,
      evt.txHash,
      evt.logIndex,
      evt.blockNumber,
      evt.amount || null,
      token || null,
      treasury || null
    );

    return { matched: true, status: nextStatus, confirmations: conf };
  }

  function normalize0x(v) {
    if (!v) return null;
    const x = v.toString().trim();
    return x.startsWith('0x') ? x : `0x${x}`;
  }

  return { onPremiumPaid, getOrder };
}
