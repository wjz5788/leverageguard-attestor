明白。你还没部署，我们先把**产品页的 3 项改动**落地到你的代码里（不影响 UI）：

* ① 在顶部加入常量 & 最小 ABI（`POLICY_ADDR`、USDC 地址、ERC20/Policy ABI）
* ② **替换 `handleBuy`**：改为 `approve → buyPolicy` 链上扣费 + 以事件为准创建订单
* ③ 后端对接：改为请求 `/api/v1/pricing/quote` 和 `/api/v1/voucher/issue`，获取 EIP-712 签名

下面是**可直接应用的 Git 补丁**（和你之前一样：`git apply --3way` 即可）。默认文件路径：`us-frontend/src/pages/Products.tsx`。如果你的路径不同，把 header 改一下就行。

```diff
diff --git a/us-frontend/src/pages/Products.tsx b/us-frontend/src/pages/Products.tsx
index 1111111..2222222 100644
--- a/us-frontend/src/pages/Products.tsx
+++ b/us-frontend/src/pages/Products.tsx
@@ -1,10 +1,24 @@
-import React, { useEffect, useMemo, useState } from 'react';
+import React, { useEffect, useMemo, useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { Dictionary } from '../types';
 import { Card } from '../components/ui/Card';
 import { Button } from '../components/ui/Button';
 import { useWallet } from '../contexts/WalletContext';
 import { useToast } from '../contexts/ToastContext';
+// 新增：ethers（v6）
+import { ethers } from 'ethers';
+
+// === 新增：常量 & 最小 ABI（① 顶部常量/ABI） ===
+// 建议用环境变量：VITE_POLICY_ADDR；没有就占位 0x0（会在下单时报错提醒）
+const POLICY_ADDR: string =
+  (import.meta as any).env?.VITE_POLICY_ADDR ||
+  '0x0000000000000000000000000000000000000000';
+const USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC(6d)
+const ERC20_ABI = [
+  'function allowance(address owner,address spender) view returns (uint256)',
+  'function approve(address spender,uint256 amount) returns (bool)'
+];
+const POLICY_ABI = [
+  'function buyPolicy((address wallet,uint32 skuId,bytes32 exchangeId,bytes32 accountHash,uint256 deadline,uint256 nonce,bytes32 voucherId),bytes,(address wallet,bytes32 inputHash,uint96 price,uint96 maxPayout,uint32 durationHours,bytes32 quoteId,uint256 deadline,uint256 chainId,address contractAddr),bytes,uint32 skuId,uint96 notional,bytes32 verifyHash) returns (uint256)',
+  'event PolicyPurchased(uint256 indexed policyId,address indexed buyer,uint32 skuId,uint96 price,bytes32 quoteId,bytes32 inputHash,bytes32 verifyHash)'
+];
 
 // 公共函数
 const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
@@ -91,94 +105,151 @@ export const Products: React.FC<ProductsProps> = ({ t }) => {
   const { baseFee, fee, payout, feeAmt, payoutAmt, p } = useMemo(() => computeQuote(principal, lev, k), [principal, lev, k]);
   const [buying, setBuying] = useState(false);
 
-  const handleBuy = async () => {
-    if (!address) {
-      push({ title: '请先连接钱包' });
-      try { await connectWallet(); } catch {}
-      return;
-    }
-    setBuying(true);
-    try {
-      // 1) 预览报价，获取幂等键
-      const previewRes = await fetch('/api/v1/orders/preview', {
-        method: 'POST',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({
-          skuId: 'sku_24h_liq',
-          principal: p,
-          leverage: lev,
-          wallet: address
-        })
-      });
-      if (!previewRes.ok) {
-        const err = await previewRes.json().catch(() => ({}));
-        throw new Error(err?.message || `报价失败 ${previewRes.status}`);
-      }
-      const preview = await previewRes.json();
-      const quote = preview?.quote;
-      if (!quote?.idempotencyKey || !quote?.premiumUSDC) {
-        throw new Error('报价无效');
-      }
-
-      // 2) 确保网络为后端要求的链（Base 主网）
-      const payCfg = quote.payment || preview?.payment; // 兼容写法
-      const targetChainId: string = payCfg?.chainId || '0x2105';
-      if ((chainId || '').toLowerCase() !== String(targetChainId).toLowerCase()) {
-        await switchToBase(false);
-      }
-
-      // 3) 使用 USDC 合约进行转账到金库（上链）
-      const usdc = payCfg?.usdcContract || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
-      const vault = payCfg?.spenderOrVault;
-      if (!vault) throw new Error('支付金库地址缺失');
-
-      const toUnits = (val: string | number, decimals = 6) => {
-        const s = String(val);
-        const [i, f = ''] = s.split('.');
-        const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
-        return (BigInt(i || '0') * (10n ** BigInt(decimals))) + BigInt(frac || '0');
-      };
-      const amount = toUnits(quote.premiumUSDC, 6);
-
-      const methodSelector = '0xa9059cbb'; // transfer(address,uint256)
-      const pad32 = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
-      const encAddr = (addr: string) => pad32(addr.toLowerCase().replace(/^0x/, ''));
-      const encUint = (n: bigint) => pad32(n.toString(16));
-      const data = methodSelector + encAddr(vault) + encUint(amount);
-
-      const eth = (window as any).ethereum;
-      if (!eth) throw new Error('未检测到以太坊钱包');
-
-      const txHash: string = await eth.request({
-        method: 'eth_sendTransaction',
-        params: [{ from: address, to: usdc, data, value: '0x0' }]
-      });
-
-      // 可选：简易轮询确认上链
-      try {
-        for (let i = 0; i < 10; i++) {
-          const receipt = await eth.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
-          if (receipt && receipt.status) break;
-          await new Promise(r => setTimeout(r, 1200));
-        }
-      } catch {}
-
-      // 4) 创建订单（带上链交易哈希，标记已支付）
-      const createRes = await fetch('/api/v1/orders', {
-        method: 'POST',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({
-          skuId: 'sku_24h_liq',
-          principal: p,
-          leverage: lev,
-          wallet: address,
-          premiumUSDC: Number(quote.premiumUSDC),
-          idempotencyKey: quote.idempotencyKey,
-          paymentMethod: 'approve_transfer',
-          paymentTx: txHash
-        })
-      });
-      if (!createRes.ok) {
-        const err = await createRes.json().catch(() => ({}));
-        throw new Error(err?.message || `下单失败 ${createRes.status}`);
-      }
-      push({ title: '下单成功' });
-      navigate('/account/orders');
-    } catch (e: any) {
-      push({ title: e?.message || '下单失败' });
-    } finally {
-      setBuying(false);
-    }
-  };
+  // === 替换版 handleBuy（② 支付路径改为 approve→buyPolicy） ===
+  const handleBuy = async () => {
+    if (!address) {
+      push({ title: '请先连接钱包' });
+      try { await connectWallet(); } catch {}
+      return;
+    }
+    if (!POLICY_ADDR || POLICY_ADDR === '0x0000000000000000000000000000000000000000') {
+      push({ title: '缺少合约地址：请设置 VITE_POLICY_ADDR' });
+      return;
+    }
+    setBuying(true);
+    try {
+      // 0) 确保 Base 主网（0x2105）
+      if ((chainId || '').toLowerCase() !== '0x2105') {
+        await switchToBase(false);
+      }
+
+      // 1) 向后端要参数化报价（PRICER 出签）
+      const qRes = await fetch('/api/v1/pricing/quote', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({
+          principal: clamp(principal, MIN_P, MAX_P),
+          leverage: clamp(lev, MIN_L, MAX_L),
+          durationHours: 24,      // 你的产品页=24h；如做成滑块，请传真实值
+          skuId: 101,             // 或 900（区间护栏 SKU）
+          wallet: address
+        })
+      });
+      if (!qRes.ok) throw new Error('报价失败');
+      const q = await qRes.json();
+      const { quote, quoteSig, idempotencyKey } = q || {};
+      if (!quote?.price || !quoteSig) throw new Error('报价签名缺失');
+      if (String(quote.contractAddr).toLowerCase() !== POLICY_ADDR.toLowerCase()) {
+        throw new Error('合约路由不匹配');
+      }
+      const now = Math.floor(Date.now()/1000);
+      if (now > Number(quote.deadline)) throw new Error('报价已过期，请刷新');
+
+      // 2) 向后端要 Voucher（ATTESTOR 出签）
+      const vRes = await fetch('/api/v1/voucher/issue', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({
+          wallet: address,
+          skuId: quote.skuId ?? 101,
+          exchangeId: quote.exchangeId ?? '0x6f6b785f000000000000000000000000000000000000000000000000000000', // "okx" 占位
+          accountHash: quote.accountHash
+        })
+      });
+      if (!vRes.ok) throw new Error('资格凭证失败');
+      const v = await vRes.json();
+      const { voucher, voucherSig, verifyHash } = v || {};
+      if (!voucher || !voucherSig) throw new Error('Voucher 签名缺失');
+
+      // 3) allowance 不足则 approve
+      const provider = new ethers.BrowserProvider((window as any).ethereum);
+      const signer = await provider.getSigner();
+      const usdc = new ethers.Contract(USDC_ADDR, ERC20_ABI, signer);
+      const need = BigInt(quote.price); // 后端返回 6 位整数
+      const cur: bigint = await usdc.allowance(await signer.getAddress(), POLICY_ADDR);
+      if (cur < need) {
+        const txA = await usdc.approve(POLICY_ADDR, need);
+        await txA.wait();
+      }
+
+      // 4) 调合约 buyPolicy（链上扣费+铸 SBT）
+      const policy = new ethers.Contract(POLICY_ADDR, POLICY_ABI, signer);
+      const skuId = Number(quote.skuId ?? 101);
+      const notional = BigInt(Math.round(clamp(principal, MIN_P, MAX_P) * clamp(lev, MIN_L, MAX_L))) * 1_000_000n;
+      const _verifyHash = verifyHash ?? quote.inputHash;
+
+      const tx = await policy.buyPolicy(
+        voucher, voucherSig,
+        quote,   quoteSig,
+        skuId,   notional, _verifyHash
+      );
+      const rc = await tx.wait();
+
+      // 5) 从事件抓 policyId，再落订单（以链上为准）
+      let policyId: string | undefined;
+      try {
+        for (const l of rc.logs ?? []) {
+          const parsed = policy.interface.parseLog(l);
+          if (parsed?.name === 'PolicyPurchased') {
+            policyId = parsed?.args?.policyId?.toString();
+            break;
+          }
+        }
+      } catch {}
+      if (!policyId) throw new Error('链上未返回 policyId');
+
+      const createRes = await fetch('/api/v1/orders', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({
+          idempotencyKey,
+          policyId,
+          wallet: address,
+          principal: clamp(principal, MIN_P, MAX_P),
+          leverage: clamp(lev, MIN_L, MAX_L),
+          premiumUSDC_6d: String(need),
+          chain: 'base',
+          purchaseTx: tx.hash,
+          paymentMethod: 'buyPolicy'
+        })
+      });
+      if (!createRes.ok) throw new Error('创建订单失败');
+
+      push({ title: '投保成功' });
+      navigate('/account/orders');
+    } catch (e: any) {
+      push({ title: e?.message || '下单失败' });
+    } finally {
+      setBuying(false);
+    }
+  };
```

