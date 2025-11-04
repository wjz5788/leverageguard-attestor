---
id: claims-evidence
title: Claims & Evidence (理赔与证据)
sidebar_position: 2
---

### Evidence Sources and Verification
- Read exchange orders (read-only API), verify: last 4 digits of order number, direction, trading pair, quantity*price closure, time deviation, etc.
- Generate "proof fragments" and auditable hashes (such as keccak256 summary).

### Payout Trigger
- When liquidation/forced liquidation conditions are met, or when the product's payout determination rules are reached, a payout can be initiated.
- Frontend display: `eligible: true/false` and `reasons[]`.

### On-chain and Auditability
- Payout is triggered by the contract `claimPayout`, transaction hash can be queried on BaseScan.
- The Merkle Root and summary of evidence will be recorded in on-chain events or transparency pages.