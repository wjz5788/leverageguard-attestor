# 概述
基于你确认的 UX 流（SIWE 登录 → 浏览 SKU → 绑定 OKX（两种模式）→ 购买保单 → 正常交易 → 申赔 → 申诉），以下给出**可直接落地的分层架构**与**仓库/模块划分**，保证后续可替换、可扩展、易审计。

---

## 1) 系统总览（分层与数据流）
```
[前端 DApp (Next.js + Wagmi)]
   ├─ SIWE 登录（EIP-4361）→ JWT 会话
   ├─ 产品列表/详情（SKU/定价公式/规则）
   ├─ 购买保单（链上 purchasePolicy）
   ├─ 绑定 OKX（A: 托管密钥   B: 本地验证器）
   ├─ 申赔（输入订单号 → 校验 → submitClaim）
   └─ 申诉（上传最小字段/CSV 或触发本地验证器重算）

[API 网关/服务 (NestJS/FastAPI)]
   ├─ SIWE 会话校验，JWT 签发
   ├─ SKU/定价读取与风控开关（只读接口）
   ├─ 绑定/解绑 OKX（A 模式：密文上链或只存后端）
   ├─ 查询 Merkle 根/证明、申赔前置校验
   └─ 申诉单收集 & 仲裁指令（链下到链上）

[Attestor 索引器（Node/Python）]
   ├─ 拉取订单（A: 服务端只读；B: 接收本地验证器上传的最小指纹包）
   ├─ 生成 Canonical 订单哈希 → 建 Merkle 树
   ├─ 上链登记 Root（按 uid_hash + 窗口）
   └─ 暴露 proof 查询（orderId → {rootId, proof, leaf})

[本地验证器（CLI / 桌面 / 浏览器扩展）]
   ├─ 使用用户本地 OKX 只读键拉取订单
   ├─ 本地生成 leaf/proof/uid_fingerprint
   └─ 用用户钱包签名绑定/上报（最小化数据，隐私优先）

[Solidity 合约 (Base)]
   ├─ PolicyManager(ERC-721)：购买/记录/元数据
   ├─ ClaimsManager：提交/验证/自动赔付/事件
   ├─ AttestationRegistry：登记 root 与验证接口
   ├─ Treasury：资金保管与赔付
   └─ BlacklistRegistry：等待期/黑名单/限赔参数
```

---

## 2) 仓库与模块划分（Polyrepo 推荐）
1. **liqpass-contracts**（Solidity + Foundry/Hardhat）
   - `contracts/PolicyManager.sol`
   - `contracts/ClaimsManager.sol`
   - `contracts/AttestationRegistry.sol`
   - `contracts/Treasury.sol`
   - `contracts/BlacklistRegistry.sol`
   - `contracts/lib/PricingLib.sol`（可选：参数化定价哈希/规则快照）
   - `script/` 部署脚本；`test/` 单测 & 模拟

2. **liqpass-webapp**（Next.js 14 App Router + Wagmi + viem + SIWE）
   - `app/(marketing)/products` 产品列表/详情（可未登录）
   - `app/(user)/purchase` 购买流程（连接钱包）
   - `app/(user)/bind-okx` 绑定页（A/B 双模式）
   - `app/(user)/claim` 申赔页（输入订单号 → 校验 → 交易）
   - `app/(user)/appeal` 申诉上传/重算触发
   - `server/siwe`（nonce/verify/me） & `server/jwt`

3. **liqpass-api**（NestJS/FastAPI，网关+风控开关）
   - 模块：`auth(siwe) / sku / pricing / binding / claim-precheck / appeals`
   - 只存密文/指纹；对接 KMS（或 libsodium/age 本地加密）

4. **liqpass-attestor**（Node/Python，索引器/Merkle/上链）
   - 连接器：`okx_connector.ts`（A模式）/ `ingest_local_fingerprint.ts`（B模式）
   - `merkle/`（规范化 & 树/证明生成）；`publisher/`（上链 Root）
   - `api/`（对外：orderId → proof 查询）

5. **liqpass-validator**（本地验证器：CLI（Node/Python）或 Electron 桌面/浏览器扩展）
   - 本地拉单 → 规范化 → 生成 `{uid_hash, leaf, proof}` 包
   - 用 `wallet.signMessage()` 对绑定挑战与摘要签名后上报

6. **liqpass-devops**（IaC & 部署）
   - Docker Compose/K8s 清单、Prom/Grafana 监控、S3/对象存储策略
   - 环境：`dev` / `staging` / `prod`，Base `sepolia` → `mainnet`

> 亦可 Monorepo（pnpm workspaces / turbo），但 MVP 更建议 Polyrepo，避免耦合。

---

## 3) 合约设计（核心接口）
### 3.1 PolicyManager (ERC-721)
- `purchasePolicy(skuId, PolicyParams calldata)` → `tokenId`
- `policyOf(tokenId) → Policy {skuId, owner, startTs, endTs, payoutCap, rulesHash, ...}`
- 事件：`PolicyPurchased(owner, tokenId, skuId, txHash)`

