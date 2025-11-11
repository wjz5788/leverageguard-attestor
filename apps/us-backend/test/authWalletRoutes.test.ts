import express from 'express';
import request from 'supertest';
import { Wallet } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type WalletChallengeRecord = {
  nonce: string;
  wallet_address: string;
  message: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type UserRecord = {
  id: string;
  email: string | null;
  wallet_address: string | null;
  display_name: string | null;
  avatar_url: string | null;
  language: string | null;
  timezone: string | null;
  metadata: string | null;
  last_login_at: string | null;
  created_at: string | null;
};

type SessionRecord = {
  token: string;
  session_id: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  login_type: string;
};

type TestDbState = {
  walletChallenges: Map<string, WalletChallengeRecord>;
  users: Map<string, UserRecord>;
  sessions: Map<string, SessionRecord>;
  authLogs: any[];
};

const testDbState: TestDbState = {
  walletChallenges: new Map(),
  users: new Map(),
  sessions: new Map(),
  authLogs: []
};

function resetTestDbState() {
  testDbState.walletChallenges.clear();
  testDbState.users.clear();
  testDbState.sessions.clear();
  testDbState.authLogs.length = 0;
}

function createFakeDb(state: TestDbState) {
  return {
    async get(sql: string, params: any[]) {
      if (sql.includes('FROM wallet_login_challenges')) {
        const record = state.walletChallenges.get(params[0]);
        return record ? { ...record } : undefined;
      }

      if (sql.includes('FROM users WHERE id = ?')) {
        const record = state.users.get(params[0]);
        return record ? { ...record } : undefined;
      }

      if (sql.includes('FROM sessions WHERE token = ?')) {
        const record = state.sessions.get(params[0]);
        return record ? { ...record } : undefined;
      }

      return undefined;
    },
    async run(sql: string, params: any[]) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('INSERT INTO wallet_login_challenges')) {
        const [nonce, wallet, message, issuedAt, expiresAt] = params;
        state.walletChallenges.set(nonce, {
          nonce,
          wallet_address: wallet,
          message,
          issued_at: issuedAt,
          expires_at: expiresAt,
          consumed_at: null
        });
      } else if (normalized.startsWith('UPDATE wallet_login_challenges SET consumed_at')) {
        const [nonce] = params;
        const record = state.walletChallenges.get(nonce);
        if (record) {
          record.consumed_at = new Date().toISOString();
        }
      } else if (normalized.startsWith('INSERT INTO users')) {
        const [id, email, walletAddress, createdAt, lastLoginAt] = params;
        state.users.set(id, {
          id,
          email,
          wallet_address: walletAddress,
          display_name: null,
          avatar_url: null,
          language: null,
          timezone: null,
          metadata: null,
          created_at: createdAt,
          last_login_at: lastLoginAt
        });
      } else if (normalized.startsWith('UPDATE users SET')) {
        const userId = params[params.length - 1];
        const user = state.users.get(userId);
        if (user) {
          const assignments = normalized
            .slice(normalized.indexOf('SET') + 3, normalized.indexOf('WHERE'))
            .split(',')
            .map(item => item.trim());
          let index = 0;
          for (const assignment of assignments) {
            const [column] = assignment.split('=');
            const value = params[index];
            index += 1;
            switch (column.trim()) {
              case 'email':
                user.email = value;
                break;
              case 'wallet_address':
                user.wallet_address = value;
                break;
              case 'display_name':
                user.display_name = value;
                break;
              case 'avatar_url':
                user.avatar_url = value;
                break;
              case 'language':
                user.language = value;
                break;
              case 'timezone':
                user.timezone = value;
                break;
              case 'metadata':
                user.metadata = value;
                break;
              case 'last_login_at':
                user.last_login_at = value;
                break;
              default:
                break;
            }
          }
        }
      } else if (normalized.startsWith('INSERT INTO sessions')) {
        const [token, sessionId, userId, issuedAt, expiresAt, loginType] = params;
        state.sessions.set(token, {
          token,
          session_id: sessionId,
          user_id: userId,
          issued_at: issuedAt,
          expires_at: expiresAt,
          login_type: loginType
        });
      } else if (normalized.startsWith('DELETE FROM sessions WHERE token = ?')) {
        const [token] = params;
        state.sessions.delete(token);
      } else if (normalized.startsWith('DELETE FROM sessions WHERE expires_at <')) {
        const [expiresBefore] = params;
        for (const [token, session] of state.sessions.entries()) {
          if (session.expires_at < expiresBefore) {
            state.sessions.delete(token);
          }
        }
      } else if (normalized.startsWith('INSERT INTO auth_logs')) {
        state.authLogs.push(params);
      }

      return { changes: 1, lastInsertRowid: 0 };
    },
    async all() {
      return [];
    },
    transaction<T>(fn: () => T) {
      return fn;
    }
  };
}

