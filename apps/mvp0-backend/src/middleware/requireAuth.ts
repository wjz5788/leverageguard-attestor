import { RequestHandler } from 'express';

export const requireAuth: RequestHandler = (req, res, next) => {
  const address = req.session?.walletAddress;

  if (!address) {
    return res.status(401).json({ error: 'ERR_UNAUTHENTICATED' });
  }

  res.locals.walletAddress = address;
  next();
};
