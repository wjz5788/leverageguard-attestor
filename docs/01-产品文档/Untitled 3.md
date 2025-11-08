好，直接给你**后端最小可用实现**（TypeScript + Express + ethers v6），只包含两条路由：

* `POST /api/v1/pricing/quote`（PRICER 出 EIP-712 Quote 签名）
* `POST /api/v1/voucher/issue`（ATTESTOR 出 EIP-712 Voucher 签名）

> 你把下面文件放进 `us-backend`，装依赖、填 `.env`，就能跑起来对接你刚改好的产品页。

---

# 1) 安装依赖

```bash
cd us-backend
npm i ethers zod
# 如果还没装 express/cors：
npm i express cors
```

---

# 2) 环境变量（新建 `.env`）

```ini
# 必填：你合约地址（未部署前可先占位，前端会提示缺失）
POLICY_ADDR=0x0000000000000000000000000000000000000000

# 必填：私钥（测试先用小额钱包；主网请用专用热钱包）
PRICER_PRIVATE_KEY=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ATTESTOR_PRIVATE_KEY=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

# 网络（Base 主网 8453）
CHAIN_ID=8453

# 生效窗口（秒）
QUOTE_TTL_SEC=60
VOUCHER_TTL_SEC=300

# 风控护栏（USDC 6 位整数）
MAX_PAYOUT_CAP_6D=200000000   # 200 USDC
SKU_MIN_DURATION=1
SKU_MAX_DURATION=72
```

---

# 3) 共享工具（`src/lib/eip712.ts`）

```ts
// src/lib/eip712.ts
import { Wallet, keccak256, toUtf8Bytes, zeroPadValue, encodeBytes32String } from "ethers";

export type Quote = {
  wallet: string;
  inputHash: `0x${string}`;
  price: bigint;        // USDC 6d (uint96)
  maxPayout: bigint;    // USDC 6d (uint96)
  durationHours: number;
  quoteId: `0x${string}`;
  deadline: number;     // unix seconds
  chainId: number;
  contractAddr: string;
  skuId?: number;       // 前端/后端扩展字段，签名不包含
  exchangeId?: `0x${string}`; // 扩展字段
  accountHash?: `0x${string}`;// 扩展字段
};

export type Voucher = {
  wallet: string;
  skuId: number;
  exchangeId: `0x${string}`;
  accountHash: `0x${string}`;
  deadline: number;
  nonce: number;
  voucherId: `0x${string}`;
};

export const types = {
  Voucher: [
    { name: "wallet", type: "address" },
    { name: "skuId", type: "uint32" },
    { name: "exchangeId", type: "bytes32" },
    { name: "accountHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "voucherId", type: "bytes32" },
  ],
  Quote: [
    { name: "wallet", type: "address" },
    { name: "inputHash", type: "bytes32" },
    { name: "price", type: "uint96" },
    { name: "maxPayout", type: "uint96" },
    { name: "durationHours", type: "uint32" },
    { name: "quoteId", type: "bytes32" },
    { name: "deadline", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "contractAddr", type: "address" },
  ],
} as const;

export const domain = (chainId: number, verifyingContract: string) => ({
  name: "LiqPass",
  version: "1",
  chainId,
  verifyingContract,
});

export const hex32 = (v: string): `0x${string}` => {
  if (v.startsWith("0x")) {
    const s = v.slice(2);
    if (s.length > 64) throw new Error("bytes32 overflow");
    return ("0x" + s.padStart(64, "0")) as `0x${string}`;
  }
  // ascii -> bytes32（右侧零填充）
  return encodeBytes32String(v) as `0x${string}`;
};

export const b32keccak = (s: string): `0x${string}` =>
  (zeroPadValue(keccak256(toUtf8Bytes(s)), 32) as `0x${string}`);

export const randB32 = (): `0x${string}` =>
  b32keccak(`${Date.now()}:${Math.random()}`);

export async function signQuote(signer: Wallet, chainId: number, policy: string, q: Quote) {
  const d = domain(chainId, policy);
  const sig = await signer.signTypedData(d, types.Quote, {
    wallet: q.wallet,
    inputHash: q.inputHash,
    price: q.price,
    maxPayout: q.maxPayout,
    durationHours: q.durationHours,
    quoteId: q.quoteId,
    deadline: q.deadline,
    chainId: q.chainId,
    contractAddr: q.contractAddr,
  });
  return sig;
}

export async function signVoucher(signer: Wallet, chainId: number, policy: string, v: Voucher) {
  const d = domain(chainId, policy);
  const sig = await signer.signTypedData(d, types.Voucher, v);
  return sig;
}
```

---

# 4) 报价与校验工具（`src/lib/quote.ts`）

