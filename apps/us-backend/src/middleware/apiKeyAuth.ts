import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { DatabaseManager } from '../database/db.js';

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_SECRET_FRAGMENT_LENGTH = 8;
const DEFAULT_MAX_FAILED_ATTEMPTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export interface ApiKeyInfo {
  keyId: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt?: Date;
  enabled: boolean;
  secretPrefix: string;
}

interface ApiKeyRecord {
  id: string;
  key_id: string;
  name: string;
  scopes?: string | null;
  status: string;
  enabled?: number | boolean | null;
  secret_fragment_hash: string;
  secret_prefix: string;
  created_at: string | Date;
  expires_at?: string | Date | null;
}

interface CacheEntry {
  info: ApiKeyInfo;
  secretFragmentHash: Buffer;
  expiresAt: number;
}

interface FailureRecord {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export interface ApiKeyAuthOptions {
  cacheTtlMs?: number;
  secretFragmentLength?: number;
  maxFailedAttempts?: number;
  rateLimitWindowMs?: number;
}

export interface ApiKeyRepository {
  findByKeyId(keyId: string): Promise<ApiKeyRecord | null>;
  markDisabled?(keyId: string): Promise<void>;
}

class SqliteApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: any) {}

  async findByKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    const sql = `
      SELECT
        id,
        COALESCE(key_id, id) AS key_id,
        name,
        scopes,
        status,
        enabled,
        secret_fragment_hash,
        secret_prefix,
        created_at,
        expires_at
      FROM api_keys
      WHERE key_id = ? OR id = ?
      ORDER BY key_id = ? DESC, id = ? DESC
      LIMIT 1
    `;

    if (typeof this.db?.prepare === 'function') {
      const statement = this.db.prepare(sql);
      const row = statement.get(keyId, keyId, keyId, keyId) as ApiKeyRecord | undefined;
      return row ?? null;
    }

    return await new Promise<ApiKeyRecord | null>((resolve, reject) => {
      const callback = (err: Error | null, row: ApiKeyRecord | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ?? null);
      };

      if (typeof this.db?.get === 'function') {
        if (this.db.get.length >= 3) {
          this.db.get(sql, [keyId, keyId, keyId, keyId], callback);
        } else {
          try {
            const result = this.db.get(sql, keyId, keyId, keyId, keyId);
            resolve((result as ApiKeyRecord | undefined) ?? null);
          } catch (error) {
            reject(error as Error);
          }
        }
        return;
      }

      resolve(null);
    });
  }

  async markDisabled(keyId: string): Promise<void> {
    const sql = `
      UPDATE api_keys
      SET status = 'disabled', enabled = 0
      WHERE key_id = ? OR id = ?
    `;

    if (typeof this.db?.prepare === 'function') {
      this.db.prepare(sql).run(keyId, keyId);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (typeof this.db?.run === 'function') {
        if (this.db.run.length >= 3) {
          this.db.run(sql, [keyId, keyId], (err: Error | null) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        } else {
          try {
            this.db.run(sql, keyId, keyId);
            resolve();
          } catch (error) {
            reject(error as Error);
          }
        }
      } else {
        resolve();
      }
    });
  }
}

function hashSecretFragment(fragment: string): Buffer {
  return crypto.createHash('sha256').update(fragment, 'utf8').digest();
}

function parseScopes(scopes?: string | null): string[] {
  if (!scopes) {
    return [];
  }

  if (Array.isArray(scopes)) {
    return scopes;
  }

  try {
    const parsed = JSON.parse(scopes);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    if (typeof scopes === 'string') {
      return scopes.split(',').map(scope => scope.trim()).filter(Boolean);
    }
    return [];
  }
}

function toDate(value?: string | Date | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp);
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }

  return false;
}

function isKeyIdFormatValid(keyId: string): boolean {
  return /^[A-Za-z0-9_\-]{8,128}$/.test(keyId);
}

export class ApiKeyAuthMiddleware {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly failedAttempts = new Map<string, FailureRecord>();
  private readonly cacheTtlMs: number;
  private readonly secretFragmentLength: number;
  private readonly maxFailedAttempts: number;
  private readonly rateLimitWindowMs: number;

