import express from 'express';
import { z } from 'zod';
import AuthService, { AuthError, LoginResult } from '../services/authService.js';
import { AuthenticatedRequest, RequireAuthMiddleware } from '../middleware/authMiddleware.js';

const walletChallengeSchema = z.object({
  walletAddress: z.string().min(1)
});

const walletVerifySchema = z.object({
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
  nonce: z.string().min(1)
});

const WALLET_ONLY_ERROR = {
  error: 'WALLET_LOGIN_ONLY',
  message: 'Email/password login is no longer supported. Use wallet login instead.'
};

let blockedEmailAttempts = 0;

function containsEmailCredentials(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.email === 'string' || typeof candidate.password === 'string') {
    return true;
  }

  if (candidate.type === 'email') {
    return true;
  }

  if (candidate.credentials && typeof candidate.credentials === 'object') {
    const nested = candidate.credentials as Record<string, unknown>;
    if (typeof nested.email === 'string' || typeof nested.password === 'string') {
      return true;
    }
  }

  return false;
}

function blockEmailLogin(req: express.Request, res: express.Response) {
  blockedEmailAttempts += 1;
  console.warn('[monitoring] auth_email_attempts_blocked', {
    count: blockedEmailAttempts,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined
  });
  return res.status(410).json(WALLET_ONLY_ERROR);
}

export function getAuthEmailAttemptsBlockedCount(): number {
  return blockedEmailAttempts;
}

export function resetAuthEmailAttemptsBlockedCount(): void {
  blockedEmailAttempts = 0;
}

function formatLoginResult(result: LoginResult) {
  return {
    token: result.token,
    session: {
      id: result.session.sessionId,
      issuedAt: result.session.issuedAt,
      expiresAt: result.session.expiresAt,
      loginType: result.session.loginType
    },
    profile: result.profile
  };
}

export default function authRoutes(authService: AuthService, requireAuth: RequireAuthMiddleware) {
  const router = express.Router();

  router.post('/wallet/nonce', async (req, res) => {
    if (containsEmailCredentials(req.body)) {
      return blockEmailLogin(req, res);
    }

    const parseResult = walletChallengeSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Wallet challenge request is invalid.',
        issues: parseResult.error.issues
      });
    }

    try {
      const challenge = await authService.issueWalletChallenge(parseResult.data.walletAddress, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined
      });
      return res.status(201).json(challenge);
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(400).json({
          error: error.code,
          message: error.message
        });
      }

      console.error('Challenge error:', error);
      return res.status(500).json({
        error: 'CHALLENGE_FAILED',
        message: 'Unable to create wallet challenge at this time.'
      });
    }
  });

  router.post('/wallet/verify', async (req, res) => {
    if (containsEmailCredentials(req.body)) {
      return blockEmailLogin(req, res);
    }

    const parseResult = walletVerifySchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Login payload is invalid.',
        issues: parseResult.error.issues
      });
    }

    try {
      const result = await authService.verifyLogin(parseResult.data, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined
      });

      return res.status(200).json(formatLoginResult(result));
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.httpStatus ?? 401).json({
          error: error.code,
          message: error.message
        });
      }

      console.error('Login error:', error);
      return res.status(500).json({
        error: 'LOGIN_FAILED',
        message: 'Unable to complete login at this time.'
      });
    }
  });

  router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
    // 检查是否是AuthenticatedUser类型
    if (!('token' in req.auth!)) {
      return res.status(400).json({
        error: 'INVALID_SESSION',
        message: 'No active session token found.'
      });
    }
    
    const token = req.auth?.token;

    if (!token) {
      return res.status(400).json({
        error: 'INVALID_SESSION',
        message: 'No active session token found.'
      });
    }

    await authService.logout(token);

    return res.status(204).send();
  });

  return router;
}