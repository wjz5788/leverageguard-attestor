// 强制把 premium 改为 0.01 USDC（= 10,000 microUSDC），并本地 stub 凭证签发
// 仅开发/联调用途：挂在 main.tsx 中按 ?force01 条件启用

const FORCE_PREMIUM = 10_000; // micro USDC

// 你的最新 CheckoutUSDC/Policy 合约地址（Base 主网）
const CHECKOUT_ADDR = "0xc423c34b57730ba87fb74b99180663913a345d68";
// Base USDC 正式地址
const USDC_BASE = "0x833589fCD6EDB6E08f4c7C32D4f71B54bDa02913";

let lastQuote: any = null;

type FetchInput = RequestInfo | URL;

const _fetch = window.fetch.bind(window);

function toUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

window.fetch = (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
  const url = toUrl(input);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();

  // 1) 拦截报价响应：把 quote.price 改成 10,000，并扁平化为顶层 { quote, quoteSig, idempotencyKey }
  if (url.includes('/api/v1/pricing/quote') && method === 'POST') {
    const res = await _fetch(input, init);
    try {
      const cloned = res.clone();
      const json = await cloned.json();

      // 兼容不同返回：{data:{quote,quoteSig,idempotencyKey}} 或 {quote,quoteSig,idempotencyKey}
      const d = json?.data && (json.data.quote || json.data.quoteSig) ? json.data : json;
      const quote = d?.quote ? { ...d.quote } : null;
      const quoteSig = d?.quoteSig ?? json?.quoteSig;
      const idempotencyKey = d?.idempotencyKey ?? json?.idempotencyKey;

      if (!quote) return res; // 解析失败则透传

      // 记录原始 quote，构造一个仅 price 被强制的小改版
      lastQuote = { ...quote, price: String(FORCE_PREMIUM) };

      // 保守起见：不强改合约地址，除非缺失
      if (!lastQuote.contractAddr) lastQuote.contractAddr = CHECKOUT_ADDR;

      const patched = {
        quote: lastQuote,
        quoteSig: quoteSig ?? '0x', // 占位
        idempotencyKey: idempotencyKey ?? `debug-${Date.now()}`,
        debugForced: true,
      };

      return new Response(JSON.stringify(patched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.warn('[fetchForcePremium] failed to patch quote:', e);
      return res;
    }
  }

  // 2) 拦截凭证创建：直接回 200（避免后端因签名与价格不一致而拒绝）
  if (url.includes('/api/v1/voucher/issue') && method === 'POST') {
    const stub = {
      voucher: {
        wallet: lastQuote?.wallet ?? '0x0000000000000000000000000000000000000000',
        skuId: lastQuote?.skuId ?? 101,
        exchangeId: lastQuote?.exchangeId ?? '0x6f6b785f000000000000000000000000000000000000000000000000000000', // "okx"
        accountHash: lastQuote?.accountHash ?? '0x' + '00'.repeat(32),
        voucherId: `debug-${Date.now()}`,
      },
      voucherSig: '0x', // 占位签名
      verifyHash: lastQuote?.inputHash ?? '0x' + '00'.repeat(32),
      debugStub: true,
    };

    return new Response(JSON.stringify(stub), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return _fetch(input, init);
}) as any;

