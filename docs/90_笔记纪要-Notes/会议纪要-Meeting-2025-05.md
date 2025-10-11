太棒了，既然你选了**路线 A（Attestor 仅存证）\**并用 \*\*wjz5788.com\*\*，下面是一套\**一键可跑的最小仓库代码**（Solidity + Hardhat + CLI 脚本 + Merkle 根计算脚本）。你把这些文件按结构放到服务器上，装依赖、配好 `.env`，就能**部署合约**并**提交第一条主网存证事件**。

------

## 目录结构

```
leverageguard-attestor/
├─ contracts/
│  └─ ClaimAttestor.sol
├─ scripts/
│  ├─ deploy.js
│  └─ attest.js
├─ utils/
│  └─ evidence_merkle.py
├─ .env.example
├─ hardhat.config.js
├─ package.json
└─ README_RUN.txt   # 运行指令（下面也写了）
```

------

## 1) 合约：`contracts/ClaimAttestor.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title ClaimAttestor - Anchor evidence Merkle roots on-chain
/// @notice MVP: anyone can attest (root, uri). Keep it simple & safe.
contract ClaimAttestor {
    event Attested(address indexed caller, bytes32 indexed root, string uri, uint256 timestamp);

    mapping(bytes32 => bool) public seen; // root -> already attested

    function attest(bytes32 root, string calldata uri) external {
        require(root != bytes32(0), "root empty");
        require(bytes(uri).length > 0, "uri empty");
        require(!seen[root], "root exists");
        seen[root] = true;
        emit Attested(msg.sender, root, uri, block.timestamp);
    }

    function has(bytes32 root) external view returns (bool) {
        return seen[root];
    }
}
```

------

## 2) Hardhat 配置：`hardhat.config.js`

```js
require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const { PRIVATE_KEY, BASE_RPC_URL, BASE_SEPOLIA_RPC_URL } = process.env;

