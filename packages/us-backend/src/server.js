import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ROOT = path.resolve(__dirname, '..');

loadEnv({ path: path.resolve(SERVICE_ROOT, '.env.us') });

const PORT = Number.parseInt(process.env.US_PORT ?? process.env.PORT ?? '3001', 10);
const PAYOUT_MODE = process.env.PAYOUT_MODE ?? 'simulate';
const DEFAULT_PAYOUT_ADDRESS =
  process.env.DEFAULT_PAYOUT_ADDRESS ?? '0x00195EcF4FF21aB985b13FC741Cdf276C71D88A1';
const LOG_PATH = path.resolve(SERVICE_ROOT, process.env.LOG_PATH ?? './logs/us-backend.log');
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? 'http://localhost:5173';
const ALLOWED_HEADERS = (process.env.ALLOWED_HEADERS ??
  'Content-Type,Authorization,X-Service-Token,Idempotency-Key')
  .split(',')
  .map((header) => header.trim())
  .filter(Boolean);

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

// --- Database functions (securely refactored) ---

const queries = {
  getIdempotencyRecord: db.prepare('SELECT key, route, reqHash, respJson FROM idempotency_keys WHERE key = ? AND route = ? LIMIT 1'),
  saveIdempotencyRecord: db.prepare('INSERT INTO idempotency_keys(key, route, reqHash, respJson, createdAt) VALUES (?, ?, ?, ?, ?)'),
  insertOrderRecord: db.prepare('INSERT INTO orders(id, wallet, skuId, exchange, pair, orderRef, premium, payout, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insertClaimRecord: db.prepare('INSERT INTO claims(id, orderId, wallet, evidenceHash, reason, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  orderExists: db.prepare('SELECT id FROM orders WHERE id = ? LIMIT 1'),
  getClaimById: db.prepare('SELECT * FROM claims WHERE id = ?'),
  getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  updateClaimStatus: db.prepare('UPDATE claims SET status = ?, reason = ? WHERE id = ?'),
};

function getIdempotencyRecord(key, route) {
  return queries.getIdempotencyRecord.get(key, route);
}

function saveIdempotencyRecord(key, route, reqHash, respJson, createdAt) {
  queries.saveIdempotencyRecord.run(key, route, reqHash, respJson, createdAt);
}

function insertOrderRecord(record) {
  queries.insertOrderRecord.run(
    record.id,
    record.wallet,
    record.skuId,
    record.exchange,
    record.pair,
    record.orderRef,
    record.premium,
    record.payout,
    record.status,
    record.createdAt
  );
}

function insertClaimRecord(record) {
  queries.insertClaimRecord.run(
    record.id,
    record.orderId,
    record.wallet,
    record.evidenceHash,
    record.reason,
    record.status,
    record.createdAt
  );
}

function orderExists(orderId) {
  const row = queries.orderExists.get(orderId);
  return !!row;
}

// --- Utility functions (unchanged) ---

function canonicalise(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalise(item));
  }

  const sortedKeys = Object.keys(value).sort();
  const result = {};
  for (const key of sortedKeys) {
    result[key] = canonicalise(value[key]);
  }
  return result;
}

function hashJson(payload) {
  const canonical = canonicalise(payload ?? {});
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function toInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return 0;
}

function appendLog(entry) {
  const line = JSON.stringify(entry);
  fs.appendFileSync(LOG_PATH, `${line}\n`, { encoding: 'utf8' });
}

// --- Express App Setup (mostly unchanged) ---

const allowedOriginTokens = ALLOW_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOriginTokens.includes('*') || allowedOriginTokens.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: [],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 600,
  };
}

const app = express();
const corsOptions = buildCorsOptions();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const reqId = crypto.randomUUID();
  const startTime = process.hrtime.bigint();
  res.locals.reqId = reqId;
  res.locals.startTime = startTime;
  res.locals.logContext = {};

  res.on('finish', () => {
    const latencyNs = process.hrtime.bigint() - startTime;
    const latencyMs = Number(latencyNs / BigInt(1e6));
    const logEntry = {
      ts: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : 'info',
      reqId,
      route: req.path,
      wallet: res.locals.logContext.wallet ?? null,
      orderId: res.locals.logContext.orderId ?? null,
      claimId: res.locals.logContext.claimId ?? null,
      skuId: res.locals.logContext.skuId ?? null,
      idempoKey: res.locals.logContext.idempoKey ?? null,
      httpStatus: res.statusCode,
      latencyMs,
      msg: res.locals.logContext.msg ?? res.statusMessage ?? 'ok',
    };
    appendLog(logEntry);
  });

  next();
});

