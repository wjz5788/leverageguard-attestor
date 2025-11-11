import express from 'express';
import { z } from 'zod';
import AuthService, { AuthError, LoginPayload, LoginResult } from '../services/authService.js';
import { AuthenticatedRequest, RequireAuthMiddleware } from '../middleware/authMiddleware.js';

const emailLoginSchema = z.object({
  type: z.literal('email'),
  email: z.string().email(),
  password: z.string().min(6)
});

const walletLoginSchema = z.object({
  type: z.literal('wallet'),
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
  nonce: z.string().min(1)
});

const loginSchema = z.union([emailLoginSchema, walletLoginSchema]);

const walletChallengeSchema = z.object({
  walletAddress: z.string().min(1)
});

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

  router.post('/challenge', async (req, res) => {
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

  router.post('/login', async (req, res) => {
    const parseResult = loginSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Login payload is invalid.',
        issues: parseResult.error.issues
      });
    }

    try {
      const payload = parseResult.data as LoginPayload;
      const result = await authService.verifyLogin(payload, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined
      });

      return res.status(200).json(formatLoginResult(result));
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(401).json({
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