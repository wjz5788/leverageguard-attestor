import { Router } from 'express';
import { getAddress } from 'viem';
import { generateNonce, SiweMessage } from 'siwe';
import { z } from 'zod';

import { env } from '../env';

const router = Router();

router.post('/auth/siwe/start', (req, res) => {
  const nonce = generateNonce();

  if (req.session) {
    req.session.siweNonce = nonce;
  }

  res.json({ nonce });
});

const verifySchema = z.object({
  message: z.string(),
  signature: z.string()
});

router.post('/auth/siwe/verify', async (req, res) => {
  if (!req.session || !req.session.siweNonce) {
    return res.status(400).json({ error: 'ERR_NO_NONCE' });
  }

  const { message, signature } = verifySchema.parse(req.body);

  try {
    const siweMessage = new SiweMessage(message);
    const { data } = await siweMessage.verify({
      signature,
      domain: env.SIWE_DOMAIN,
      nonce: req.session.siweNonce
    });

    req.session.walletAddress = getAddress(data.address).toLowerCase();
    req.session.siweNonce = undefined;

    res.json({ address: data.address });
  } catch (error) {
    req.session.walletAddress = undefined;
    return res.status(401).json({ error: 'ERR_SIWE_VERIFICATION_FAILED' });
  }
});

export default router;