  constructor(
    private readonly repository: ApiKeyRepository,
    options: ApiKeyAuthOptions = {}
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.secretFragmentLength = options.secretFragmentLength ?? DEFAULT_SECRET_FRAGMENT_LENGTH;
    this.maxFailedAttempts = options.maxFailedAttempts ?? DEFAULT_MAX_FAILED_ATTEMPTS;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  }

  public invalidateKey(keyId: string): void {
    this.cache.delete(keyId);
  }

  public async disableApiKey(keyId: string): Promise<boolean> {
    if (typeof this.repository.markDisabled !== 'function') {
      this.invalidateKey(keyId);
      return false;
    }

    await this.repository.markDisabled(keyId);
    this.invalidateKey(keyId);
    return true;
  }

  public async validateApiKey(keyId: string, secretFragment: string): Promise<ApiKeyInfo | null> {
    if (!isKeyIdFormatValid(keyId) || !this.isSecretFragmentValid(secretFragment)) {
      return null;
    }

    const cacheEntry = this.cache.get(keyId);
    const now = Date.now();

    if (cacheEntry && cacheEntry.expiresAt > now) {
      const candidateHash = hashSecretFragment(secretFragment);

      try {
        if (crypto.timingSafeEqual(candidateHash, cacheEntry.secretFragmentHash)) {
          this.resetFailureRecord(keyId);
          return cacheEntry.info;
        }
      } catch {
        // ignore and treat as invalid
      }

      this.recordFailure(keyId, 'cache');
      return null;
    }

    const record = await this.repository.findByKeyId(keyId);

    if (!record) {
      this.recordFailure(keyId, 'not_found');
      return null;
    }

    if (!record.secret_fragment_hash) {
      await this.disableLegacyKey(record);
      this.recordFailure(keyId, 'legacy');
      return null;
    }

    const enabled = record.status === 'enabled' || normalizeBoolean(record.enabled);
    const expiresAt = toDate(record.expires_at);

    if (!enabled || (expiresAt && expiresAt.getTime() < now)) {
      this.invalidateKey(keyId);
      this.recordFailure(keyId, 'disabled');
      return null;
    }

    const storedHash = Buffer.from(record.secret_fragment_hash, 'hex');
    const candidateHash = hashSecretFragment(secretFragment);

    if (storedHash.length === 0 || storedHash.length !== candidateHash.length) {
      this.recordFailure(keyId, 'hash_mismatch');
      return null;
    }

    try {
      if (!crypto.timingSafeEqual(candidateHash, storedHash)) {
        this.recordFailure(keyId, 'hash_mismatch');
        return null;
      }
    } catch {
      this.recordFailure(keyId, 'hash_error');
      return null;
    }

    const info: ApiKeyInfo = {
      keyId: record.key_id,
      name: record.name,
      scopes: parseScopes(record.scopes),
      createdAt: toDate(record.created_at) ?? new Date(),
      expiresAt,
      enabled: true,
      secretPrefix: record.secret_prefix
    };

    this.cache.set(keyId, {
      info,
      secretFragmentHash: storedHash,
      expiresAt: now + this.cacheTtlMs
    });

    this.resetFailureRecord(keyId);

    return info;
  }

  public middleware(requiredScopes: string[] = []) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const keyIdHeader = req.headers['x-api-key-id'];
        const secretHeader = req.headers['x-api-key-secret'];

        const keyId = Array.isArray(keyIdHeader) ? keyIdHeader[0] : keyIdHeader;
        const secretFragment = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;

        if (!keyId) {
          return res.status(401).json({
            error: 'MISSING_API_KEY_ID',
            message: 'X-API-Key-Id header is required'
          });
        }

        if (!secretFragment) {
          return res.status(401).json({
            error: 'API_KEY_SECRET_FRAGMENT_REQUIRED',
            message: 'X-API-Key-Secret header is required'
          });
        }

        const keyIdStr = String(keyId);
        const secretStr = String(secretFragment);

