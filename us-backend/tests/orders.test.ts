import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

const TEST_WALLET = '0x1111111111111111111111111111111111111111';

describe('Orders API', () => {
  it('should list SKUs, preview, and create orders with idempotency', async () => {
    const skusRes = await request(app)
      .get('/api/v1/catalog/skus')
      .expect(200);

    expect(skusRes.body).toMatchObject({ ok: true });
    expect(Array.isArray(skusRes.body.skus)).toBe(true);
    expect(skusRes.body.skus.length).toBeGreaterThan(0);

    const skuId = skusRes.body.skus[0].id as string;

    const previewRes = await request(app)
      .post('/api/v1/orders/preview')
      .send({
        skuId,
        principal: 200,
        leverage: 20,
        wallet: TEST_WALLET
      })
      .expect(200);

    expect(previewRes.body).toMatchObject({ ok: true });
    const quote = previewRes.body.quote;
    expect(typeof quote?.idempotencyKey).toBe('string');
    expect(quote?.premiumUSDC).toBeDefined();

    const createPayload = {
      skuId,
      principal: 200,
      leverage: 20,
      wallet: TEST_WALLET,
      premiumUSDC: Number(quote.premiumUSDC),
      idempotencyKey: quote.idempotencyKey,
      paymentMethod: 'permit2' as const
    };

    const createRes = await request(app)
      .post('/api/v1/orders')
      .send(createPayload)
      .expect(201);

    expect(createRes.body).toMatchObject({ ok: true });
    const orderId = createRes.body.order.id;
    expect(typeof orderId).toBe('string');
    expect(createRes.body.order.status).toBe('pending');

    const repeatRes = await request(app)
      .post('/api/v1/orders')
      .send(createPayload)
      .expect(200);

    expect(repeatRes.body).toMatchObject({ ok: true });
    expect(repeatRes.body.order.id).toBe(orderId);
  });
});
