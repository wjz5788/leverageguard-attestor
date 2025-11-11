---
id: claims-evidence
title: 理赔与证据（Claims & Evidence）
sidebar_position: 2
---

### 证据来源与校验
- 读取交易所订单（只读 API），校验：订单号后 4 位、方向、交易对、数量*价格闭合、时间偏差等。
- 生成「证明片段」与可审计哈希（如 keccak256 摘要）。

### 赔付触发
- 达成爆仓/强平条件，或达到产品的赔付判定规则，即可发起赔付。
- 前端展示：`eligible: true/false` 与 `reasons[]`。

### 上链与可审计性
- 赔付由合约 `claimPayout` 触发，交易哈希可在 BaseScan 查询。
- 证据的 Merkle Root 与摘要会记录到链上事件或透明度页。