import { config } from 'dotenv';
import { getAddress } from 'viem';
import { z } from 'zod';

config();

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().min(1).default(8089),
    BASE_RPC_URL: z.string().min(1),
    BASE_CHAIN_ID: z.coerce.number().int(),
    USDC_ADDRESS: z.string().min(1),
    VAULT_ADDRESS: z.string().min(1),
    SESSION_SECRET: z.string().min(1),
    SIWE_DOMAIN: z.string().min(1),
    MIN_CONFIRMATIONS: z.coerce.number().int().min(0).default(0),
    ADMIN_ADDRESSES: z.string().optional()
  })
  .transform(({ ADMIN_ADDRESSES, ...values }) => {
    const adminAddresses = (ADMIN_ADDRESSES ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean)
      .map((address) => getAddress(address).toLowerCase());

    return {
      ...values,
      adminAddresses,
      isProduction: values.NODE_ENV === 'production'
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  throw new Error(`Invalid environment variables: ${JSON.stringify(formatted, null, 2)}`);
}

export const env = parsed.data;
export type Env = typeof env;
