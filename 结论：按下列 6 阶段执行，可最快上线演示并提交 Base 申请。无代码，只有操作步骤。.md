结论：按下列 6 阶段执行，可最快上线演示并提交 Base 申请。无代码，只有操作步骤。

一、仓库与权限

1. 保护分支

- `main` 与 `dev` 各建 Ruleset：仅 PR、线性历史、签名提交、至少 1 人审、必须通过状态检查。
- Bypass 列表留空。
- 仓库可见性按需设为公开；副账号加入同一 Team，权限=Write。

二、环境与机密

2) 创建 Environment `demo-jp`

- Secrets：
  - `OKX_API_KEY/SECRET/PASSPHRASE`（只读子账户，白名单 JP 出口 IP）
  - `BINANCE_API_KEY/SECRET`（只读子账户，白名单 JP 出口 IP）
  - `BASE_RPC_URL`，`ATTEST_CONTRACT=0x9552…f94`，`ATTEST_PRIVKEY`（测试私钥）
  - `ENABLE_OKX=1`，`ENABLE_BINANCE=1`，`ENABLE_ATTEST=1`，`ACTIVE_FETCH=false`，`TZ=UTC`
- 环境保护：仅允许带标签 `demo-jp` 的 Runner 运行。

三、服务器与 Runner

3) JP 服务器基线

- 时区 UTC，NTP 同步，防火墙仅放行 HTTP/HTTPS。
- 注册自托管 GitHub Runner，标签 `self-hosted,linux,x64,demo-jp`。
- 进程守护与健康检查目标：`/api/ping` 200。
- 将服务器出口 IP 加入 OKX 与 Binance API 白名单。

四、CI / 发布策略

4) 两条 Workflow（最小集）

- PR 检查：对任意 PR 触发 build/lint/test。未通过不得合并。
- 部署：合并到 `main` → 选择 Environment `demo-jp` → 在 JP 机拉取并重启服务。仅暴露四个端点：
   `/api/ping`、`/api/verify`、`/api/evidence/{ordIdHash}`、`/api/attest`。

五、PR 执行序列

5) PR-A 后端并入 Binance

- 将你已完成的 Binance 验证逻辑合到 `dev`，仅白名单四个交易对：
   OKX `BTC-USDT-SWAP`、`BTC-USDC-SWAP`；Binance `BTCUSDT`、`BTCUSDC`。
- 合并到 `dev` 后自测通过，再合到 `main` 触发 JP 部署。

1. PR-B 前端最小改

- Demo 页元素：交易所下拉、交易对下拉、订单号输入、按钮“验证”。
- 结果区：显示验证摘要、哈希、时间窗、强平/ADL 标识；提供“查看证据包”链接到 `/api/evidence/*`。
- 仅允许白名单交易对。错误统一提示。

1. PR-C 存证按钮

- Demo 验证通过后显示“上链存证”，调用 `/api/attest`（使用 `demo-jp` 的测试私钥）。
- 展示 Tx 哈希与区块浏览器链接。失败仅回显错误码。

1. PR-D 文档与证明物

- 更新 `README`：一句话简介、三步体验、合约地址、API 示例、Demo 链接、路线图三点。
- 建 `docs/proofs/`：放 1 个 OKX 单 + 1 个 Binance 单的 `/api/verify` 原始 JSON 与页面截图；放一次 `/api/attest` 的 Tx 截图与链接。
- 在页头放“Help/Proofs”链接。

六、自测与提交

9) 自测用例

- `/api/ping` 200。
- `/api/verify`：OKX 与 Binance 各 1 单返回成功；非白名单交易对返回 400。
- `/api/evidence/{ordIdHash}`：可回查完整证据包。
- `/api/attest`：链上出现新事件，浏览器可查。

1. 提交 Base 申请所需链接

- GitHub 仓库 `README`（含 Demo 说明与路线图）。
- Demo 三个可达端点：`/ping`、`/verify`、`/attest`。
- 合约地址与最新存证 Tx 链接。
- `docs/proofs/` 目录的 JSON 与截图。
- 申请摘要两段：中文 ≤120 字，英文 120–150 词；强调只读 API、无资金托管、可审计证据。

验收清单（打钩后再申请）

-  `main` 与 `dev` 均受 Ruleset 保护
-  `demo-jp` Environment 与 Secrets 完整
-  JP Runner 标签正确并能触发部署
-  OKX+Binance 各 1 单验证通过且证据可回查
-  至少 1 次存证上链，Tx 可查
-  README 与 `docs/proofs/` 完整对外可读

按此顺序执行即可最短上线并提交。