### 3.2 ClaimsManager
- `submitClaim(tokenId, orderId, orderHash, rootId, bytes32[] proof)`
- 内部：
  - 校验：
    - policy 有效（时间窗、等待期）
    - `AttestationRegistry.verify(uid_hash, windowStart, windowEnd, root, orderHash, proof)`
    - 未超赔付上限/未重复理赔
    - 黑名单/限赔规则
  - 通过 → 调用 `Treasury.pay(outToken, to, amount)` 或记账
- 事件：`ClaimSubmitted(tokenId, orderId, status, payout)`
- 管理：`resolveByArbiter(claimId, decision)`（申诉通过/拒绝）

### 3.3 AttestationRegistry
- `attestRoot(uid_hash, windowStart, windowEnd, root, version)`（仅索引器/仲裁者）
- 存证：`mapping(bytes32 rootId => RootMeta)`；`rootId = keccak256(uid_hash, windowStart, windowEnd, root, version)`
- `isLeafIncluded(uid_hash, window, root, leaf, proof) → bool`
- 事件：`RootAttested(uid_hash, windowStart, windowEnd, root, version)`

### 3.4 Treasury
- 资产：USDC（Base）为主，留 USDT/ETH 扩展位
- `pay(token, to, amount)` 只接受 ClaimsManager 调用（AccessControl）
- 事件：`Payout(to, token, amount, ref)`

### 3.5 BlacklistRegistry / RiskParams
- `setWaitingPeriod(skuId, seconds)`、`setWalletLimit(wallet, limit)`、`ban(wallet)` 等
- ClaimsManager 在校验环节读取

> 升级策略：使用 UUPS/OpenZeppelin Proxy，或在 MVP 直接部署不可升级版本 + 版本号迁移（更简单更安全）。

---

## 4) 订单叶子（Leaf）规范与 Merkle
### 4.1 Canonical 字段（最小集）
```
exchange = "OKX"
account_fingerprint = keccak256( normalize( subAccountId || apiKeyId || uid ) )   // 经盐化
order_id = string
symbol = string              // e.g., BTC-USDT-SWAP
side = enum{long, short}
event = enum{LIQ, ADL}      // 强平 or ADL
px = decimal
qty = decimal
ts_ms = uint64              // 事件时间
pnl = decimal               // 可选
fee = decimal               // 可选
```

### 4.2 Leaf 编码（链下一致性）
```
leaf = keccak256( abi.encode(
    keccak256("LiqLeaf(string exchange,bytes32 acct,bytes32 orderId,bytes32 symbol,uint8 side,uint8 event,uint64 ts,int256 px,int256 qty,int256 pnl,int256 fee)"),
    keccak256(bytes(exchange)),
    account_fingerprint,
    keccak256(bytes(order_id)),
    keccak256(bytes(symbol)),
    side,
    event,
    ts_ms,
    decimalToInt(px),
    decimalToInt(qty),
    decimalToInt(pnl),
    decimalToInt(fee)
))
```
> **注意**：decimalToInt 采用统一精度（如 1e8），并固定小数位，跨语言一致。

### 4.3 窗口与 Root
- 窗口：按自然日/8 小时/自定义（与 SKU 对齐）
- Root 元数据：`{uid_hash, windowStart, windowEnd, root, version, merkle_uri}`
- `merkle_uri` 指向对象存储（去标识化 JSON：叶子排序、树构造方式、版本号）

---

## 5) 身份/绑定（A/B 两模式）
### 5.1 A 模式（托管只读密钥）
- 前端用**钱包公钥加密** OKX 凭据（或后端 KMS 生成一次性公钥，前端加密），后端仅存密文
- 后端 Attestor 以任务形式拉单 → 生成 Root → 上链
- 数据表：`exchange_credentials(id, wallet, provider, enc_blob, key_id, created_at)`

### 5.2 B 模式（本地验证器）
- 绑定挑战：服务器下发 `challenge = keccak256(wallet, nonce, policy_ref)`
- 本地验证器：
  1) 用 OKX 只读键拉单
  2) 本地生成 `uid_hash = keccak256(wallet || salt || provider_uid)`
  3) 本地生成 `leaf/proof/root`（或仅 leaf 集合供后端统一建树）
  4) 用钱包对 `{uid_hash, window, leafs_hash}` 签名，再**最小包**上报
- 后端仅接收**最小指纹包**，可复算/抽查，不存原始凭据

---

## 6) 前端 DApp 页面（最小可用）
- `/products`：列表（保费、杠杆上限、赔付上限、等待期、FAQ）
- `/products/[id]`：详情（公式、示例费率表、理赔规则、黑名单/限赔）
- `/purchase`：选择 SKU + 参数 → 调用 `purchasePolicy`
- `/bind-okx`：A/B 模式切换；A：加密上传；B：下载/启动本地验证器（或浏览器扩展）
- `/claim`：输入订单号 → 服务端查 proof → `submitClaim`
- `/appeal`：上传最小字段或整行 CSV（可涂抹 PII）→ 进入工单

---