module.exports = {
  solidity: {
    version: "0.8.21",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    // Base Mainnet
    base: {
      chainId: 8453,
      url: BASE_RPC_URL || "https://mainnet.base.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    // Base Sepolia Testnet
    baseSepolia: {
      chainId: 84532,
      url: BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
```

------

## 3) 部署脚本：`scripts/deploy.js`

```js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address, "Network:", hre.network.name);

  const F = await hre.ethers.getContractFactory("ClaimAttestor");
  const c = await F.deploy();
  await c.deployed();

  console.log("ClaimAttestor deployed at:", c.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

------

## 4) 提交存证脚本：`scripts/attest.js`

```js
const hre = require("hardhat");
const minimist = require("minimist");

async function main() {
  const argv = minimist(process.argv.slice(2));
  const addr = argv.addr || process.env.ATTESTOR_ADDRESS;
  const root = argv.root; // e.g. 0xabc...32bytes
  const uri  = argv.uri;  // e.g. https://wjz5788.com/files/xxx.json

  if (!addr || !root || !uri) {
    throw new Error("Usage: hardhat run scripts/attest.js --network <base|baseSepolia> --addr <contract> --root <0x..32bytes> --uri <https://...>");
  }

  const [signer] = await hre.ethers.getSigners();
  const abi = [
    "function attest(bytes32 root,string uri) external",
    "event Attested(address indexed caller, bytes32 indexed root, string uri, uint256 timestamp)"
  ];
  const c = new hre.ethers.Contract(addr, abi, signer);

  console.log(`Attesting on ${hre.network.name}...`);
  const tx = await c.attest(root, uri, { gasLimit: 200000 });
  console.log("Tx sent:", tx.hash);
  const rc = await tx.wait();
  console.log("Confirmed in block:", rc.blockNumber);

  const ev = rc.events?.find(e => e.event === "Attested");
  if (ev) {
    console.log("Attested event:", {
      caller: ev.args.caller,
      root: ev.args.root,
      uri: ev.args.uri,
      timestamp: ev.args.timestamp.toString()
    });
  } else {
    console.log("Event not parsed; check the explorer.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

------

## 5) Merkle 根计算脚本（Python）：`utils/evidence_merkle.py`

> 把证据包里的多个 JSON 文件做 SHA-256，再做 Merkle，输出 `merkle.json` 并打印 `0x` 前缀的根值（供链上使用）。

```python
import argparse, json, os, hashlib
from pathlib import Path

def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def merkle_root(hex_hashes):
    if not hex_hashes:
        return None
    layer = [bytes.fromhex(h) for h in hex_hashes]
    if len(layer) == 1:
        return "0x" + layer[0].hex()
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i] if i + 1 == len(layer) else layer[i + 1]
            nxt.append(hashlib.sha256(left + right).digest())
        layer = nxt
    return "0x" + layer[0].hex()

def main():
    ap = argparse.ArgumentParser(description="Compute Merkle root for an evidence folder")
    ap.add_argument("--in_dir", required=True, help="Folder containing evidence JSON files")
    ap.add_argument("--out_file", required=True, help="Where to write merkle.json (summary)")
    args = ap.parse_args()

    in_dir = Path(args.in_dir)
    assert in_dir.is_dir(), f"Input folder not found: {in_dir}"

    files = sorted([p for p in in_dir.glob("*.json") if p.name != "merkle.json"])
    hashes = []
    manifest = []
    for p in files:
        raw = p.read_bytes()
        h = sha256_hex(raw)
        hashes.append(h)
        manifest.append({"file": p.name, "sha256": h})

    root = merkle_root(hashes)
    out = {"files": manifest, "merkleRoot": root}
    Path(args.out_file).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_file, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(root)

if __name__ == "__main__":
    main()
```

------

## 6) 环境变量示例：`.env.example`

```env
# EVM
PRIVATE_KEY=your_private_key_hex_without_0x

# RPC (可用默认，不填也能跑)
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 合约地址（部署后填）
ATTESTOR_ADDRESS=
```

------

## 7) Node 配置：`package.json`

```json
{
  "name": "leverageguard-attestor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "clean": "rm -rf cache artifacts",
    "compile": "hardhat compile",
    "deploy:base": "hardhat run scripts/deploy.js --network base",
    "deploy:baseSepolia": "hardhat run scripts/deploy.js --network baseSepolia",
    "attest:base": "hardhat run scripts/attest.js --network base",
    "attest:baseSepolia": "hardhat run scripts/attest.js --network baseSepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-ethers": "^3.0.0",
    "dotenv": "^16.4.5",
    "ethers": "^5.7.2",
    "hardhat": "^2.22.10",
    "minimist": "^1.2.8"
  }
}
```

------

## 8) 运行说明：`README_RUN.txt`

```
# 基础依赖
# Ubuntu:
#   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
#   sudo apt-get install -y nodejs python3-pip
#   npm i -g pnpm  # 可选

# 进入项目
cd leverageguard-attestor
npm i

# 配环境变量
cp .env.example .env
# 用你的私钥填 PRIVATE_KEY（建议新地址，小额演示），如要自定义 RPC 也填上

# 编译
npm run compile

# （可选）先部署到 Base Sepolia 测试网
npm run deploy:baseSepolia
# 输出的合约地址填回 .env 的 ATTESTOR_ADDRESS，或在提交时用 --addr 参数传入

# 部署到 Base 主网（小额演示账号）
npm run deploy:base
# 记录输出地址，建议填入 .env 的 ATTESTOR_ADDRESS=0x....

# 计算 Merkle 根（示例）
# 假设你的证据包文件在 /var/www/evidence/ORDER123/ 下（若暂无，可先放几份示例 JSON）
python3 utils/evidence_merkle.py \
  --in_dir /var/www/evidence/ORDER123 \
  --out_file /var/www/html/files/ORDER123_evidence_summary.json
# 终端会打印 0x 开头的 Merkle Root；把这个 root 与上面生成的 URL 作为参数提交存证：
# 例如 uri=https://wjz5788.com/files/ORDER123_evidence_summary.json

# 在 Base 主网提交存证（把 root/uri/addr 换成你的）
npx hardhat run scripts/attest.js --network base \
  --addr 0xYourAttestorAddress \
  --root 0xYourMerkleRoot32bytes \
  --uri https://wjz5788.com/files/ORDER123_evidence_summary.json

# 终端会输出交易哈希与事件参数；把链接贴到 README 与申请表。
```

------

### 接下来你要做的

1. 把这些文件放到你的 Ubuntu 服务器（`leverageguard-attestor/`）。
2. `npm i` → `npm run compile` → `npm run deploy:base`。
3. 用 Python 脚本对你的证据文件夹算一个 **Merkle Root**，摘要 JSON 放到 `https://wjz5788.com/files/...`。
4. 用 `scripts/attest.js` 提交主网存证（`--root` + `--uri`）。
5. 把**合约地址**与**第一条事件链接**发我，我就把之前的 README/视频/申请表模板替你填好，直接能提交。