// --- Routes (logic is now secure) ---

const skus = [
  { id: 'DAY_24H_FIXED', title: 'DAY_24H_FIXED', premium: 5000, payout: 100000, exchange: 'binance' },
  { id: 'DAY_24H_OKX', title: 'DAY_24H_OKX', premium: 4000, payout: 80000, exchange: 'okx' },
];

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    payoutMode: PAYOUT_MODE,
    defaultPayoutAddress: DEFAULT_PAYOUT_ADDRESS,
    timestamp: new Date().toISOString(),
  });
});

app.get('/catalog/skus', (req, res) => {
  res.json(skus);
});

app.post('/orders', (req, res, next) => {
  const idempoKey = req.headers['idempotency-key'];
  res.locals.logContext.idempoKey = idempoKey ?? null;

  if (!idempoKey || typeof idempoKey !== 'string') {
    const error = new Error('Missing Idempotency-Key header');
    error.statusCode = 400;
    return next(error);
  }

  const {
    skuId,
    exchange,
    pair,
    orderRef,
    wallet,
    premium,
    payout,
    paymentMethod,
  } = req.body ?? {};

  if (!skuId || !exchange || !pair || !orderRef || !wallet || !paymentMethod) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    return next(error);
  }

  const now = new Date().toISOString();
  const reqHash = hashJson({ skuId, exchange, pair, orderRef, wallet, premium, payout, paymentMethod });
  
  try {
    const existing = getIdempotencyRecord(idempoKey, '/orders');
    if (existing) {
      if (existing.reqHash !== reqHash) {
        const conflict = new Error('Idempotency key conflict');
        conflict.statusCode = 409;
        conflict.details = { route: '/orders', idempoKey };
        return next(conflict);
      }
      const replay = JSON.parse(existing.respJson);
      res.status(200).json(replay);
      res.locals.logContext = {
        ...res.locals.logContext,
        orderId: replay.orderId,
        wallet,
        skuId,
        msg: 'idempotent replay',
      };
      return;
    }
    const orderId = crypto.randomUUID();
    const responsePayload = {
      orderId,
      status: 'created',
      createdAt: now,
    };
    
    const transaction = db.transaction(() => {
      insertOrderRecord({
        id: orderId,
        wallet,
        skuId,
        exchange,
        pair,
        orderRef,
        premium: toInteger(premium),
        payout: toInteger(payout),
        status: 'created',
        createdAt: now,
      });
      saveIdempotencyRecord(idempoKey, '/orders', reqHash, JSON.stringify(responsePayload), now);
    });
    transaction();

    res.locals.logContext = {
      ...res.locals.logContext,
      orderId,
      wallet,
      skuId,
      msg: 'order created',
    };

    res.status(201).json(responsePayload);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
});

app.post('/claim', (req, res, next) => {
  const idempoKey = req.headers['idempotency-key'];
  res.locals.logContext.idempoKey = idempoKey ?? null;

  const { orderId, wallet, evidenceHash, reason } = req.body ?? {};

  if (!orderId || !wallet || !evidenceHash) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    return next(error);
  }

  try {
    if (!orderExists(orderId)) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      return next(error);
    }

    const now = new Date().toISOString();
    const claimId = crypto.randomUUID();
    const responsePayload = {
      claimId,
      status: 'received',
      createdAt: now,
    };

    const reqHash = hashJson({ orderId, wallet, evidenceHash, reason });
    if (idempoKey && typeof idempoKey === 'string') {
      const existing = getIdempotencyRecord(idempoKey, '/claim');
      if (existing) {
        if (existing.reqHash !== reqHash) {
          const conflict = new Error('Idempotency key conflict');
          conflict.statusCode = 409;
          conflict.details = { route: '/claim', idempoKey };
          return next(conflict);
        }
        const replay = JSON.parse(existing.respJson);
        res.status(200).json(replay);
        res.locals.logContext = {
          ...res.locals.logContext,
          orderId,
          claimId: replay.claimId,
          wallet,
          msg: 'idempotent replay',
        };
        return;
      }
    }

    const transaction = db.transaction(() => {
      insertClaimRecord({
        id: claimId,
        orderId,
        wallet,
        evidenceHash,
        reason: reason ?? 'liquidation',
        status: 'received',
        createdAt: now,
      });
      if (idempoKey && typeof idempoKey === 'string') {
        saveIdempotencyRecord(idempoKey, '/claim', reqHash, JSON.stringify(responsePayload), now);
      }
    });
    transaction();

    res.locals.logContext = {
      ...res.locals.logContext,
      orderId,
      claimId,
      wallet,
      msg: 'claim received',
    };

    res.status(201).json(responsePayload);
  } catch (error) {
    error.statusCode = 500;
    return next(error);
  }
});