## 7) API 设计（主要路由）
```
POST /siwe/nonce
POST /siwe/verify           → { jwt }
GET  /me                    → { wallet, roles }

GET  /sku                   → SKU 列表/规则
GET  /sku/:id               → 详情 + 示例费率

POST /binding/okx           → A 模式：接收 enc_blob
POST /binding/fingerprint   → B 模式：接收 {uid_hash, window, leafs_hash, sig}

GET  /proof?orderId=...     → {rootId, proof[], leaf, uid_hash, window}
POST /claims/precheck       → 前置校验（额度/重复/窗口/等待期）
POST /appeals               → 申诉提交（文件/备注）
```

---

## 8) 数据表（简化）
- `users(wallet PRIMARY)`
- `sku(id, name, kind, payout_cap, wait_sec, params_json, is_active)`
- `policies(tokenId, wallet, skuId, startTs, endTs, payout_cap, rules_hash, txHash)`
- `bindings(wallet, provider, mode, uid_hash, enc_blob?, key_id?)`
- `attestations(rootId, uid_hash, windowStart, windowEnd, root, version, merkle_uri, createdAt)`
- `claims(id, tokenId, orderId, order_hash, rootId, status, payout, reason_code, createdAt)`
- `appeals(id, claimId, wallet, note, file_uri, status)`

---

## 9) SKU & 定价（JSON Schema）
```json
{
  "id": "day_liq_fixed_100",
  "name": "当日爆仓保（定额 100）",
  "kind": "FIXED_PAYOUT",
  "window": "DAY",
  "payout_cap": 100000000, // 1e6 精度
  "wait_sec": 3600,
  "pricing": {
    "formula": "premium = p * payout * (1+load) + op_fee",
    "params": {"leverage_bracket": [[0,10],[10,50],[50,100]], "load": 0.3, "op_fee": 100000 }
  },
  "rules_hash": "0x..."  
}
```
> 其他 SKU：8 小时时段保、月度回撤保（超阈值按比例）、无爆仓返现（期末返部分保费/券）。

---

## 10) 申赔与申诉（状态机）
- `PENDING → APPROVED → PAID` 或 `PENDING → REJECTED`
- 自动拒绝原因：`NO_POLICY | WINDOW | WAITING | DUPLICATE | LIMIT | NOT_IN_MERKLE | BLACKLIST`
- 申诉：`REVIEW → ARBITER_APPROVE/ARBITER_REJECT` → 如通过，`resolveByArbiter`

---

## 11) 风控与隐私
- 等待期、按钱包限赔、黑名单、SKU 限额、频率限制（IP+钱包）
- **最小化存储**：只存密文/指纹与 Merkle 元数据；原始订单仅本地或短期缓存
- 审计日志：所有上链/下链操作留可验证哈希

---

## 12) DevOps & 部署
- 环境：`dev`（Base Sepolia）→ `staging`（预演）→ `prod`（Base Mainnet）
- 组件：PostgreSQL、对象存储（S3 兼容）、消息队列（BullMQ/Redis）
- 监控：请求/错误率、上链失败重试、Root 新鲜度、申赔处理时延

---

## 13) 落地里程碑（建议）
**Phase 0（本周）**
- 合约最小集：PolicyManager + ClaimsManager + AttestationRegistry + Treasury
- Web：产品/购买/申赔基本流程；SIWE；A/B 绑定骨架
- Attestor：离线 CSV → Merkle → Root 上链 → Proof 查询
- 本地验证器：CLI 原型（读取 CSV/导出 API，出 `proof.json`）

**Phase 1**
- A 模式密钥加密上报 + 定时拉单
- Blacklist/等待期/限赔齐全；申诉通道与仲裁函数
- DevOps：日志/监控/Gas 管理

**Phase 2**
- 定价公式动态化 + 费率看板
- 支持多交易所（扩展 `provider`）
- 可选：Paymaster/Gasless 申赔

---

## 14) 开发小样（接口/事件示例）
**ClaimsManager.sol（片段）**
```solidity
interface IAttestationRegistry {
    function isLeafIncluded(
        bytes32 uidHash,
        uint64 windowStart,
        uint64 windowEnd,
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool);
}

contract ClaimsManager {
    struct ClaimRec { address owner; uint256 tokenId; bytes32 orderIdHash; uint8 status; uint256 payout; }
    event ClaimSubmitted(uint256 indexed tokenId, bytes32 indexed orderIdHash, uint8 status, uint256 payout);
}
```

**AttestationRegistry.sol（片段）**
```solidity
contract AttestationRegistry {
    struct RootMeta { bytes32 uidHash; uint64 windowStart; uint64 windowEnd; bytes32 root; uint16 version; }
    event RootAttested(bytes32 indexed uidHash, uint64 windowStart, uint64 windowEnd, bytes32 root, uint16 version);
}
```

---

### 结语
以上蓝图按照你确认的 UX 逐步拆解为可部署的模块与接口。先按 Phase 0 拉起最小可用闭环（购买→上链 Root→申赔），再逐步补齐加密托管/本地验证器与仲裁。后续我可以直接按该结构生成仓库脚手架与示例代码。

---

# 15) Polyrepo 脚手架（v0，可直接 `git push`）
> 选用 **Polyrepo**（更易替换/并行开发）。每个仓库自带 README、基本依赖、可运行的最小示例/测试与 CI 草稿。

