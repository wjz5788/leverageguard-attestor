# LiqPass Chain Listener Kit (Base Mainnet)

适配你的合约 `0xc423c34b57730ba87fb74b99180663913a345d68` 的最小可用监听回填脚手架：
- 监听合约事件（若提供 ABI 可解析 `PremiumPaid`），并校验同一交易中 **USDC -> TREASURY** 的 `Transfer`。
- 写入 `premium_paid`，并按 `orderId` 幂等回填到 `orders`（无 `orderId` 的进 `unmatched_payments`）。

## 快速开始
1. 安装依赖：`npm i`
2. 复制环境变量：`cp .env.example .env`
3. 初始化数据库：
   ```bash
   sqlite3 ./db/liqpass.sqlite < db/migrations/001_events.sql
   sqlite3 ./db/liqpass.sqlite < db/migrations/002_orders.sql
   sqlite3 ./db/migrations/003_unmatched_payments.sql
   ```
4. （可选）把 Basescan 的 **Contract ABI** 复制到 `src/abi/CheckoutUSDC.json`，可精确解析 `PremiumPaid` 的参数。
5. 启动监听：`npm run watch:checkout`
