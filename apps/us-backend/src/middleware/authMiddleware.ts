import { NextFunction, Request, Response } from 'express';
import AuthService, { AuthenticatedUser } from '../services/authService';
import { AuthenticationError, ERROR_CODES } from '../types/errors.js';

export interface AuthInfo {
  method?: string;
  authInfo?: any;
  authenticatedAt?: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedUser | AuthInfo;
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
      return next(new AuthenticationError(
        ERROR_CODES.UNAUTHORIZED,
        'A valid bearer token is required.'
      ));
    }

    const session = await authService.validateSession(token);

    if (!session) {
      return next(new AuthenticationError(
        ERROR_CODES.SESSION_EXPIRED,
        'Session is invalid or has expired.'
      ));
    }

    req.auth = {
      ...session,
      token
    };

    next();
  };
}