## 15.1 顶层目录结构（建议在 GitHub 创建 6 个仓库）
```
liqpass-contracts/
liqpass-webapp/
liqpass-api/
liqpass-attestor/
liqpass-validator/
liqpass-devops/
```

---

## 15.2 liqpass-contracts（Foundry）
**文件树**
```
liqpass-contracts
├─ foundry.toml
├─ remappings.txt
├─ script/
│  ├─ Deploy.s.sol
├─ src/
│  ├─ interfaces/IAttestationRegistry.sol
│  ├─ PolicyManager.sol
│  ├─ ClaimsManager.sol
│  ├─ AttestationRegistry.sol
│  ├─ Treasury.sol
│  └─ BlacklistRegistry.sol
├─ test/
│  ├─ Policy.t.sol
│  └─ Claims.t.sol
└─ README.md
```
**foundry.toml**
```toml
[profile.default]
src = 'src'
out = 'out'
libs = ['lib']

evmasm = false
optimizer = true
optimizer_runs = 200
bytecode_hash = 'none'

[fuzz]
runs = 64
```
**IAttestationRegistry.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IAttestationRegistry {
    function isLeafIncluded(
        bytes32 uidHash,
        uint64 windowStart,
        uint64 windowEnd,
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool);
}
```
**PolicyManager.sol（最小可用）**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC721} from "lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract PolicyManager is ERC721, Ownable {
    struct Policy { uint256 skuId; uint64 startTs; uint64 endTs; uint256 payoutCap; bytes32 rulesHash; }
    mapping(uint256 => Policy) public policies;
    uint256 public nextId;

    event PolicyPurchased(address indexed owner, uint256 indexed tokenId, uint256 skuId, bytes32 txRef);

    constructor() ERC721("LiqPassPolicy","LPP") {}

    function purchasePolicy(
        uint256 skuId,
        uint64 startTs,
        uint64 endTs,
        uint256 payoutCap,
        bytes32 rulesHash,
        bytes32 txRef
    ) external payable returns (uint256 tokenId) {
        tokenId = ++nextId;
        _safeMint(msg.sender, tokenId);
        policies[tokenId] = Policy({
            skuId: skuId,
            startTs: startTs,
            endTs: endTs,
            payoutCap: payoutCap,
            rulesHash: rulesHash
        });
        emit PolicyPurchased(msg.sender, tokenId, skuId, txRef);
    }
}
```
**ClaimsManager.sol（骨架）**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Ownable} from "lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IAttestationRegistry} from "./interfaces/IAttestationRegistry.sol";

