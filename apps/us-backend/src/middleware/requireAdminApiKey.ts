import type express from 'express';

export function requireAdminApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = (req.headers['x-admin-api-key'] || req.headers['X-Admin-Api-Key'] || req.headers['x-api-key'] || '') as string;
  const admin = (process.env.ADMIN_API_KEY || '').trim();
  if (!admin || !header || header.trim() !== admin) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Missing or invalid admin API key' });
  }
  next();
}

export default requireAdminApiKey;
