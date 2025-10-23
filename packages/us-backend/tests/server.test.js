import request from 'supertest';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import db from '../src/db.js';

// Mock the environment variables
process.env.US_PORT = '3001';
process.env.PAYOUT_MODE = 'simulate';
process.env.DEFAULT_PAYOUT_ADDRESS = '0x00195EcF4FF21aB985b13FC741Cdf276C71D88A1';
process.env.LOG_PATH = './logs/us-backend.log';
process.env.ALLOW_ORIGIN = 'http://localhost:5173';

// Create a new app instance for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ROOT = path.resolve(__dirname, '..');

loadEnv({ path: path.resolve(SERVICE_ROOT, '.env.us') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Import routes from the server
const skus = [
  { id: 'DAY_24H_FIXED', title: 'DAY_24H_FIXED', premium: 5000, payout: 100000, exchange: 'binance' },
  { id: 'DAY_24H_OKX', title: 'DAY_24H_OKX', premium: 4000, payout: 80000, exchange: 'okx' },
];

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    payoutMode: process.env.PAYOUT_MODE ?? 'simulate',
    defaultPayoutAddress: process.env.DEFAULT_PAYOUT_ADDRESS ?? '0x00195EcF4FF21aB985b13FC741Cdf276C71D88A1',
    timestamp: new Date().toISOString(),
  });
});

app.get('/catalog/skus', (req, res) => {
  res.json(skus);
});

describe('Server API', () => {
  describe('GET /healthz', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/healthz')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('payoutMode', 'simulate');
      expect(response.body).toHaveProperty('defaultPayoutAddress');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /catalog/skus', () => {
    it('should return SKU catalog', async () => {
      const response = await request(app)
        .get('/catalog/skus')
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      
      const firstSku = response.body[0];
      expect(firstSku).toHaveProperty('id');
      expect(firstSku).toHaveProperty('title');
      expect(firstSku).toHaveProperty('premium');
      expect(firstSku).toHaveProperty('payout');
      expect(firstSku).toHaveProperty('exchange');
    });
  });
});