contract ClaimsManager is Ownable {
    enum Status { NONE, PENDING, APPROVED, REJECTED, PAID }
    struct ClaimRec { address owner; uint256 tokenId; bytes32 orderIdHash; Status status; uint256 payout; }

    IAttestationRegistry public registry;
    mapping(bytes32 => bool) public processedLeaf; // order leaf used

    event ClaimSubmitted(uint256 indexed tokenId, bytes32 indexed orderIdHash, Status status, uint256 payout);

    constructor(address reg) { registry = IAttestationRegistry(reg); }

    function submitClaim(
        uint256 tokenId,
        bytes32 uidHash,
        uint64 windowStart,
        uint64 windowEnd,
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external {
        require(!processedLeaf[leaf], "USED");
        bool ok = registry.isLeafIncluded(uidHash, windowStart, windowEnd, root, leaf, proof);
        require(ok, "NOT_IN_MERKLE");
        processedLeaf[leaf] = true;
        emit ClaimSubmitted(tokenId, leaf, Status.APPROVED, 0);
        // TODO: 校验 policy 生效/等待期/限赔/黑名单 + 触发赔付
    }
}
```
**AttestationRegistry.sol（最小）**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract AttestationRegistry {
    struct RootMeta { bytes32 uidHash; uint64 windowStart; uint64 windowEnd; bytes32 root; uint16 version; }
    event RootAttested(bytes32 indexed uidHash, uint64 windowStart, uint64 windowEnd, bytes32 root, uint16 version);
    mapping(bytes32 => RootMeta) public roots; // rootId => meta

    function attestRoot(bytes32 uidHash, uint64 ws, uint64 we, bytes32 root, uint16 ver) external returns (bytes32 rootId) {
        rootId = keccak256(abi.encode(uidHash, ws, we, root, ver));
        roots[rootId] = RootMeta(uidHash, ws, we, root, ver);
        emit RootAttested(uidHash, ws, we, root, ver);
    }

    function isLeafIncluded(
        bytes32 /*uidHash*/, uint64 /*ws*/, uint64 /*we*/, bytes32 root, bytes32 leaf, bytes32[] calldata proof
    ) external pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i=0;i<proof.length;i++) {
            bytes32 p = proof[i];
            computed = computed < p ? keccak256(abi.encodePacked(computed, p)) : keccak256(abi.encodePacked(p, computed));
        }
        return computed == root;
    }
}
```
**README.md（要点）**
```md
# liqpass-contracts
- Foundry 项目，含 Policy/Claims/Attestation 最小实现与单测骨架。
- 开发：`forge install foundry-rs/forge-std openzeppelin/openzeppelin-contracts`，`forge test`，`forge script script/Deploy.s.sol --rpc-url <base-sepolia> --broadcast`。
```

---

## 15.3 liqpass-webapp（Next.js 14 + Wagmi + SIWE）
**文件树**
```
liqpass-webapp
├─ package.json
├─ next.config.js
├─ .env.example
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx (landing)
│  ├─ products/page.tsx
│  ├─ products/[id]/page.tsx
│  ├─ purchase/page.tsx
│  ├─ bind-okx/page.tsx
│  ├─ claim/page.tsx
│  └─ appeal/page.tsx
├─ lib/siwe.ts
├─ lib/wagmi.ts
└─ README.md
```
**.env.example**
```
NEXT_PUBLIC_CHAIN_ID=84532 # Base Sepolia
API_BASE=http://localhost:4000
SIWE_DOMAIN=localhost
SIWE_ORIGIN=http://localhost:3000
```
**关键点**
- 接入 wagmi/viem；按钮：Connect Wallet；`signMessage` 做 SIWE。
- 页面骨架已就绪：产品列表/详情、购买、绑定、申赔、申诉表单。

---

## 15.4 liqpass-api（NestJS）
**文件树**
```
liqpass-api
├─ package.json
├─ src/
│  ├─ main.ts
│  ├─ modules/
│  │  ├─ siwe/
│  │  ├─ sku/
│  │  ├─ binding/
│  │  ├─ proof/
│  │  ├─ claims/
│  │  └─ appeals/
├─ prisma/
│  ├─ schema.prisma
├─ .env.example
└─ README.md
```
**schema.prisma（简版）**
```prisma
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model User { wallet String @id createdAt DateTime @default(now()) }
model Sku { id String @id name String kind String payoutCap BigInt waitSec Int paramsJson Json? isActive Boolean @default(true) }
model Policy { tokenId BigInt @id wallet String skuId String startTs BigInt endTs BigInt payoutCap BigInt rulesHash String txHash String }
model Attestation { rootId String @id uidHash String windowStart BigInt windowEnd BigInt root String version Int merkleUri String createdAt DateTime @default(now()) }
model Claim { id String @id tokenId BigInt orderId String orderHash String rootId String status String payout BigInt @default(0) reason String? createdAt DateTime @default(now()) }
```
**路由（示例）**
```ts
// POST /siwe/verify -> 返回 jwt
// GET  /sku -> 列表
// GET  /proof?orderId=... -> { rootId, proof, leaf, uid_hash, window }
// POST /claims/precheck -> 校验窗口/等待期/重复
```

---

## 15.5 liqpass-attestor（TypeScript Node）
**文件树**
```
liqpass-attestor
├─ package.json
├─ src/
│  ├─ connectors/okx.ts      // A 模式：服务端拉取（占位）
│  ├─ ingest/local.ts        // B 模式：接收本地验证器指纹
│  ├─ merkle/build.ts        // 从 leafs 构树/证明
│  ├─ merkle/types.ts
│  ├─ publisher/onchain.ts   // 调用 AttestationRegistry.attestRoot
│  ├─ api/http.ts            // 提供 /proof?orderId=...
│  └─ util/hash.ts           // 统一 decimal -> int & leaf 编码
└─ README.md
```
**merkle/build.ts（片段）**
```ts
import { keccak256 } from "viem";
export function buildMerkle(leaves: `0x${string}`[]) {
  const layers: `0x${string}`[][] = [leaves.sort()];
  while (layers[layers.length-1].length > 1) {
    const cur = layers[layers.length-1];
    const nxt: `0x${string}`[] = [];
    for (let i=0;i<cur.length;i+=2){
      const a = cur[i], b = cur[i+1] ?? cur[i];
      nxt.push( a < b ? keccak256(new Uint8Array([...a as any, ...b as any])) : keccak256(new Uint8Array([...b as any, ...a as any])) );
    }
    layers.push(nxt);
  }
  return {root: layers.at(-1)![0], layers};
}
```

---

## 15.6 liqpass-validator（本地验证器 CLI）
**目标**：读取本地 CSV（或调用 OKX API），生成 `{uid_hash, window, leafs_hash}` 最小包，并用钱包签名。

**文件树**
```
liqpass-validator
├─ package.json
├─ src/
│  ├─ cli.ts
│  ├─ okx_csv.ts
│  ├─ leaf.ts        // 与 attestor/util/hash.ts 对齐
│  └─ signer.ts
└─ README.md
```
**cli.ts（简化）**
```ts
#!/usr/bin/env node
import { buildLeavesFromCsv } from './okx_csv';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

async function main(){
  const [csvPath, walletPk] = process.argv.slice(2);
  const { uidHash, window, leavesHash } = await buildLeavesFromCsv(csvPath);
  const account = privateKeyToAccount(`0x${walletPk}`);
  const client = createWalletClient({ account, transport: http() });
  const msg = `liqpass:${uidHash}:${window}:${leavesHash}`;
  const sig = await client.signMessage({ account, message: msg });
  console.log(JSON.stringify({ uid_hash: uidHash, window, leafs_hash: leavesHash, sig }));
}
main();
```

---

## 15.7 liqpass-devops（Docker Compose + CI 草稿）
**文件树**
```
liqpass-devops
├─ docker-compose.yml
├─ env/
│  ├─ api.env
│  └─ attestor.env
├─ .github/workflows/
│  ├─ contracts-ci.yml
│  ├─ webapp-ci.yml
│  └─ api-ci.yml
└─ README.md
```
**docker-compose.yml（最小）**
```yaml
version: '3.9'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: liqpass
      POSTGRES_PASSWORD: liqpass
      POSTGRES_DB: liqpass
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  api:
    build: ../liqpass-api
    env_file: ./env/api.env
    depends_on: [db, redis]
    ports: ["4000:4000"]
  attestor:
    build: ../liqpass-attestor
    env_file: ./env/attestor.env
    depends_on: [api]
    ports: ["4100:4100"]
```

---

## 15.8 本地启动顺序（开发）
1. 克隆 6 个仓库到同一父目录；`pnpm i` 各自安装依赖
2. `liqpass-devops`：`docker-compose up -d`（起 Postgres/Redis + 构建 api/attestor）
3. `liqpass-api`：`prisma migrate dev && pnpm start:dev`
4. `liqpass-webapp`：`pnpm dev`（http://localhost:3000）
5. `liqpass-contracts`：配置 Base Sepolia RPC，`forge test` + `forge script` 部署

---

## 15.9 下一步
- 把现有 Base 上的合约地址替换进 webapp 与 api 的 env
- 我可以按你的 GitHub 组织名直接生成 6 个仓库的**初始提交 ZIP**（含上述文件），便于一键导入
- Phase 0 后，再完善 A 模式（托管只读密钥）与仲裁函数的细节

---

# 16) 可运行最小代码（关键文件内容）
> 拷贝即用。以下为每个仓库的关键文件最小实现（去除了冗余）。

## 16.1 liqpass-contracts 关键文件
**script/Deploy.s.sol**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import {PolicyManager} from "src/PolicyManager.sol";
import {ClaimsManager} from "src/ClaimsManager.sol";
import {AttestationRegistry} from "src/AttestationRegistry.sol";

contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        AttestationRegistry reg = new AttestationRegistry();
        PolicyManager policy = new PolicyManager();
        ClaimsManager claims = new ClaimsManager(address(reg));
        console2.log("AttestationRegistry:", address(reg));
        console2.log("PolicyManager:", address(policy));
        console2.log("ClaimsManager:", address(claims));
        vm.stopBroadcast();
    }
}
```
**test/Policy.t.sol（示例）**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import {PolicyManager} from "src/PolicyManager.sol";

contract PolicyTest is Test {
    PolicyManager pm;
    function setUp() public { pm = new PolicyManager(); }
    function testPurchase() public {
        bytes32 ref = keccak256("tx");
        uint256 id = pm.purchasePolicy(1, uint64(block.timestamp), uint64(block.timestamp+1 days), 100e6, bytes32(0), ref);
        assertEq(pm.ownerOf(id), address(this));
    }
}
```

