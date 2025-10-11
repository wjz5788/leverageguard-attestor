# LeverageGuard — CEX Liquidation Evidence Attestor on Base

**一句话**：从 OKX 获取订单/成交/账单，生成链下证据包，计算 **Merkle Root**，并把 Root 上链到 **Base**，形成“链下可核验、链上可追溯”的最小闭环（MVP：Attestor 存证）。

## Links
- Demo: https://wjz5788.com/attest
- Evidence summary (latest): https://wjz5788.com/files/2940071038556348417_merkle.json
- Evidence summary (sample): https://wjz5788.com/files/2938812509925187584_nonliq_merkle.json
- Contract (Base mainnet): `0x9552b58d323993f84d01e3744f175f47a9462f94` · Explorer: https://basescan.org/address/0x9552b58d323993f84d01e3744f175f47a9462f94
- Latest attestation tx: https://basescan.org/tx/REPLACE_WITH_YOUR_TX
- 1-min video: https://wjz5788.com/demo.mp4

## What & Why
- **What**：链外证据包 + 链上 Root 存证（隐私友好、可审计）。
- **Why**：为高杠杆 BTC/稳定币合约的理赔/仲裁提供可信基础，减少争议与信息不对称。

## How it works
1) 仅使用 **只读 + IP 白名单** 的 OKX API 获取 `orders/fills/bills`  
2) 对证据文件逐个 SHA-256，构建 **Merkle Root**  
3) 调用合约 `attest(root, uri)`，将 Root 与摘要链接上链  
4) 任何人可下载摘要并复算 Root，对照 BaseScan 事件进行核验

## Evidence bundle format
- 原始：`order.json / fills.json / bills.json / meta.json`（**不公开**）
- 摘要：`merkle.json`（`files[]` + `sha256` + `merkleRoot`）和汇总 CSV/JSON（**公开**）

## Roadmap
- **M0（当前）**：Attestor 存证（主网≥1条）；演示页 + 摘要下载
- **M1**：私有 WS 清算标记 + 自动判定；最小赔付闭环（Pause/日限额）
- **M2**：TLSNotary / Chainlink Functions 去信任取数；多交易所（Binance）

## Security & Privacy
- OKX **只读** Key + **IP 白名单**；密钥走环境变量（见 `.env.example`）
- 公开仓库与网站仅提供**摘要/Root**；原始响应保存在受控私有存储
- 合约仅做存证，无资金风险；后续赔付合约默认开启 Pause/日限额

## License
MIT — see [LICENSE](./LICENSE)

## Contact
Site: https://wjz5788.com · Email: contact@wjz5788.com
