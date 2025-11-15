import { RequestHandler } from 'express';

import { env } from '../env';

export const requireAdmin: RequestHandler = (req, res, next) => {
  const wallet = res.locals.walletAddress as string | undefined;

  if (!wallet) {
    return res.status(401).json({ error: 'ERR_UNAUTHENTICATED' });
  }

  if (!env.adminAddresses.includes(wallet)) {
    return res.status(403).json({ error: 'ERR_FORBIDDEN' });
  }

  next();
};