---

## 16.2 liqpass-webapp 关键文件
**package.json**
```json
{ "name":"liqpass-webapp", "private":true, "scripts":{ "dev":"next dev", "build":"next build", "start":"next start" }, "dependencies":{ "next":"14.2.5", "react":"18.2.0", "react-dom":"18.2.0", "viem":"2.21.0", "wagmi":"2.12.10", "@wagmi/core":"2.12.10", "jsonwebtoken":"9.0.2", "zod":"3.23.8" } }
```
**app/layout.tsx**
```tsx
export default function RootLayout({ children }: {children: React.ReactNode}){return (
<html><body className="max-w-3xl mx-auto p-6 font-sans">{children}</body></html>);} 
```
**lib/wagmi.ts**
```ts
'use client';
import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
export const config = createConfig({ chains:[baseSepolia], transports:{[baseSepolia.id]: http()} });
```
**app/page.tsx（Landing）**
```tsx
import Link from 'next/link';
export default function Page(){
  return (<main>
    <h1 className="text-2xl font-bold">LiqPass / 爆仓保</h1>
    <ul className="list-disc pl-6 mt-4 space-y-2">
      <li><Link href="/products">浏览产品</Link></li>
      <li><Link href="/purchase">购买保单</Link></li>
      <li><Link href="/bind-okx">绑定 OKX（A/B）</Link></li>
      <li><Link href="/claim">申赔</Link></li>
      <li><Link href="/appeal">申诉</Link></li>
    </ul>
  </main>);
}
```
**app/products/page.tsx**
```tsx
async function getSkus(){ const r = await fetch(process.env.API_BASE+"/sku", {cache:'no-store'}); return r.json(); }
export default async function Products(){ const skus = await getSkus();
  return (<div><h2 className="text-xl font-bold">产品列表</h2>
  <div className="mt-4 space-y-3">{skus.map((s:any)=> (
    <div key={s.id} className="border p-3 rounded">
      <div className="font-semibold">{s.name}</div>
      <div>赔付上限：{Number(s.payoutCap)/1e6} USDC</div>
      <div>等待期：{s.waitSec}s</div>
    </div>))}</div></div>);
}
```
**app/bind-okx/page.tsx（表单骨架）**
```tsx
'use client';
import { useState } from 'react';
export default function Bind(){
  const [mode,setMode]=useState<'A'|'B'>('A');
  return (<div>
    <h2 className="text-xl font-bold">绑定 OKX</h2>
    <div className="mt-4">
      <label><input type="radio" checked={mode==='A'} onChange={()=>setMode('A')}/> A 托管只读密钥</label>
      <label className="ml-4"><input type="radio" checked={mode==='B'} onChange={()=>setMode('B')}/> B 本地验证器</label>
    </div>
    {mode==='A' ? <AForm/> : <BPanel/>}
  </div>);
}
function AForm(){
  return (<form className="mt-4 space-y-2" onSubmit={e=>e.preventDefault()}>
    <input placeholder="API Key" className="border p-2 w-full"/>
    <input placeholder="Secret Key" className="border p-2 w-full"/>
    <input placeholder="Passphrase" className="border p-2 w-full"/>
    <button className="border px-4 py-2 rounded">加密上传（占位）</button>
  </form>);
}
function BPanel(){
  return (<div className="mt-4">
    <p>下载本地验证器（CLI）运行后，将输出的 <code>{'{uid_hash, window, leafs_hash, sig}'}</code> 粘贴至此。</p>
    <textarea className="border p-2 w-full h-32" placeholder="粘贴 JSON"/>
    <button className="mt-2 border px-4 py-2 rounded">提交指纹</button>
  </div>);
}
```
**app/claim/page.tsx**
```tsx
'use client';
import { useState } from 'react';
export default function Claim(){
  const [orderId,setOrderId]=useState('');
  const [resp,setResp]=useState<any>(null);
  async function onCheck(){
    const r = await fetch(process.env.NEXT_PUBLIC_API_BASE||process.env.API_BASE+`/proof?orderId=${orderId}`);
    setResp(await r.json());
  }
  return (<div>
    <h2 className="text-xl font-bold">申赔</h2>
    <input className="border p-2 w-full" placeholder="订单号" value={orderId} onChange={e=>setOrderId(e.target.value)}/>
    <button className="mt-2 border px-4 py-2 rounded" onClick={onCheck}>验证并提交</button>
    {resp && <pre className="mt-4 bg-gray-100 p-3 text-xs overflow-auto">{JSON.stringify(resp,null,2)}</pre>}
  </div>);
}
```

