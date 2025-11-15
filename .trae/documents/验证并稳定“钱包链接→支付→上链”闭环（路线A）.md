## 现状核查
- 前端钱包连接：`connectAndEnsureBase()` 使用 MetaMask，强制切到 Base 主网（8453），已符合预期。
- USDC 额度与支付：`payPolicy(amountUSDC)` 执行 USDC `approve`（不足则发起）→ `checkout.buyPolicy(orderId, amount6d, quoteHash)`。
- quoteHash 取值：优先用 `VITE_CHECKOUT_QUOTE_HASH`，若未配置才回退调用后端 `/pricing/quote-hash`。这与“路线A：预注册白名单 + 前端常量”一致。
- 需满足链上条件：`VITE_CHECKOUT_QUOTE_HASH` 必须已由合约 owner 在链上 `registerQuoteHash` 并未过期；`CHECKOUT_CONTRACT_ADDRESS` 与前端使用一致；钱包在 Base 主网；USDC 余额与 gas 足够。

## 验证计划（不改代码，只验证）
### 1. 钱包链接
- 在页面点击“连接钱包”，确认 MetaMask弹窗出现。
- 检查切链：若当前非 Base 主网，MetaMask提示切换到 Base；确认后前端不再报“请先切换到 Base 主网”。

### 2. USDC 余额与额度
- 在 MetaMask查看 USDC 余额（或在 BaseScan钱包页查余额）。
- 点击“立即购买”：如额度不足，MetaMask应先弹出 `approve` 交易；确认后进入 `buyPolicy` 交易。

### 3. 支付与上链
- 观察第二个 MetaMask弹窗：`checkout.buyPolicy` 交易；确认后返回交易哈希。
- 在 BaseScan 查看交易详情，确认状态 `Success`，并验证合约事件：若合约实现 `PremiumPaid`，在 Logs 里应出现对应事件（或合约的付款事件名称）。

### 4. quoteHash 白名单验证
- 在 BaseScan 打开合约的 `Write Contract`（或使用你熟悉的工具），检查 `registerQuoteHash` 已调用成功，且 `expiryTime` 未到期。
- 如未注册或已过期，会在 `buyPolicy` 报错（常见：invalid quote / revert）；需要合约 owner 重新 `registerQuoteHash(QUOTE_HASH, expiry)`。

### 5. 接口与订单（可选）
- 订单创建与查询通过轻量 API Key：在浏览器控制台设置：`localStorage.setItem('api_key','<ADMIN_API_KEY>')`。
- 支付后调用 `POST /api/v1/orders` 记录账本；`GET /api/v1/orders` 验证持久化显示（重启后仍能读取）。

## 可能的失败点与处理
- MetaMask未装/未授权：前端会报“未检测到钱包/请先连接钱包”；安装或授权后重试。
- 未切换到 Base 主网：弹窗未确认导致前端报“请先切换到 Base 主网”；确认弹窗后重试。
- USDC额度不足：需先 `approve`；MetaMask两笔交易是正常流程。
- quoteHash未注册或过期：`buyPolicy` 直接失败；合约 owner 重新注册：`registerQuoteHash(QUOTE_HASH, expiry)`。
- 合约地址不一致：前端 `CHECKOUT_CONTRACT_ADDRESS` 必须与链上真实合约一致，否则交易失败。
- gas不足：钱包需有少量 ETH（Base 主网）用于交易费。

## 你需要提供/确认
- `VITE_CHECKOUT_QUOTE_HASH` 已在链上注册（提供交易哈希或确认注册状态）。
- `VITE_CHECKOUT_CONTRACT_ADDRESS` 与真实部署一致（提供地址确认）。
- 钱包在 Base 主网并有足够 USDC 与 ETH（用于 gas）。

## 通过后下一步（可选增强）
- 我可在支付完成后自动调用订单创建接口，带上 `X-API-Key`，把订单写入持久化账本；这样“订单管理”页面可立即显示记录。
- 如果你希望回到完整“动态报价 + 双签”路径，再补充后端 `voucher/issue` 与统一 typed-data 域/结构，逐步切换到严格校验版。