---

## 落地步骤

1. 安装依赖

```bash
cd us-frontend
npm i ethers@6
```

2. 设置环境变量（Vite）
   在 `us-frontend/.env`（或 `.env.local`）里加一行（先占位，等你部署完替换）：

```
VITE_POLICY_ADDR=0x0000000000000000000000000000000000000000
```

3. 应用补丁
   把上面的 diff 保存为 `patch.diff`，在项目根目录执行：

```bash
git apply --3way patch.diff
```

4. 后端两个接口需要按**最小契约（③）**返回字段：

* `/api/v1/pricing/quote` 返回 `{ idempotencyKey, quote{wallet,inputHash,price,maxPayout,durationHours,quoteId,deadline,chainId,contractAddr,skuId}, quoteSig }`
* `/api/v1/voucher/issue` 返回 `{ voucher{...}, voucherSig, verifyHash }`

> 先不部署也没关系：前端会因 `POLICY_ADDR=0x0` 直接提示“缺少合约地址”。等你主网部署后，把 `.env` 里的 `VITE_POLICY_ADDR` 换成真实地址即可跑通。

需要我把**后端这两个接口的最小实现（TypeScript/Express + EIP-712 签名）**也给你一份吗？我可以按你当前后端目录结构直接给可用的路由文件。