vi.mock('../src/database/db.js', () => {
  const db = createFakeDb(testDbState);
  return {
    __esModule: true,
    default: { getDatabase: () => db },
    dbManager: { getDatabase: () => db },
    db,
    __testState: testDbState
  };
});

const { default: AuthService } = await import('../src/services/authService.js');
const {
  default: authRoutes,
  getAuthEmailAttemptsBlockedCount,
  resetAuthEmailAttemptsBlockedCount
} = await import('../src/routes/auth.js');

type RequireAuthMiddleware = Parameters<typeof authRoutes>[1];
const noopRequireAuth: RequireAuthMiddleware = (_req, _res, next) => next();

describe('wallet authentication routes', () => {
  let app: express.Express;
  let authService: InstanceType<typeof AuthService>;

  beforeEach(() => {
    resetTestDbState();
    resetAuthEmailAttemptsBlockedCount();
    authService = new AuthService({ jwtSecret: 'test-secret', sessionDurationMs: 60_000 });
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes(authService, noopRequireAuth));
  });

  it('issues wallet nonce for valid address', async () => {
    const wallet = Wallet.createRandom();

    const response = await request(app)
      .post('/api/v1/auth/wallet/nonce')
      .send({ walletAddress: wallet.address });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('nonce');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('expiresAt');
  });

  it('verifies wallet login with valid signature', async () => {
    const wallet = Wallet.createRandom();

    const nonceResponse = await request(app)
      .post('/api/v1/auth/wallet/nonce')
      .send({ walletAddress: wallet.address });

    const signature = await wallet.signMessage(nonceResponse.body.message);

    const verifyResponse = await request(app)
      .post('/api/v1/auth/wallet/verify')
      .send({
        walletAddress: wallet.address,
        signature,
        nonce: nonceResponse.body.nonce
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body).toHaveProperty('token');
    expect(verifyResponse.body.session.loginType).toBe('wallet');
    expect(getAuthEmailAttemptsBlockedCount()).toBe(0);
  });

  it('rejects wallet login when signature is invalid', async () => {
    const wallet = Wallet.createRandom();
    const impostor = Wallet.createRandom();

    const nonceResponse = await request(app)
      .post('/api/v1/auth/wallet/nonce')
      .send({ walletAddress: wallet.address });

    const verifyResponse = await request(app)
      .post('/api/v1/auth/wallet/verify')
      .send({
        walletAddress: wallet.address,
        signature: await impostor.signMessage(nonceResponse.body.message),
        nonce: nonceResponse.body.nonce
      });

    expect(verifyResponse.status).toBe(401);
    expect(verifyResponse.body.error).toBe('INVALID_SIGNATURE');
    expect(testDbState.sessions.size).toBe(0);
  });

  it('blocks email/password login attempts with monitoring log', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/v1/auth/wallet/verify')
      .send({ email: 'user@example.com', password: 'secret' });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('WALLET_LOGIN_ONLY');
    expect(testDbState.sessions.size).toBe(0);
    expect(getAuthEmailAttemptsBlockedCount()).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('auth_email_attempts_blocked'),
      expect.objectContaining({ count: 1 })
    );

    warnSpy.mockRestore();
  });
});
