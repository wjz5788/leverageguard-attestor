import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiKeyAuthMiddleware,
  type ApiKeyRepository,
  type ApiKeyAuthOptions
} from '../src/middleware/apiKeyAuth.js';

interface FakeApiKeyRecord {
  id: string;
  key_id: string;
  name: string;
  scopes?: string | null;
  status: string;
  enabled?: number | boolean | null;
  secret_fragment_hash: string;
  secret_prefix: string;
  created_at: string;
  expires_at?: string | null;
}

class FakeApiKeyRepository implements ApiKeyRepository {
  private readonly store = new Map<string, FakeApiKeyRecord>();

  constructor(initialRecords: FakeApiKeyRecord[] = []) {
    for (const record of initialRecords) {
      this.store.set(record.key_id, { ...record });
    }
  }

  seed(record: FakeApiKeyRecord) {
    this.store.set(record.key_id, { ...record });
  }

  async findByKeyId(keyId: string) {
    const record = this.store.get(keyId) ?? [...this.store.values()].find(item => item.id === keyId);
    return record ? { ...record } : null;
  }

  async markDisabled(keyId: string) {
    const record = this.store.get(keyId) ?? [...this.store.values()].find(item => item.id === keyId);
    if (record) {
      record.status = 'disabled';
      record.enabled = 0;
    }
  }
}

function hashFragment(fragment: string): string {
  return crypto.createHash('sha256').update(fragment, 'utf8').digest('hex');
}

function createAuth(
  repository: FakeApiKeyRepository,
  options: ApiKeyAuthOptions = {}
) {
  return new ApiKeyAuthMiddleware(repository, options);
}

describe('ApiKeyAuthMiddleware', () => {
  const VALID_KEY_ID = 'sk_live_valid1234';
  const SECRET_FRAGMENT = 'AB12CD34';
  let repository: FakeApiKeyRepository;
  let middleware: ApiKeyAuthMiddleware;

  function seedEnabledKey(overrides: Partial<FakeApiKeyRecord> = {}) {
    repository.seed({
      id: VALID_KEY_ID,
      key_id: VALID_KEY_ID,
      name: 'Test Key',
      scopes: JSON.stringify(['verification:read', 'verification:write']),
      status: 'enabled',
      enabled: 1,
      secret_fragment_hash: hashFragment(SECRET_FRAGMENT),
      secret_prefix: 'sk_live_val***1234',
      created_at: new Date().toISOString(),
      expires_at: null,
      ...overrides
    });
  }

  function createApp(requiredScopes: string[] = []) {
    const app = express();
    app.use(express.json());
    app.get('/protected', middleware.middleware(requiredScopes), (req, res) => {
      res.json({
        ok: true,
        apiKey: (req as any).apiKey
      });
    });
    return app;
  }

  beforeEach(() => {
    repository = new FakeApiKeyRepository();
    middleware = createAuth(repository, { cacheTtlMs: 60_000, secretFragmentLength: 8 });
    seedEnabledKey();
  });

  it('authenticates requests with valid headers', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.apiKey.keyId).toBe(VALID_KEY_ID);
    expect(response.body.apiKey.secretPrefix).toBe('sk_live_val***1234');
  });

  it('rejects requests when secret fragment mismatches', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', 'ZZ99YY88')
      .expect(401);

    expect(response.body.error).toBe('INVALID_API_KEY');
  });

  it('rejects requests for unknown API keys', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', 'sk_live_unknown')
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(401);

    expect(response.body.error).toBe('INVALID_API_KEY');
  });

  it('rejects disabled API keys', async () => {
    seedEnabledKey({ status: 'disabled', enabled: 0 });
    middleware.invalidateKey(VALID_KEY_ID);
    const app = createApp();

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(401);

    expect(response.body.error).toBe('INVALID_API_KEY');
  });

  it('returns specific error when secret fragment header missing', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .expect(401);

    expect(response.body.error).toBe('API_KEY_SECRET_FRAGMENT_REQUIRED');
  });

  it('denies API keys without stored fragment hash and disables them', async () => {
    seedEnabledKey({ secret_fragment_hash: '' });
    const app = createApp();

    await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(401);

    const record = await repository.findByKeyId(VALID_KEY_ID);
    expect(record?.status).toBe('disabled');
  });

  it('invalidates cache when key is disabled', async () => {
    const app = createApp();

    await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(200);

    seedEnabledKey({ status: 'disabled', enabled: 0 });
    middleware.invalidateKey(VALID_KEY_ID);

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(401);

    expect(response.body.error).toBe('INVALID_API_KEY');
  });

  it('ensures timingSafeEqual is used during validation', async () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');

    await middleware.validateApiKey(VALID_KEY_ID, SECRET_FRAGMENT);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs failures without leaking secret fragments', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createApp();

    await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', 'ZZ99YY88')
      .expect(401);

    const logged = warnSpy.mock.calls
      .flat()
      .map(entry => (typeof entry === 'string' ? entry : JSON.stringify(entry)));

    for (const entry of logged) {
      expect(entry).not.toContain('ZZ99YY88');
    }

    warnSpy.mockRestore();
  });

  it('enforces scope checks', async () => {
    const app = createApp(['admin']);

    const response = await request(app)
      .get('/protected')
      .set('X-API-Key-Id', VALID_KEY_ID)
      .set('X-API-Key-Secret', SECRET_FRAGMENT)
      .expect(403);

    expect(response.body.error).toBe('INSUFFICIENT_SCOPES');
  });
});