import { ethers } from 'ethers';

// --- Blockchain / Payout Setup ---
const PAYOUT_PRIVATE_KEY = process.env.PAYOUT_PRIVATE_KEY;
const BASE_RPC_URL = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? '0x9552b58d323993f84d01e3744f175f47a9462f94';

// Minimal ABI for the payout function. Replace with your actual contract ABI.
const contractAbi = [
  "function payout(address recipient, uint256 amount) external",
];

let payoutWallet;
let liqpassContract;

if (PAYOUT_PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    payoutWallet = new ethers.Wallet(PAYOUT_PRIVATE_KEY, provider);
    liqpassContract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, payoutWallet);
    console.log(`[OK] Payout wallet initialized for address: ${payoutWallet.address}`);
    console.log(`[OK] Connected to LiqPass contract at: ${CONTRACT_ADDRESS}`);
  } catch (error) {
    console.error('[CRITICAL] Failed to initialize payout wallet or contract:', error.message);
    payoutWallet = null;
    liqpassContract = null;
  }
} else {
  console.warn('[WARN] PAYOUT_PRIVATE_KEY not set. On-chain payouts are disabled.');
}

// --- Admin Routes ---

// WARNING: These endpoints are for admin use only and should be protected by a firewall or proper auth middleware.
app.post('/admin/payout', async (req, res, next) => {
  const { claimId } = req.body ?? {};
  res.locals.logContext.claimId = claimId;

  if (!claimId) {
    const error = new Error('Missing claimId');
    error.statusCode = 400;
    return next(error);
  }

  if (!payoutWallet || !liqpassContract) {
    const error = new Error('Payout system is not configured or initialized.');
    error.statusCode = 503; // Service Unavailable
    return next(error);
  }

  try {
    const claim = queries.getClaimById.get(claimId);
    if (!claim) {
      const error = new Error('Claim not found');
      error.statusCode = 404;
      return next(error);
    }

    if (claim.status !== 'approved') {
      const error = new Error(`Cannot process claim with status '${claim.status}'`);
      error.statusCode = 409; // Conflict
      return next(error);
    }

    const order = queries.getOrderById.get(claim.orderId);
    if (!order) {
      const error = new Error('Original order not found for claim');
      error.statusCode = 500;
      return next(error);
    }

    // The payout value in the DB is in cents (e.g., 100000 for $1000).
    // We assume the target USDC contract uses 6 decimals.
    // So, we convert cents to dollars, then dollars to the smallest unit of USDC.
    const payoutInCents = BigInt(order.payout);
    const payoutInBaseUnits = payoutInCents * BigInt(10 ** 4); // (payout / 100) * (10 ** 6)

    console.log(`Processing payout for claim ${claimId}: To ${order.wallet}, Amount: ${payoutInBaseUnits.toString()} (USDC units)`);

    // Send the transaction
    const tx = await liqpassContract.payout(order.wallet, payoutInBaseUnits);
    console.log(`  - Payout transaction sent. Hash: ${tx.hash}`);

    // Update the database immediately
    const reason = `Paid via tx: ${tx.hash}`;
    queries.updateClaimStatus.run('paid', reason, claim.id);

    res.status(200).json({ 
      message: 'Payout transaction sent successfully', 
      claimId,
      recipient: order.wallet,
      amount: payoutInBaseUnits.toString(),
      transactionHash: tx.hash 
    });

    // Optionally, wait for confirmation and log it
    tx.wait().then(receipt => {
      console.log(`  - Payout transaction CONFIRMED. Block: ${receipt.blockNumber}`);
    }).catch(err => {
      console.error(`  - Payout transaction FAILED after sending. Hash: ${tx.hash}`, err);
      // Here you might want to add logic to handle a failed transaction after it was sent
    });

  } catch (error) {
    console.error(`[ERROR] Payout for claim ${claimId} failed:`, error);
    error.statusCode = 500;
    return next(error);
  }
});

// --- Error Handling ---

app.use((error, req, res, next) => {
  const status = error.statusCode ?? 500;
  res.locals.logContext = {
    ...res.locals.logContext,
    msg: error.message ?? 'internal error',
  };
  res.status(status).json({
    message: error.message ?? 'Internal Server Error',
    details: error.details ?? undefined,
  });
});

// --- Server Start ---

app.listen(PORT, () => {
  console.log(`[us-backend] listening on http://localhost:${PORT}`);
  console.log(`[us-backend] payout mode=${PAYOUT_MODE}, default payout address=${DEFAULT_PAYOUT_ADDRESS}`);
});
