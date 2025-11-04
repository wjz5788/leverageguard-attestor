import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

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
  email?: string;
  walletAddress?: string;
  displayName?: string;
  avatarUrl?: string | null;
  language?: string | null;
  timezone?: string | null;
  metadata?: Record<string, unknown>;
  lastLoginAt?: string | null;
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

export interface AuthServiceOptions {
  jwtSecret?: string;
  sessionDurationMs?: number;
}

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

export default class AuthService {
  private readonly jwtSecret: string;
  private readonly sessionDurationMs: number;
  private sessions = new Map<string, AuthSession>();
  private profiles = new Map<string, UserProfile>();

  constructor(options: AuthServiceOptions = {}) {
    this.jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? 'dev-secret';
    this.sessionDurationMs = options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS;
  }

  async verifyLogin(payload: LoginPayload): Promise<LoginResult> {
    if (payload.type === 'email') {
      this.assertEmailPayload(payload);
    } else {
      this.assertWalletPayload(payload);
    }

    const userId = this.resolveUserId(payload);
    const profile = this.ensureProfile(userId, payload);
    const session = this.createSession(userId, payload.type);

    const nowIso = new Date().toISOString();
    const persistedProfile: UserProfile = {
      ...profile,
      id: userId,
      lastLoginAt: nowIso
    };

    this.sessions.set(session.token, session);
    this.profiles.set(userId, persistedProfile);

    return {
      token: session.token,
      session,
      profile: persistedProfile
    };
  }

  async logout(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload & { type?: LoginType };
      const session = this.sessions.get(token);
      if (!session || !decoded?.sub || session.userId !== decoded.sub) {
        return null;
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        this.sessions.delete(token);
        return null;
      }

      const profile = this.profiles.get(session.userId) ?? this.createDefaultProfile(session.userId, decoded.type);

      return {
        ...session,
        profile
      };
    } catch (error) {
      return null;
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const existing = this.profiles.get(userId) ?? this.createDefaultProfile(userId);
    const merged: UserProfile = {
      ...existing,
      ...updates,
      id: userId
    };

    this.profiles.set(userId, merged);
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
  }

  private resolveUserId(payload: LoginPayload): string {
    if (payload.type === 'email') {
      return `email:${payload.email.toLowerCase()}`;
    }

    return `wallet:${payload.walletAddress.toLowerCase()}`;
  }

  private ensureProfile(userId: string, payload: LoginPayload): UserProfile {
    const existing = this.profiles.get(userId);
    if (existing) {
      return existing;
    }

    const profile = this.createDefaultProfile(userId, payload.type);

    if (payload.type === 'email') {
      profile.email = payload.email.toLowerCase();
      profile.displayName = profile.displayName ?? payload.email.split('@')[0];
    } else {
      profile.walletAddress = payload.walletAddress;
      profile.displayName = profile.displayName ?? this.maskWallet(payload.walletAddress);
    }

    this.profiles.set(userId, profile);
    return profile;
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
}