```ts
// src/lib/quote.ts
import { keccak256, toUtf8Bytes } from "ethers";

const MIN_P = 50, MAX_P = 500;
const MIN_L = 10, MAX_L = 100;

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
export function to6d(n: number) {
  return BigInt(Math.round(n * 1_000_000));
}

export function computeQuoteServer(params: {
  principal: number; leverage: number; k?: number;
}) {
  const p = clamp(Number(params.principal || 0), MIN_P, MAX_P);
  const L = clamp(Number(params.leverage || 0), MIN_L, MAX_L);
  const K = Number(params.k ?? 1);

  const baseFee = Math.min(0.15, 0.05 + (L - 20) * 0.001 + (p / 500) * 0.02);
  const fee = Math.min(0.15, baseFee * K);
  const payout = Math.min(0.5, Math.max(0.1,
                    0.25 + (L - 50) * 0.005 - (p / 500) * 0.1));

  return {
    p, L, K,
    feeRatio: fee,
    payoutRatio: payout,
    premiumUSDC_6d: to6d(p * fee),
    maxPayoutUSDC_6d: to6d(p * payout),
  };
}

export function canonicalInputHash(input: any): `0x${string}` {
  // 与前端一致：把关键信息做规范化 JSON 再 keccak
  const obj = {
    principal: Number(input.principal),
    leverage: Number(input.leverage),
    durationHours: Number(input.durationHours),
    wallet: String(input.wallet).toLowerCase(),
  };
  const s = JSON.stringify(obj);
  return keccak256(toUtf8Bytes(s)) as `0x${string}`;
}
```

---

# 5) 路由：Quote（`src/routes/pricing.ts`）

```ts
// src/routes/pricing.ts
import { Router } from "express";
import { z } from "zod";
import { Wallet } from "ethers";
import { canonicalInputHash, computeQuoteServer, to6d, clamp } from "../lib/quote";
import { hex32, randB32, signQuote } from "../lib/eip712";

const router = Router();

const CHAIN_ID = Number(process.env.CHAIN_ID || 8453);
const POLICY_ADDR = process.env.POLICY_ADDR!;
const QUOTE_TTL = Number(process.env.QUOTE_TTL_SEC || 60);
const MAX_PAYOUT_CAP_6D = BigInt(process.env.MAX_PAYOUT_CAP_6D || "200000000");
const SKU_MIN_DURATION = Number(process.env.SKU_MIN_DURATION || 1);
const SKU_MAX_DURATION = Number(process.env.SKU_MAX_DURATION || 72);

const pricer = new Wallet(process.env.PRICER_PRIVATE_KEY!);

const schema = z.object({
  principal: z.number().min(1),
  leverage: z.number().min(1),
  durationHours: z.number().int().min(1),
  skuId: z.number().int().optional(),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  k: z.number().optional(),
});

router.post("/quote", async (req, res) => {
  try {
    const p = schema.parse(req.body);

    // 护栏：时长与最高赔付上限
    const duration = clamp(p.durationHours, SKU_MIN_DURATION, SKU_MAX_DURATION);

    // 服务器计算价格（与你前端一致）
    const calc = computeQuoteServer({ principal: p.principal, leverage: p.leverage, k: p.k });
    // 上限再卡一次
    const maxPayout = calc.maxPayoutUSDC_6d > MAX_PAYOUT_CAP_6D ? MAX_PAYOUT_CAP_6D : calc.maxPayoutUSDC_6d;

    const inputHash = canonicalInputHash({
      principal: calc.p, leverage: calc.L, durationHours: duration, wallet: p.wallet
    });
    const now = Math.floor(Date.now()/1000);

    const quote = {
      wallet: p.wallet,
      inputHash,
      price: calc.premiumUSDC_6d,
      maxPayout,
      durationHours: duration,
      quoteId: randB32(),
      deadline: now + QUOTE_TTL,
      chainId: CHAIN_ID,
      contractAddr: POLICY_ADDR,
      skuId: p.skuId ?? 101,
    } as const;

    const quoteSig = await signQuote(pricer, CHAIN_ID, POLICY_ADDR, quote as any);

    // 前端/后端幂等键（落单用）
    const idempotencyKey = `Q-${now}-${quote.quoteId}`;

    // 可选：给前端一些扩展字段（不进签名）
    const resp = {
      idempotencyKey,
      quote: {
        ...quote,
        exchangeId: hex32("okx"),
        accountHash: hex32("masked"), // 真实情况由 JP Verify 返回
      },
      quoteSig,
      payment: {
        chainId: "0x" + CHAIN_ID.toString(16),
        usdcContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        spenderOrVault: POLICY_ADDR, // buyPolicy 由合约扣费
      }
    };

    res.json(resp);
  } catch (e: any) {
    res.status(400).json({ message: e?.message || "bad_request" });
  }
});

export default router;
```

---

# 6) 路由：Voucher（`src/routes/voucher.ts`）

