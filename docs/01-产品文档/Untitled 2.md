 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/apps/chain-listener/src/watchers/checkoutUSDC.mjs b/apps/chain-listener/src/watchers/checkoutUSDC.mjs
index 1f6b2b05672018056304b94b10bb07fd2baf217f..c92b52be70635a8538135bfc83ef65d26ea366f4 100644
--- a/apps/chain-listener/src/watchers/checkoutUSDC.mjs
+++ b/apps/chain-listener/src/watchers/checkoutUSDC.mjs
@@ -62,56 +62,57 @@ try {
   console.warn('ABI not found at src/abi/CheckoutUSDC.json. Will store raw logs and rely on USDC Transfer verification.');
 }
 
 const provider = new JsonRpcProvider(RPC);
 const svc = createOrderService(DB_PATH);
 
 const ERC20_IFACE = new Interface([
   'event Transfer(address indexed from,address indexed to,uint256 value)'
 ]);
 const TRANSFER_TOPIC0 = id('Transfer(address,address,uint256)');
 
 function decodePremiumPaid(log) {
   if (!iface) {
     return {
       orderId: null, payer: null, token: null, treasury: null, amount: null,
       raw: JSON.stringify({ topics: log.topics, data: log.data })
     };
   }
   try {
     const parsed = iface.parseLog({ topics: log.topics, data: log.data });
     if (!parsed || parsed.name !== 'PremiumPaid') {
       return null;
     }
     const args = parsed.args;
     const orderId = (args.orderId ?? args[0])?.toString?.() ?? null;
-    const payer = (args.payer ?? args[1] ?? '')?.toString?.().toLowerCase() ?? null;
+    const payer = (args.buyer ?? args[1] ?? '')?.toString?.().toLowerCase() ?? null;
     const amount = (args.amount ?? args[2]) ? (args.amount ?? args[2]).toString() : null;
-    const token = (args.token ?? args[3] ?? '')?.toString?.().toLowerCase() ?? null;
-    const treasury = (args.treasury ?? args[4] ?? '')?.toString?.().toLowerCase() ?? null;
+    const token = (args.token ?? args[4] ?? '')?.toString?.().toLowerCase() ?? null;
+    const treasury = (args.treasury ?? args[5] ?? '')?.toString?.().toLowerCase() ?? null;
+    const chainId = (args.chainId ?? args[6]) ? (args.chainId ?? args[6]).toString() : null;
     return {
-      orderId, payer, amount, token, treasury,
+      orderId, payer, amount, token, treasury, chainId,
       raw: JSON.stringify(args, (_, v) => typeof v === 'bigint' ? v.toString() : v)
     };
   } catch {
     return null;
   }
 }
 
 async function verifyUSDCTransfer(txHash, payer, amountStr) {
   try {
     const receipt = await provider.getTransactionReceipt(txHash);
     const tlog = receipt.logs.find(
       (l) => l.address.toLowerCase() === USDC && l.topics[0] === TRANSFER_TOPIC0
     );
     if (!tlog) return { ok: false, reason: 'no USDC Transfer in tx' };
     const { args } = ERC20_IFACE.parseLog(tlog);
     const from = args.from.toLowerCase();
     const to = args.to.toLowerCase();
     const value = args.value;
     const amountOk = amountStr ? (value === BigInt(amountStr)) : true;
     const payerOk = payer ? (from === payer.toLowerCase()) : true;
     const treasuryOk = to === TREASURY;
     return { ok: amountOk && payerOk && treasuryOk, from, to, value };
   } catch (e) {
     return { ok: false, reason: e.message };
   }
 
EOF
)