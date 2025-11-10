import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getAddress, verifyMessage } from 'ethers';
import { randomBytes } from 'crypto';

export type LoginType = 'email' | 'wallet';

export interface EmailLoginPayload {
  type: 'email';
  email: string;
  password: string;
}

export interface WalletLoginPayload {
  type: 'wallet';
  walletAddress: string;
  signature: string;
  nonce: string;
}

export type LoginPayload = EmailLoginPayload | WalletLoginPayload;

export interface UserProfile {
  id: string;
  email?: string | null;
  walletAddress?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  language?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown>;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

export interface AuthSession {
  token: string;
  sessionId: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  loginType: LoginType;
}

export interface AuthenticatedUser extends AuthSession {
  profile: UserProfile;
}

export interface LoginResult {
  token: string;
  session: AuthSession;
  profile: UserProfile;
}

export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthServiceOptions {
  jwtSecret?: string;
  sessionDurationMs?: number;
}

import { AppError } from '../types/errors.js';

export class AuthError extends AppError {
  constructor(code: string, message: string, httpStatus: number = 400) {
    super(code as any, message, httpStatus, 'medium');
    this.name = 'AuthError';
  }
}

const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

import dbManager from '../database/db.js';

export default class AuthService {
  private readonly jwtSecret: string;
  private readonly sessionDurationMs: number;
  private db: any;

  constructor(options: AuthServiceOptions = {}) {
    this.jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? 'dev-secret';
    this.sessionDurationMs = options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS;
    this.db = dbManager.getDatabase();
  }

  async verifyLogin(payload: LoginPayload, context: LoginContext = {}): Promise<LoginResult> {
    let processed: LoginPayload = payload;
    let userId: string | null = null;

    try {
      if (payload.type === 'email') {
        this.assertEmailPayload(payload);
      } else {
        this.assertWalletPayload(payload);
        const normalizedWallet = await this.validateWalletLogin(payload);
        processed = { ...payload, walletAddress: normalizedWallet };
      }

      userId = this.resolveUserId(processed);
      const profile = await this.ensureProfile(userId, processed);
      const session = this.createSession(userId, processed.type);

      const nowIso = new Date().toISOString();
      const persistedProfile: UserProfile = {
        ...profile,
        id: userId,
        walletAddress: processed.type === 'wallet' ? processed.walletAddress : profile.walletAddress,
        lastLoginAt: nowIso
      };

      await this.saveSession(session);
      await this.updateProfile(userId, { lastLoginAt: nowIso, walletAddress: persistedProfile.walletAddress });
      await this.recordAuthLog(userId, processed.type, true, null, context);

      return {
        token: session.token,
        session,
        profile: persistedProfile
      };
    } catch (error) {
      if (userId && processed.type === 'wallet') {
        await this.recordAuthLog(userId, 'wallet', false, (error as Error).message, context);
      }
      throw error;
    }
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload & { type?: LoginType };
      const session = await this.getSession(token);

      if (!session || !decoded?.sub || session.userId !== decoded.sub) {
        return null;
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await this.logout(token);
        return null;
      }

      const profile = await this.getProfile(session.userId);

      return {
        ...session,
        profile: profile || this.createDefaultProfile(session.userId, decoded.type)
      };
    } catch (error) {
      return null;
    }
  }

  async issueWalletChallenge(walletAddress: string, context: LoginContext = {}): Promise<WalletChallenge> {
    if (!walletAddress) {
      throw new AuthError('INVALID_WALLET', 'Wallet address is required to request a challenge.');
    }

    const normalized = this.normalizeWalletAddress(walletAddress);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.getChallengeTtlMs());
    const nonce = this.generateNonce();
    const message = this.buildChallengeMessage(normalized, nonce, issuedAt, context);

    await this.db.run(
      `INSERT INTO wallet_login_challenges (nonce, wallet_address, message, issued_at, expires_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(nonce) DO UPDATE SET wallet_address=excluded.wallet_address, message=excluded.message, issued_at=excluded.issued_at, expires_at=excluded.expires_at, consumed_at=NULL`,
      [
        nonce,
        normalized,
        message,
        issuedAt.toISOString(),
        expiresAt.toISOString()
      ]
    );