```ts
// src/routes/voucher.ts
import { Router } from "express";
import { z } from "zod";
import { Wallet } from "ethers";
import { hex32, randB32, signVoucher, b32keccak } from "../lib/eip712";

const router = Router();

const CHAIN_ID = Number(process.env.CHAIN_ID || 8453);
const POLICY_ADDR = process.env.POLICY_ADDR!;
const VOUCHER_TTL = Number(process.env.VOUCHER_TTL_SEC || 300);

const attestor = new Wallet(process.env.ATTESTOR_PRIVATE_KEY!);

const schema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  skuId: z.number().int(),
  exchangeId: z.string().optional(),      // "okx" / bytes32 / 0x...
  accountHash: z.string().optional(),     // 0x... bytes32（JP Verify 的用户账户指纹）
  nonce: z.number().int().optional(),     // 可选，自带 nonce
});

router.post("/issue", async (req, res) => {
  try {
    const p = schema.parse(req.body);
    const now = Math.floor(Date.now()/1000);

    const exchangeId = p.exchangeId
      ? hex32(p.exchangeId)
      : hex32("okx");

    const accountHash = p.accountHash
      ? hex32(p.accountHash)
      : b32keccak(`anon:${p.wallet.toLowerCase()}`); // 临时占位；上线用 JP Verify 真值

    const voucher = {
      wallet: p.wallet,
      skuId: p.skuId,
      exchangeId,
      accountHash,
      deadline: now + VOUCHER_TTL,
      nonce: p.nonce ?? 1,
      voucherId: randB32(),
    } as const;

    const voucherSig = await signVoucher(attestor, CHAIN_ID, POLICY_ADDR, voucher);

    // verifyHash：如果你这步已经有证据摘要，也可回给前端
    const verifyHash = "0x" + "00".repeat(32);

    res.json({ voucher, voucherSig, verifyHash });
  } catch (e: any) {
    res.status(400).json({ message: e?.message || "bad_request" });
  }
});

export default router;
```

---

# 7) 接入到你的后端（`src/index.ts` 或 `app.ts`）

```ts
import express from "express";
import cors from "cors";
import pricing from "./routes/pricing";
import voucher from "./routes/voucher";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (_, res) => res.json({ ok: true }));
app.use("/api/v1/pricing", pricing);
app.use("/api/v1/voucher", voucher);

// 你已有 /api/v1/orders 等路由保持不变
// app.use("/api/v1/orders", ordersRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`us-backend listening on :${port}`));
```

---

# 8) 本地快速自测

**Quote：**

```bash
curl -s http://localhost:8080/api/v1/pricing/quote \
  -H 'content-type: application/json' \
  -d '{"principal":200,"leverage":20,"durationHours":24,"skuId":101,"wallet":"0x1111111111111111111111111111111111111111"}' | jq
```

**Voucher：**

```bash
curl -s http://localhost:8080/api/v1/voucher/issue \
  -H 'content-type: application/json' \
  -d '{"wallet":"0x1111111111111111111111111111111111111111","skuId":101}' | jq
```

> 返回里必须包含：`idempotencyKey`、`quote{...,contractAddr,deadline,price,...}`、`quoteSig`，以及 `voucher{...}`、`voucherSig`。前端会用它们直接调用合约 `buyPolicy(...)`。

---

# 9) 接口约定对齐（和你前端新逻辑一致）

* `/api/v1/pricing/quote`
  **入参**：`principal, leverage, durationHours, skuId, wallet[, k]`
  **出参**：

  ```json
  {
    "idempotencyKey": "string",
    "quote": {
      "wallet": "0x..",
      "inputHash": "0x..",
      "price": 180000000,
      "maxPayout": 200000000,
      "durationHours": 24,
      "quoteId": "0x..",
      "deadline": 1730793600,
      "chainId": 8453,
      "contractAddr": "0xPolicy",
      "skuId": 101,
      "exchangeId": "0x..",
      "accountHash": "0x.."
    },
    "quoteSig": "0x..",
    "payment": {
      "chainId": "0x2105",
      "usdcContract": "0x8335...2913",
      "spenderOrVault": "0xPolicy"
    }
  }
  ```

* `/api/v1/voucher/issue`
  **入参**：`wallet, skuId[, exchangeId, accountHash]`
  **出参**：

  ```json
  {
    "voucher": { "wallet":"0x..", "skuId":101, "exchangeId":"0x..", "accountHash":"0x..", "deadline":1730793900, "nonce":1, "voucherId":"0x.." },
    "voucherSig": "0x..",
    "verifyHash": "0x000...000"
  }
  ```

---

# 10) 接下来你要做的两件事

1. 把这三文件（`lib/eip712.ts`、`lib/quote.ts`、两个路由）放进 `us-backend`，在 `index.ts` 引入路由，启动后端。
2. 前端 `.env` 里先放占位 `VITE_POLICY_ADDR=0x0`，等你主网部署拿到地址，换成真实地址即可全链路联调。

需要我把这套改动打成 **git patch**（按你项目目录结构）发你吗？你也可以直接贴你的 `us-backend` 目录结构，我按它生成“可直接 `git apply` 的补丁”。
