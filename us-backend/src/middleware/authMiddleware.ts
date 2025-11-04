import { NextFunction, Request, Response } from 'express';
import AuthService, { AuthenticatedUser } from '../services/authService';

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedUser;
}

export type RequireAuthMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;

export function extractToken(req: Request): string | null {
  const { authorization } = req.headers;

  if (authorization) {
    const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
    if (headerValue.toLowerCase().startsWith('bearer ')) {
      return headerValue.slice(7).trim();
    }
  }

  const sessionHeader = req.headers['x-session-token'];
  if (typeof sessionHeader === 'string') {
    return sessionHeader;
  }

  return null;
}

export function createAuthMiddleware(authService: AuthService): RequireAuthMiddleware {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'A valid bearer token is required.'
      });
      return;
    }

    const session = await authService.validateSession(token);

    if (!session) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Session is invalid or has expired.'
      });
      return;
    }

    req.auth = {
      ...session,
      token
    };

    next();
  };
}