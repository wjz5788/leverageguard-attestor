import { NextFunction, Request, Response } from 'express';

function gen(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = (req.headers['x-request-id'] as string) || gen();
  (res.locals as any).requestId = incoming;
  res.setHeader('X-Request-ID', incoming);
  next();
}

