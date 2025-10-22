import express from 'express';
import morgan from 'morgan';

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const JP_BASE = process.env.JP_VERIFY_BASE ?? 'http://103.76.85.191:50455';
const SERVICE_TOKEN =
  process.env.SERVICE_TOKEN ??
  '9f1e7c3d8a2b4c5d6e7f1029384756aa9b1c2d3e4f5061728394a5b6c7d8e9f0';
const TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS ?? '8000', 10);
const CIRCUIT_THRESHOLD = Number.parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '5', 10);
const CIRCUIT_COOLDOWN_MS = Number.parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS ?? '30000', 10);
const LOG_REDACT_KEYS = (process.env.LOG_REDACT_KEYS ?? 'apiKey,secretKey,passphrase').split(',').map((k) => k.trim()).filter(Boolean);

let failureCount = 0;
let circuitOpenUntil = 0;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

function isCircuitOpen() {
  if (!CIRCUIT_THRESHOLD) return false;
  const now = Date.now();
  if (now < circuitOpenUntil) {
    return true;
  }
  return false;
}

function recordFailure() {
  if (!CIRCUIT_THRESHOLD) return;
  failureCount += 1;
  if (failureCount >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    failureCount = 0;
    console.warn(`[proxy] circuit opened for ${CIRCUIT_COOLDOWN_MS}ms`);
  }
}

function recordSuccess() {
  failureCount = 0;
  circuitOpenUntil = 0;
}

function redactPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = Array.isArray(payload) ? payload.map((item) => redactPayload(item)) : { ...payload };
  if (!Array.isArray(clone)) {
    for (const key of Object.keys(clone)) {
      if (LOG_REDACT_KEYS.includes(key)) {
        clone[key] = '[REDACTED]';
      } else if (clone[key] && typeof clone[key] === 'object') {
        clone[key] = redactPayload(clone[key]);
      }
    }
  }
  return clone;
}

function buildTargetUrl(upstreamPath, req) {
  const targetUrl = new URL(upstreamPath, JP_BASE);
  const query = req.query ?? {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => targetUrl.searchParams.append(key, item));
    } else if (value !== undefined) {
      targetUrl.searchParams.append(key, value);
    }
  }
  return targetUrl;
}

async function proxyRequest(req, res, upstreamPath) {
  if (isCircuitOpen()) {
    return res.status(503).json({ message: 'Upstream temporarily unavailable (circuit open).' });
  }

  const targetUrl = buildTargetUrl(upstreamPath, req);
  const headers = {
    'X-Service-Token': SERVICE_TOKEN,
    'user-agent': 'liqpass-us-backend/0.1',
  };
  if (req.headers['authorization']) {
    headers['authorization'] = req.headers['authorization'];
  }
  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }
  if (req.headers['accept']) {
    headers['accept'] = req.headers['accept'];
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  headers['x-forwarded-for'] = forwardedFor ? `${forwardedFor}, ${req.ip}` : req.ip;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  const body = hasBody ? JSON.stringify(req.body ?? {}) : undefined;

  const logPayload = hasBody ? redactPayload(req.body) : undefined;
  console.log(`[proxy] ${req.method} ${req.originalUrl} -> ${targetUrl.pathname}${targetUrl.search}`, logPayload ? { body: logPayload } : '');

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });

    const responseText = await response.text();
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    if (responseText) {
      res.send(responseText);
    } else {
      res.end();
    }
    recordSuccess();
  } catch (error) {
    recordFailure();
    console.error('[proxy] upstream error', error?.name ?? '', error?.message ?? error);
    if (error?.name === 'AbortError') {
      return res.status(504).json({ message: 'Upstream request timed out.' });
    }
    return res.status(502).json({ message: 'Failed to reach upstream service.' });
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/verify/healthz', async (req, res) => {
  try {
    const targetUrl = new URL('/healthz', JP_BASE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-Service-Token': SERVICE_TOKEN,
        'user-agent': 'liqpass-us-backend/0.1',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await response.text();
    res.status(response.status);
    res.send(text);
  } catch (error) {
    res.status(200).json({ status: 'degraded', message: error?.message ?? String(error) });
  }
});

app.post('/api/verify/auth/nonce', (req, res) => proxyRequest(req, res, '/auth/nonce'));
app.post('/api/verify/auth/verify', (req, res) => proxyRequest(req, res, '/auth/verify'));
app.get('/api/verify/skus', (req, res) => proxyRequest(req, res, '/skus'));
app.get('/api/verify/quote', (req, res) => proxyRequest(req, res, '/pricing/quote'));
app.post('/api/verify/api-keys', (req, res) => proxyRequest(req, res, '/user/api-keys'));
app.post('/api/verify/order', (req, res) => proxyRequest(req, res, '/verify/order'));
app.post('/api/verify/evidence', (req, res) => proxyRequest(req, res, '/evidence'));
app.post('/api/verify/attest', (req, res) => proxyRequest(req, res, '/attest'));
app.get('/api/verify/orders/:id', (req, res) => proxyRequest(req, res, `/orders/${encodeURIComponent(req.params.id)}`));
app.post('/api/verify/claims', (req, res) => proxyRequest(req, res, '/claims'));
app.get('/api/verify/claims/:id', (req, res) => proxyRequest(req, res, `/claims/${encodeURIComponent(req.params.id)}`));
app.get('/api/verify/merkle/proof', (req, res) => proxyRequest(req, res, '/merkle/proof'));
app.get('/api/verify/merkle/batches/:id', (req, res) => proxyRequest(req, res, `/merkle/batches/${encodeURIComponent(req.params.id)}`));

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`US backend proxy listening on http://localhost:${PORT}`);
  console.log(`Forwarding to JP backend at ${JP_BASE}`);
});
