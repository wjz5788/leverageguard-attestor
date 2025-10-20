# LiqPass v2 根链发布总览

## 目录结构

- `src/scripts/okx_liquidation_verifier.py` — 统一 keccak256、JCS、批次元数据、EIP-712 绑定哈希。
- `data/evidence/<ordId>/` — 运行脚本后生成的 `order.json / fills.json / bills.json / records.json / merkle.json / summary.json / meta.json`。
- `contracts/LeverageGuardV2.sol`（后续更新） — 新增 `parentRoot`、`batchId`、`metaCid` 字段的事件。
- `docs/` — 本文件 + 现有流程说明，新增 v2 差异与操作手册。

## 合约事件/函数建议

```solidity
event Attested(
    bytes32 indexed root,
    bytes32 indexed parentRoot,
    bytes32 indexed batchId,
    uint256 count,
    string metaCid
);

event Revoked(bytes32 indexed root, string reasonCid);

function attest(bytes32 root, bytes32 parentRoot, bytes32 batchId, uint256 count, string calldata metaCid) external;
```

保留旧逻辑时，可以仅扩展事件字段，函数签名按需兼容。

## 前后端改动清单

- **后端脚本**
  - 安装 `eth-hash` 或 `pysha3`，确保 keccak256 可用。
  - 新 CLI 参数：`--wallet --bind-sig/--bind-hash --batch-id --parent-root --meta-cid`。
  - `records.json`（JCS + salt）→ `merkle.json`（keccak 根 + parentRoot + batchId）。
- **链上发布器**
  - 读取 `summary.json` / `meta.json`，自动带上 `parentRoot`、`batchId`、`metaCid`。
  - 上链后生成 `attest_receipt.json`，写入批次目录。
- **前端校验页**
  - 连接钱包时签 `LiqPassBind` TypedData，回填 `--bind-sig`。
  - 本地复算：JCS → keccak → Merkle → 对比链上根。
  - 展示根链（`parentRoot` 链）与撤销事件。
- **索引/审计**
  - 索引 `Attested`/`Revoked`，输出连续根链与批次摘要（`metaCid`）。
  - 对接申诉 API，按批次调用 CEX 只读接口复核。

## 常用命令

```bash
# 1) 生成证据与根
python3 src/scripts/okx_liquidation_verifier.py \
  --ordId <ORD_ID> --instId BTC-USDT-SWAP \
  --wallet 0xWallet --bind-sig 0xSignature \
  --parent-root 0xPrevRoot --meta-cid ipfs://cid \
  --out ./data/evidence/<ORD_ID>

# 2) 单独重算 Merkle
python3 src/scripts/okx_liquidation_verifier.py --inDir ./data/evidence/<ORD_ID> --only-merkle

# 3) 发布批次
node scripts/attest.js --root <root> --parent-root <prev> --batch-id <batch> --meta-cid <cid>
```

> 默认仅公开 `merkle.json`、`summary.json`、`attest_receipt.json` 等摘要文件；原始 `order/fills/bills/records.json` 保持离线或授权访问。
