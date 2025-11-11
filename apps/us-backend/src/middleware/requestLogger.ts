import type { NextFunction, Request, Response } from 'express';
import pino from 'pino';

function ensureRequestId(req: Request, res: Response): string {
  const locals = (res.locals ??= {} as Record<string, unknown>);
  const header = req.headers['x-request-id'];
  const headerId = Array.isArray(header) ? header[0] : header;
  const existing = (locals as any).requestId || headerId;

  if (existing) {
    const id = existing.toString();
    (locals as any).requestId = id;
    res.setHeader('X-Request-ID', id);
    return id;
  }

  const generated = `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  (locals as any).requestId = generated;
  res.setHeader('X-Request-ID', generated);
  return generated;
}

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard'
        }
      }
});

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = ensureRequestId(req, res);
  const start = process.hrtime.bigint();

  logger.info({ requestId, method: req.method, url: req.originalUrl }, 'incoming request');

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    (logger as any)[level]({
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    }, 'request completed');
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.warn({ requestId, method: req.method, url: req.originalUrl, durationMs }, 'request closed before finish');
    }
  });

  next();
}