    return {
      nonce,
      message,
      expiresAt: expiresAt.toISOString()
    };
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]) as any;
    
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      walletAddress: user.wallet_address,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      language: user.language,
      timezone: user.timezone,
      metadata: user.metadata ? JSON.parse(user.metadata) : {},
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    };
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    if (!existing) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }
    
    const merged: UserProfile = {
      ...existing,
      ...updates
    };

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }

    if (updates.walletAddress !== undefined) {
      setClauses.push('wallet_address = ?');
      values.push(updates.walletAddress);
    }

    if (updates.displayName !== undefined) {
      setClauses.push('display_name = ?');
      values.push(updates.displayName);
    }

    if (updates.avatarUrl !== undefined) {
      setClauses.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }

    if (updates.language !== undefined) {
      setClauses.push('language = ?');
      values.push(updates.language);
    }

    if (updates.timezone !== undefined) {
      setClauses.push('timezone = ?');
      values.push(updates.timezone);
    }

    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (updates.lastLoginAt !== undefined) {
      setClauses.push('last_login_at = ?');
      values.push(updates.lastLoginAt);
    }

    if (setClauses.length > 0) {
      values.push(userId);
      const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
      await this.db.run(query, values);
    }

    return merged;
  }

  private assertEmailPayload(payload: EmailLoginPayload) {
    if (!payload.email || !payload.password) {
      throw new AuthError('INVALID_CREDENTIALS', 'Email and password are required.');
    }

    if (!payload.email.includes('@')) {
      throw new AuthError('INVALID_EMAIL', 'A valid email address is required.');
    }

    if (payload.password.length < 6) {
      throw new AuthError('INVALID_CREDENTIALS', 'Password must be at least 6 characters long.');
    }
  }

  private assertWalletPayload(payload: WalletLoginPayload) {
    if (!payload.walletAddress || !payload.signature || !payload.nonce) {
      throw new AuthError('INVALID_CHALLENGE', 'Wallet address, signature, and nonce are required.');
    }

    if (!this.isValidNonce(payload.nonce)) {
      throw new AuthError('INVALID_CHALLENGE', 'Nonce format is invalid.');
    }
  }

  private async validateWalletLogin(payload: WalletLoginPayload): Promise<string> {
    const normalizedWallet = this.normalizeWalletAddress(payload.walletAddress);
    const challenge = await this.db.get(
      'SELECT nonce, wallet_address, message, expires_at, consumed_at FROM wallet_login_challenges WHERE nonce = ?',
      [payload.nonce]
    ) as any;

    if (!challenge) {
      throw new AuthError('INVALID_CHALLENGE', 'Login challenge not found.');
    }

    if ((challenge.wallet_address as string).toLowerCase() !== normalizedWallet) {
      throw new AuthError('INVALID_CHALLENGE', 'Challenge does not belong to this wallet.');
    }

    if (challenge.consumed_at) {
      throw new AuthError('CHALLENGE_USED', 'Login challenge already used.');
    }

    const expiresAt = new Date(challenge.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await this.markChallengeConsumed(payload.nonce);
      throw new AuthError('CHALLENGE_EXPIRED', 'Login challenge has expired.');
    }

    let recovered: string;
    try {
      recovered = this.normalizeWalletAddress(verifyMessage(challenge.message, payload.signature));
    } catch (error) {
      throw new AuthError('INVALID_SIGNATURE', 'Wallet signature verification failed.');
    }

    if (recovered !== normalizedWallet) {
      throw new AuthError('INVALID_SIGNATURE', 'Wallet signature does not match the provided address.');
    }

    await this.markChallengeConsumed(payload.nonce);
    return normalizedWallet;
  }

  private resolveUserId(payload: LoginPayload): string {
    if (payload.type === 'email') {
      return `email:${payload.email.toLowerCase()}`;
    }

    return `wallet:${payload.walletAddress.toLowerCase()}`;
  }

  private async markChallengeConsumed(nonce: string): Promise<void> {
    try {
      await this.db.run(
        'UPDATE wallet_login_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE nonce = ?',
        [nonce]
      );
    } catch (error) {
      console.warn('Failed to mark wallet login challenge consumed', error);
    }
  }

  private normalizeWalletAddress(address: string): string {
    try {
      return getAddress(address).toLowerCase();
    } catch {
      throw new AuthError('INVALID_WALLET', 'Invalid wallet address provided.');
    }
  }

  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  private getChallengeTtlMs(): number {
    const fromEnv = Number(process.env.WALLET_CHALLENGE_TTL_MS ?? '0');
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return fromEnv;
    }
    return 5 * 60 * 1000; // default 5 minutes
  }

  private buildChallengeMessage(wallet: string, nonce: string, issuedAt: Date, context: LoginContext): string {
    const domain = process.env.AUTH_CHALLENGE_DOMAIN ?? 'LiqPass';
    const lines = [
      `${domain} wants you to sign in with your Ethereum account.`,
      '',
      `Wallet: ${wallet}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`
    ];

    if (context.ipAddress) {
      lines.push(`IP: ${context.ipAddress}`);
    }

    if (context.userAgent) {
      lines.push(`User-Agent: ${context.userAgent}`);
    }

    return lines.join('\n');
  }

  private isValidNonce(nonce: string): boolean {
    return typeof nonce === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(nonce);
  }

  private async ensureProfile(userId: string, payload: LoginPayload): Promise<UserProfile> {
    // 检查用户是否已存在
    const existingUser = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]) as any;
    
    if (existingUser) {
      return {
        id: existingUser.id,
        email: existingUser.email,
        walletAddress: existingUser.wallet_address,
        displayName: existingUser.display_name,
        avatarUrl: existingUser.avatar_url,
        language: existingUser.language,
        timezone: existingUser.timezone,
        metadata: existingUser.metadata ? JSON.parse(existingUser.metadata) : {},
        lastLoginAt: existingUser.last_login_at,
        createdAt: existingUser.created_at
      };
    }

    // 创建新用户
    const nowIso = new Date().toISOString();
    const email = payload.type === 'email' ? payload.email : null;
    const walletAddress = payload.type === 'wallet' ? payload.walletAddress : null;

    await this.db.run(
      'INSERT INTO users (id, email, wallet_address, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)',
      [userId, email, walletAddress, nowIso, nowIso]
    );

    return {
      id: userId,
      email,
      walletAddress,
      createdAt: nowIso,
      lastLoginAt: nowIso
    };
  }

  private createDefaultProfile(userId: string, loginType?: LoginType): UserProfile {
    return {
      id: userId,
      displayName: loginType === 'wallet' ? this.maskWallet(userId.replace('wallet:', '')) : undefined,
      avatarUrl: null,
      language: 'en',
      timezone: 'UTC',
      metadata: {}
    };
  }

  private maskWallet(address: string): string {
    if (!address) {
      return 'Wallet User';
    }

    const trimmed = address.trim();
    if (trimmed.length <= 10) {
      return trimmed;
    }

    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  private createSession(userId: string, loginType: LoginType): AuthSession {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.sessionDurationMs);
    const jwtPayload = {
      sub: userId,
      type: loginType,
      jti: uuid()
    };

    const token = jwt.sign(jwtPayload, this.jwtSecret, {
      expiresIn: Math.floor(this.sessionDurationMs / 1000)
    });

    return {
      token,
      sessionId: uuid(),
      userId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      loginType
    };
  }

  private async saveSession(session: AuthSession): Promise<void> {
    const query = `
      INSERT INTO sessions (token, session_id, user_id, issued_at, expires_at, login_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(query, [
      session.token,
      session.sessionId,
      session.userId,
      session.issuedAt,
      session.expiresAt,
      session.loginType
    ]);
  }

  async getSession(token: string): Promise<AuthSession | null> {
    const session = await this.db.get(
      'SELECT * FROM sessions WHERE token = ?',
      [token]
    ) as any;

    if (!session) return null;

    return {
      token: session.token,
      sessionId: session.session_id,
      userId: session.user_id,
      issuedAt: session.issued_at,
      expiresAt: session.expires_at,
      loginType: session.login_type
    };
  }

  async logout(token: string): Promise<void> {
    await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run('DELETE FROM sessions WHERE expires_at < ?', [now]);
  }

  private async recordAuthLog(
    userId: string,
    loginType: LoginType,
    success: boolean,
    errorMessage: string | null,
    context: LoginContext
  ): Promise<void> {
    try {
      await this.db.run(
        'INSERT INTO auth_logs (id, user_id, action, login_type, ip_address, user_agent, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        uuid(),
        userId,
        'login',
        loginType,
        context.ipAddress ?? null,
        context.userAgent ?? null,
        success ? 1 : 0,
        errorMessage ?? null
      );
    } catch (error) {
      console.warn('Failed to record auth log', error);
    }
  }
}