# LiqPass v2 升级执行手册

面向日本主站（被动验证）、美国备份节点与 Base 主网合约的统一要求。本文档用于运维落地、审计复核与交付验收。

---

## 1. 日本服务器（主站，被动验证）

### 1.1 数据规范与哈希
- 采用 **v2 规范化**：固定 9 条叶子顺序，奇数叶重复补齐。
- `ordIdHash = sha256("okx|<instId>|<ordId>")` —— exchange 全小写、竖线分隔。
- Merkle 树使用 **SHA-256**，保留层级顺序并输出中间叶子。
- `rule_hash = sha256(manifest.json)`；日志与审计均以此为引用。

### 1.2 文件输出（`/proofs/<ordIdHash>/`）
- `manifest.json`：列出叶子顺序、散列值、窗口、版本号（`version=200`）。
- `proof.json`：升级为 v2 结构（含 `inputs.instId`、`ordIdHash` 等）。
- `proof.sha256`：对 `proof.json` 的文件级哈希。
- `root.txt`：单行存储 `0x` 前缀的 Merkle Root。
- `summary.json`：压缩版指标（订单、窗口、signals、batchId 等）。
- `attested_proof.json`：当上链成功后写入 `root`、`version=200`、`txHash`、`attestor_sig`、`attestor_addr`、`onchain_version=200`。

### 1.3 接口与校验
- `/api/verify`
  - 白名单交易对：OKX `BTC-USDT-SWAP/BTC-USDC-SWAP`，Binance `BTCUSDT/BTCUSDC`。
  - `instId_selected == proof.json.inputs.instId` 否则 400。
  - `ts`（证据生成时间）必须落在 **当前 UTC ±24h**。
  - `passive_mode = true`，禁止请求交易所 API（防火墙阻断对应域名）。
  - 不合规请求统一返回 400，记录 `decision=reject` 与 `reason`。
- `/api/attest`
  - 入参仅 `{ "root": "<0x...>", "version": 200 }`。
  - 上链成功后写入 `txHash`，并旁写 `attested_proof.json`。

### 1.4 EIP-712 出证签名
- Domain：`{name: "LiqPassAttestor", version: "2.0", chainId: 8453, verifyingContract: <Base 合约地址>}`。
- Types：`Attestation(bytes32 root,uint16 version,uint64 createdAtMs)`。
- 每次生成 `attestor_sig`（hex）并记录 `attestor_addr`。
- 私钥仅保存在日本服务器安全模块，导出策略需审批。

### 1.5 日志与审计
- 路径：`logs/YYYYMMDD/verify.log`。
- 追加字段：`ver=v2`、`rule_hash`、`decision`（pass/reject）、`reason`。
- 记录 `exchange`, `instId_selected`, `instId_parsed`, `order_id_hash`, `passive_mode`.

### 1.6 系统安全
- 服务器时区固定 UTC，开启 NTP 同步。
- `/proofs` 目录仅允许服务写入，运维只读。
- 防火墙禁止访问交易所域名/IP，保持纯被动模式。
- 接口启用限流、HTTP 缓存/压缩，加速静态文件下载。
- 定期将 `/proofs` 与 `logs` 备份至美国服务器（参见 §2）。

### 1.7 迁移策略
- 批量重算旧版 `proof.json` → v2 结构。
- 统一重新生成 9 叶顺序、`ordIdHash`、Merkle Root。
- 输出新 `manifest.json`、`proof.sha256`、`root.txt`、`summary.json`。
- 迁移过程中记录映射表（oldRoot → newRoot），供审计查询。

---

## 2. 美国服务器（备份 & 只读复核）

### 2.1 数据同步
- 通过 `rsync` 定时拉取日本节点的 `/proofs` 与 `logs`。
- 只读挂载，不允许覆盖源数据。
- 对每个目录校验 `proof.sha256`；若失败触发告警。

### 2.2 服务能力
- 提供只读接口：
  - `GET /api/evidence/{ordIdHash}`：返回 `manifest.json`、`summary.json` 等。
- 静态下载：允许获取 `proof.json`、`attested_proof.json`。
- 关闭 `/api/attest`，并设置 `ENABLE_ATTEST=false`。
- 保持与日本节点一致的校验规则，用于本地复算或审计。

### 2.3 灾备与安全
- 跨区域备份（快照 + 对象存储）。
- 监控可用性、rsync 成功率、哈希校验失败率。
- 仅开放 HTTPS，限制管理入口 IP。

---

## 3. Base 主网合约与出证流程

### 3.1 事件与版本
- 首选事件定义：`event Attested(bytes32 root, uint16 version);`，链上写 `version=200`。
- 若现网仍使用字符串版本，暂写 `"2.0"`，同时计划升级事件。

### 3.2 部署与配置
- 在 Base (8453) 部署 v2 合约，记录地址、ABI、部署交易。
- 后端配置：
  - `VERIFYING_CONTRACT=<新合约地址>`
  - `CHAIN_ID=8453`
  - 出证账户、RPC、重试策略。

### 3.3 上链脚本
- 发送交易仅包含 `root` 与 `version`。
- 交易回执中读取 `tx.hash` 与 `from`；`from` 作为 `attestor_addr` 记录。
- 回写 `txHash`、`attestor_addr`、`attestor_sig` 至 `attested_proof.json`。

### 3.4 EIP-712 对齐
- 后端与审计工具使用统一 Domain/Types。
- 验签脚本需验证 `attestor_sig` 对应 `attestor_addr`。

### 3.5 迁移与兼容
- 若替换合约，保留 v1/v2 地址供查询。
- 前端与帮助文档注明新旧入口，确保溯源路径清晰。

### 3.6 验收
- 使用样例数据生成完整 v2 文件集。
- 成功上链事件并在 Basescan 校验 `root` 与 `version`。
- EIP-712 验签本地通过。
- 日志记录完整（含 `rule_hash`、`decision` 等）。

---

## 4. 交付物清单

1. **v2 规则文件**
   - `manifest.json` 模板
   - 生成器脚本与使用说明
2. **离线校验器**
   - 命令行工具：校验 `proof.json`、`proof.sha256`、Merkle Root 与 EIP-712 签名
   - 支持本地复算、白名单验证、时间窗口检查
3. **运维文档**
   - 目录结构、接口说明、拒绝规则、日志字段
   - 灾备策略、回滚步骤、安全策略（防火墙/NTP/权限）
4. **验收样例集**
   - 样例 `proof.json`、`manifest.json`、`summary.json`
   - `root.txt`、`proof.sha256`、`attested_proof.json`（含 `txHash`、`attestor_sig`、`onchain_version=200`）
   - 对应链上 `txHash` & Basescan 链接

---

## 5. 时间与责任分配（示意）

| 阶段 | 负责人 | 关键产物 |
| ---- | ------ | -------- |
| v2 规范实现 | 后端 & 运维 | 新版 `/api/verify`、`manifest.json` 生成器 |
| EIP-712 出证 | 合约 & 后端 | 新 Domain/Types、签名脚本、Key 管控 |
| 迁移批处理 | 运维 | 老数据转换、映射表、备份 |
| 灾备上线 | 运维（美服） | rsync、只读 API、监控告警 |
| 合约验收 | 合约 & 审计 | 上链脚本、事件校验、文档 |
| 交付验收 | 全体 | 样例包、运维手册、离线校验器 |

按此清单推进，即可完成 LiqPass v2 主站/备份/链上全链路升级，并具备审计、灾备与验收所需的全部材料。***