        if (!isKeyIdFormatValid(keyIdStr) || !this.isSecretFragmentValid(secretStr)) {
          this.logFailure('invalid_format', keyIdStr, req, secretStr);
          return res.status(401).json({
            error: 'INVALID_API_KEY',
            message: 'Invalid API key credentials'
          });
        }

        const info = await this.validateApiKey(keyIdStr, secretStr);

        if (!info) {
          this.logFailure('unauthorized', keyIdStr, req, secretStr);
          return res.status(401).json({
            error: 'INVALID_API_KEY',
            message: 'Invalid API key credentials'
          });
        }

        if (!this.hasRequiredScopes(info, requiredScopes)) {
          return res.status(403).json({
            error: 'INSUFFICIENT_SCOPES',
            message: 'API key does not grant required scopes',
            required: requiredScopes,
            granted: info.scopes
          });
        }

        (req as any).apiKey = {
          keyId: info.keyId,
          name: info.name,
          scopes: info.scopes,
          secretPrefix: info.secretPrefix
        };

        next();
      } catch (error) {
        console.error('API key auth error:', error);
        res.status(500).json({
          error: 'AUTH_ERROR',
          message: 'API key authentication failed'
        });
      }
    };
  }

  private hasRequiredScopes(info: ApiKeyInfo, requiredScopes: string[]): boolean {
    if (!requiredScopes.length) {
      return true;
    }

    return requiredScopes.every(scope => info.scopes.includes(scope) || info.scopes.includes('*'));
  }

  private isSecretFragmentValid(fragment: string): boolean {
    const regex = new RegExp(`^[A-Za-z0-9]{${this.secretFragmentLength}}$`);
    return regex.test(fragment);
  }

  private recordFailure(keyId: string, reason: string, ip?: string): void {
    const now = Date.now();
    const cacheKey = `${keyId}:${ip ?? 'unknown'}`;
    const record = this.failedAttempts.get(cacheKey);

    if (!record || now - record.firstSeen > this.rateLimitWindowMs) {
      this.failedAttempts.set(cacheKey, {
        count: 1,
        firstSeen: now,
        lastSeen: now
      });
      return;
    }

    record.count += 1;
    record.lastSeen = now;

    if (record.count >= this.maxFailedAttempts) {
      console.warn('[API_KEY_AUTH][RATE_LIMIT]', {
        keyId,
        attempts: record.count,
        windowMs: this.rateLimitWindowMs,
        reason
      });
    }
  }

  private resetFailureRecord(keyId: string): void {
    const keys = Array.from(this.failedAttempts.keys()).filter(cacheKey => cacheKey.startsWith(`${keyId}:`));
    for (const cacheKey of keys) {
      this.failedAttempts.delete(cacheKey);
    }
  }

  private logFailure(reason: string, keyId: string, req: Request, secretFragment: string): void {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    this.recordFailure(keyId, reason, typeof clientIp === 'string' ? clientIp : String(clientIp));

    const maskedFragment = secretFragment.slice(0, 2) + '****';
    console.warn('[API_KEY_AUTH][FAIL]', {
      reason,
      keyId,
      maskedFragment,
      path: req.path,
      method: req.method
    });
  }

  private async disableLegacyKey(record: ApiKeyRecord): Promise<void> {
    if (typeof this.repository.markDisabled === 'function') {
      try {
        await this.repository.markDisabled(record.key_id);
        console.warn('[API_KEY_AUTH][LEGACY_DISABLED]', {
          keyId: record.key_id,
          name: record.name
        });
      } catch (error) {
        console.error('Failed to disable legacy API key', error);
      }
    }
  }
}

export function createApiKeyAuthMiddleware(
  dbManager: DatabaseManager,
  options: ApiKeyAuthOptions = {}
) {
  const repository = new SqliteApiKeyRepository(dbManager.getDatabase());
  const auth = new ApiKeyAuthMiddleware(repository, options);
  return auth.middleware();
}

export function createApiKeyAuthInstance(
  dbManager: DatabaseManager,
  options: ApiKeyAuthOptions = {}
) {
  const repository = new SqliteApiKeyRepository(dbManager.getDatabase());
  return new ApiKeyAuthMiddleware(repository, options);
}