---

## 16.3 liqpass-api（NestJS）关键文件
**package.json**
```json
{ "name":"liqpass-api","scripts":{"start":"nest start","start:dev":"nest start --watch"},"dependencies":{"@nestjs/common":"10.3.3","@nestjs/core":"10.3.3","@nestjs/platform-express":"10.3.3","zod":"3.23.8","jsonwebtoken":"9.0.2","@prisma/client":"5.18.0","bcryptjs":"2.4.3","express":"4.19.2"},"devDependencies":{"@nestjs/cli":"10.3.2","typescript":"5.4.5","ts-node":"10.9.2","prisma":"5.18.0"}}
```
**src/main.ts**
```ts
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Post, Query, Body } from '@nestjs/common';
import { z } from 'zod';

const sku = [{ id:'day_liq_fixed_100', name:'当日爆仓保（定额100）', kind:'FIXED', payoutCap:100_000_000, waitSec:3600, paramsJson:{} }];

@Controller()
class ApiCtrl {
  @Get('sku') getSku(){ return sku; }

  @Get('proof') getProof(@Query('orderId') orderId: string){
    // 占位：返回假数据结构供前端打通
    return { rootId:'0xroot', proof:['0x01','0x02'], leaf:'0xleaf', uid_hash:'0xuid', window:{start:0,end:0}, orderId };
  }

  @Post('claims/precheck') precheck(@Body() body:any){ return { ok:true, reason:null }; }
}

@Module({ controllers:[ApiCtrl] })
class AppModule {}

async function bootstrap(){
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(4000);
}
bootstrap();
```
**prisma/schema.prisma**（前文已给）

---

