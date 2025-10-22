import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ROOT = path.resolve(__dirname, '..');

loadEnv({ path: path.resolve(SERVICE_ROOT, '.env') });

const PORT = Number.parseInt(process.env.JP_PORT ?? process.env.PORT ?? '8787', 10);
const VERIFY_MODE = process.env.VERIFY_MODE ?? 'real';
const OKX_BASE_URL = process.env.OKX_BASE_URL ?? 'https://www.okx.com';
const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';

const app = express();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  optionsSuccessStatus: 204,
  maxAge: 600,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '512kb' }));

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    verifyMode: VERIFY_MODE,
    okxBaseUrl: OKX_BASE_URL,
    binanceBaseUrl: BINANCE_BASE_URL,
    timestamp: new Date().toISOString(),
  });
});

app.post('/verify/order', (req, res) => {
  const { exchange, pair, orderRef, wallet } = req.body ?? {};

  if (!exchange || !pair || !orderRef || !wallet) {
    return res.status(400).json({
      status: 'fail',
      reason: 'Missing exchange, pair, orderRef, or wallet',
    });
  }

  const diagnostics = {
    message: 'Verification stub response',
    verifyMode: VERIFY_MODE,
    receivedAt: new Date().toISOString(),
  };

  res.json({
    status: 'ok',
    exchange,
    pair,
    orderRef,
    wallet,
    diagnostics,
  });
});

app.use((req, res) => {
  res.status(404).json({ status: 'not_found', path: req.path });
});

app.listen(PORT, () => {
  console.log(`[jp-verify] listening on http://localhost:${PORT} (mode=${VERIFY_MODE})`);
});
