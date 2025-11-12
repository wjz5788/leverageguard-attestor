import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

import { env } from './env';

const chain = {
  ...base,
  id: env.BASE_CHAIN_ID,
  rpcUrls: {
    ...base.rpcUrls,
    default: {
      http: [env.BASE_RPC_URL]
    },
    public: {
      http: [env.BASE_RPC_URL]
    }
  }
};

export const publicClient = createPublicClient({
  chain,
  transport: http(env.BASE_RPC_URL)
});
