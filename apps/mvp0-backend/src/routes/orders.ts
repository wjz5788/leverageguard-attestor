import type { Statement } from 'better-sqlite3';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import {
  decodeFunctionData,
  getAddress,
  parseEventLogs,
  TransactionNotFoundError,
  type Hex
} from 'viem';
import { z } from 'zod';

import { db } from '../db';
import { env } from '../env';
import { requireAuth } from '../middleware/requireAuth';
import { ERC20_ABI } from '../shared/erc20Abi';
import { publicClient } from '../viemClient';

const router = Router();

const createOrderSchema = z.object({
  premiumUSDC6d: z.coerce.number().int().positive()
});

const submitTxSchema = z.object({
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
});

type OrderRow = {
  id: string;
  wallet: string;
  premium_usdc_6d: number;
  status: string;
  tx_hash: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string | null;
};

const normalizeAddress = (address: string) => getAddress(address).toLowerCase();

const orderByIdStmt = () =>
  db.prepare<OrderRow, [string, string]>(
    `SELECT * FROM orders WHERE id = ? AND wallet = ?`
  );

const orderByTxHashStmt = () =>
  db.prepare<OrderRow, [string]>(`SELECT * FROM orders WHERE tx_hash = ?`);

const mapOrder = (order: OrderRow) => ({
  id: order.id,
  wallet: order.wallet,
  status: order.status,
  amountUSDC6d: order.premium_usdc_6d,
  txHash: order.tx_hash,
  paidAt: order.paid_at,
  expiresAt: order.expires_at,
  createdAt: order.created_at,
  updatedAt: order.updated_at
});

const insertOrderStmt = () =>
  db.prepare(
    `INSERT INTO orders (id, wallet, premium_usdc_6d, expires_at, created_at, updated_at)
     VALUES (@id, @wallet, @premium, @expiresAt, @createdAt, @updatedAt)`
  );

const updateOrderPaidStmt = () =>
  db.prepare(
    `UPDATE orders
     SET status = 'paid', tx_hash = @txHash, paid_at = @paidAt, updated_at = @updatedAt
     WHERE id = @id`
  );

const runInTransaction = db.transaction(
  (statement: Statement, params: Record<string, unknown>) => {
    statement.run(params);
  }
);

router.post('/orders', requireAuth, (req, res) => {
  const { premiumUSDC6d } = createOrderSchema.parse(req.body);
  const walletAddress = res.locals.walletAddress as string;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const orderId = nanoid();
  const timestamp = now.toISOString();

  insertOrderStmt().run({
    id: orderId,
    wallet: walletAddress,
    premium: premiumUSDC6d,
    expiresAt: expiresAt.toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp
  });

  res.status(201).json({
    orderId,
    amountUSDC6d: premiumUSDC6d,
    expiresAt: expiresAt.toISOString()
  });
});

router.get('/orders/:id', requireAuth, (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const orderId = req.params.id;

  const order = orderByIdStmt().get(orderId, walletAddress) as OrderRow | undefined;

  if (!order) {
    return res.status(404).json({ error: 'ERR_ORDER_NOT_FOUND' });
  }

  res.json(mapOrder(order));
});

