import express from 'express';
import OrderService from '../services/orderService.js';
import ClaimsService from '../services/claimsService.js';
import PaymentProofService from '../services/paymentProofService.js';
import TransparencyService from '../services/transparencyService.js';

type RangeOption = '7d' | '30d' | 'all';

const VALID_RANGES: RangeOption[] = ['7d', '30d', 'all'];

function parseRange(value: unknown): RangeOption {
  const normalized = (value ?? '7d').toString();
  if (VALID_RANGES.includes(normalized as RangeOption)) {
    return normalized as RangeOption;
  }
  throw new Error('INVALID_RANGE');
}

export default function transparencyRoutes(
  orderService: OrderService,
  claimsService: ClaimsService,
  paymentProofService: PaymentProofService,
) {
  const router = express.Router();
  const service = new TransparencyService(orderService, claimsService, paymentProofService);

  router.get('/overview', (req, res) => {
    try {
      const range = parseRange(req.query.range);
      const overview = service.getOverview(range);
      res.json(overview);
    } catch (error) {
      res.status(400).json({ error: 'INVALID_RANGE', message: 'range must be 7d, 30d or all' });
    }
  });

  router.get('/timeseries', (req, res) => {
    try {
      const range = parseRange(req.query.range);
      const interval = (req.query.interval ?? '1d').toString();
      if (interval !== '1d') {
        return res.status(400).json({ error: 'INVALID_INTERVAL', message: 'Only 1d interval is supported.' });
      }
      const series = service.getTimeSeries(range, '1d');
      res.json(series);
    } catch (error) {
      res.status(400).json({ error: 'INVALID_RANGE', message: 'range must be 7d, 30d or all' });
    }
  });

  router.get('/distribution', (req, res) => {
    try {
      const range = parseRange(req.query.range);
      const distribution = service.getDistribution(range);
      res.json(distribution);
    } catch (error) {
      res.status(400).json({ error: 'INVALID_RANGE', message: 'range must be 7d, 30d or all' });
    }
  });

  router.get('/events', (req, res) => {
    const limitRaw = Number((req.query.limit ?? 20).toString());
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 20;
    const events = service.getEvents(limit);
    res.json(events);
  });

  router.get('/audit', (_req, res) => {
    const audit = service.getAudit();
    res.json(audit);
  });

  return router;
}