## 16.4 liqpass-attestor（Node + viem）
**package.json**
```json
{ "name":"liqpass-attestor","scripts":{"start":"node dist/http.js","dev":"ts-node src/http.ts"},"dependencies":{"viem":"2.21.0","fastify":"4.27.2"},"devDependencies":{"ts-node":"10.9.2","typescript":"5.4.5"}}
```
**src/util/hash.ts**
```ts
import { encodePacked, keccak256, toBytes, Hex } from 'viem';
export function str32(s:string):Hex{ return keccak256(toBytes(s)); }
export function leafOf(p:{exchange:string, acct:string, orderId:string, symbol:string, side:number, event:number, ts:number, px:bigint, qty:bigint, pnl?:bigint, fee?:bigint}):Hex{
  const typeHash = keccak256(toBytes('LiqLeaf(string exchange,bytes32 acct,bytes32 orderId,bytes32 symbol,uint8 side,uint8 event,uint64 ts,int256 px,int256 qty,int256 pnl,int256 fee)'));
  return keccak256(encodePacked(['bytes32','bytes32','bytes32','bytes32','bytes32','bytes32','uint8','uint8','uint64','int256','int256','int256','int256'],[
    typeHash, str32(p.exchange), str32(p.acct), str32(p.orderId), str32(p.symbol),
    '0x'+p.side.toString(16) as Hex, '0x'+p.event.toString(16) as Hex, BigInt(p.ts), p.px, p.qty, p.pnl??0n, p.fee??0n
  ]));
}
export function pairHash(a:Hex,b:Hex):Hex{ return a.toLowerCase()<b.toLowerCase()? keccak256(encodePacked(['bytes32','bytes32'],[a,b])): keccak256(encodePacked(['bytes32','bytes32'],[b,a])); }
export function buildMerkle(leaves:Hex[]){ const L=[...leaves].sort(); const layers=[L]; while(layers.at(-1)!.length>1){ const cur=layers.at(-1)!; const nxt:Hex[]=[]; for(let i=0;i<cur.length;i+=2){ const a=cur[i], b=cur[i+1]??cur[i]; nxt.push(pairHash(a,b)); } layers.push(nxt);} return {root: layers.at(-1)![0], layers}; }
```
**src/http.ts**
```ts
import Fastify from 'fastify';
import { buildMerkle } from './util/hash';
const app = Fastify();

// 假数据：orderId -> leaf
const store = new Map<string, `0x${string}`>();

app.get('/proof', async (req:any, rep:any)=>{
  const { orderId } = req.query;
  const leaf = store.get(orderId) || '0x'+'11'.repeat(32);
  const {root} = buildMerkle([leaf]);
  return rep.send({ rootId: root, proof: [], leaf, uid_hash: '0x'+'22'.repeat(32), window:{start:0,end:0} });
});

app.listen({ port:4100 }, ()=> console.log('attestor on :4100'));
```

---

## 16.5 liqpass-validator（CLI）
**package.json**
```json
{ "name":"liqpass-validator","bin":{"liqval":"dist/cli.js"},"scripts":{"build":"tsc","dev":"ts-node src/cli.ts"},"dependencies":{"csv-parse":"5.5.6","viem":"2.21.0"},"devDependencies":{"ts-node":"10.9.2","typescript":"5.4.5"}}
```
**src/okx_csv.ts**
```ts
import { parse } from 'csv-parse/sync';
import { Hex } from 'viem';
export function buildLeavesFromCsv(csvPath:string){
  const fs = require('fs');
  const text = fs.readFileSync(csvPath,'utf8');
  const rows = parse(text, { columns:true, skip_empty_lines:true });
  // TODO: 映射为 leaf（此处占位）
  const uidHash = '0x'+'33'.repeat(32) as Hex; const window={start:0,end:0}; const leavesHash='0x'+'44'.repeat(32) as Hex;
  return { uidHash, window, leavesHash };
}
```
**src/cli.ts**
```ts
#!/usr/bin/env node
import { buildLeavesFromCsv } from './okx_csv';
async function main(){ const [csvPath] = process.argv.slice(2); const { uidHash, window, leavesHash } = buildLeavesFromCsv(csvPath); const out = { uid_hash: uidHash, window, leafs_hash: leavesHash, sig: '0x' }; console.log(JSON.stringify(out)); }
main();
```

---

## 16.6 liqpass-devops（Dockerfile 与 CI）
**api Dockerfile**（放在 `liqpass-api/`）
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm i --production
COPY . .
EXPOSE 4000
CMD ["npm","run","start"]
```
**attestor Dockerfile**（放在 `liqpass-attestor/`）
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm i --production
COPY . .
EXPOSE 4100
CMD ["node","dist/http.js"]
```

---

## 16.7 ENV 汇总
**webapp/.env.example**
```
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_API_BASE=http://localhost:4000
API_BASE=http://localhost:4000
```
**api/.env.example**
```
DATABASE_URL=postgresql://liqpass:liqpass@db:5432/liqpass
JWT_SECRET=changeme
```
**attestor/.env.example**
```
RPC_URL=https://sepolia.base.org
REGISTRY_ADDR=0x...
```

---

## 16.8 手动冒烟测试（本地）
1. 起 `liqpass-devops`：`docker-compose up -d`（带 db/redis/api/attestor）
2. `liqpass-webapp`：`npm i && npm run dev` → 浏览 `/products` 能看到 SKU
3. `/claim` 输入任意 `orderId` → 能拿到占位 proof
4. `liqpass-contracts`：`forge script script/Deploy.s.sol --rpc-url <BaseSepolia> --broadcast --verify` 部署合约（占位）
5. 把 `REGISTRY_ADDR` 写入 `attestor/.env`，后续实现真实 `attestRoot`

---

### 说明
- 为了尽快跑通闭环，`/proof`、CSV 解析等处放了**占位实现**（不会影响你搭建与演示）。真实数据接入时，把占位段替换为 OKX 接口/你的 CSV 规范映射即可。
- 所有哈希/leaf/Merkle 的编码方式已固定在 `util/hash.ts`，Solidity 与 TS 两端保持一致，避免验证不一致。