router.post('/orders/:id/submit-tx', requireAuth, async (req, res) => {
  const walletAddress = res.locals.walletAddress as string;
  const orderId = req.params.id;
  const { txHash } = submitTxSchema.parse(req.body);
  const normalizedHash = txHash.toLowerCase();

  const order = orderByIdStmt().get(orderId, walletAddress) as OrderRow | undefined;

  if (!order) {
    return res.status(404).json({ error: 'ERR_ORDER_NOT_FOUND' });
  }

  if (order.status === 'paid') {
    if (order.tx_hash && order.tx_hash.toLowerCase() === normalizedHash) {
      return res.json(mapOrder(order));
    }

    return res.status(400).json({ error: 'ERR_ALREADY_PAID' });
  }

  try {
    const hash = txHash as Hex;
    const transaction = await publicClient.getTransaction({ hash });

    if (!transaction.to || normalizeAddress(transaction.to) !== normalizeAddress(env.USDC_ADDRESS)) {
      return res.status(400).json({ error: 'ERR_NOT_USDC_TRANSFER' });
    }

    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: transaction.input });

    if (!['transfer', 'transferFrom'].includes(decoded.functionName)) {
      return res.status(400).json({ error: 'ERR_NOT_USDC_TRANSFER' });
    }

    let fromAddress: string;
    let toAddress: string;
    let amount: bigint;

    if (decoded.functionName === 'transfer') {
      const [to, value] = decoded.args as readonly [`0x${string}`, bigint];
      fromAddress = transaction.from;
      toAddress = to;
      amount = value;
    } else {
      const [from, to, value] = decoded.args as readonly [`0x${string}`, `0x${string}`, bigint];
      fromAddress = from;
      toAddress = to;
      amount = value;
    }

    const normalizedVault = normalizeAddress(env.VAULT_ADDRESS);

    if (normalizeAddress(toAddress) !== normalizedVault) {
      return res.status(400).json({ error: 'ERR_TO_NOT_VAULT' });
    }

    const normalizedOrderWallet = normalizeAddress(order.wallet);

    if (normalizeAddress(fromAddress) !== normalizedOrderWallet) {
      return res.status(400).json({ error: 'ERR_FROM_MISMATCH' });
    }

    const expectedAmount = BigInt(order.premium_usdc_6d);

    if (amount !== expectedAmount) {
      return res.status(400).json({ error: 'ERR_AMOUNT_MISMATCH' });
    }

    const receipt = await publicClient.getTransactionReceipt({ hash });

    if (!receipt.blockNumber) {
      return res.status(400).json({ error: 'ERR_TX_PENDING' });
    }

    if (receipt.status !== 'success') {
      return res.status(400).json({ error: 'ERR_TX_REVERTED' });
    }

    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const blockTimestampMs = Number(block.timestamp) * 1000;
    const blockTime = new Date(blockTimestampMs);

    const createdAt = new Date(order.created_at);
    const expiresAt = new Date(order.expires_at);

    if (blockTime.getTime() < createdAt.getTime() || blockTime.getTime() > expiresAt.getTime()) {
      return res.status(400).json({ error: 'ERR_OUT_OF_WINDOW' });
    }

    const latestBlock = await publicClient.getBlockNumber();
    const confirmations = Number(latestBlock - receipt.blockNumber) + 1;

    if (confirmations < env.MIN_CONFIRMATIONS) {
      return res.status(400).json({ error: 'ERR_NOT_CONFIRMED', confirmations });
    }

    const transferLogs = parseEventLogs({
      abi: ERC20_ABI,
      logs: receipt.logs,
      eventName: 'Transfer'
    }).filter((log) => normalizeAddress(log.address) === normalizeAddress(env.USDC_ADDRESS));

    const matchingLog = transferLogs.find((log) => {
      const { from, to, value } = log.args as {
        from: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
      };

      return (
        normalizeAddress(from) === normalizedOrderWallet &&
        normalizeAddress(to) === normalizedVault &&
        value === expectedAmount
      );
    });

    if (!matchingLog) {
      return res.status(400).json({ error: 'ERR_TRANSFER_EVENT_MISSING' });
    }

    const paidAt = new Date().toISOString();

    try {
      runInTransaction(updateOrderPaidStmt(), {
        id: order.id,
        txHash: normalizedHash,
        paidAt,
        updatedAt: paidAt
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const existingOrder = orderByTxHashStmt().get(normalizedHash) as OrderRow | undefined;

        if (existingOrder && existingOrder.id === order.id) {
          return res.json(mapOrder(existingOrder));
        }

        return res.status(400).json({ error: 'ERR_ALREADY_PAID' });
      }

      throw error;
    }

    const updatedOrder = orderByIdStmt().get(order.id, walletAddress) as OrderRow;

    return res.json(mapOrder(updatedOrder));
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      return res.status(400).json({ error: 'ERR_TX_NOT_FOUND' });
    }

    if (error instanceof Error && error.message.includes('nonce')) {
      return res.status(400).json({ error: 'ERR_TX_NOT_FOUND' });
    }

    throw error;
  }
});

export default router;
