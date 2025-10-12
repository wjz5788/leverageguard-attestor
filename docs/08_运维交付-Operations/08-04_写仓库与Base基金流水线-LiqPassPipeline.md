# 写仓库 + Base 基金申请流水线（LiqPass）

本流程将“仓库落地”与“Base Builder Grants 申请”合并为一条可执行流水线，适配 VS Code + Codex 协同开发场景，目标是在 1 个冲刺内完成仓库搭建、自动化校验、演示素材与资助申请。

---

## 1. 仓库落地（VS Code + Codex）

1. **初始化目录结构（建议仓库名：`liqpass` 或 `baocangbao`）**
   ```
   liqpass/
   ├─ contracts/               # Solidity 合约（Base 主网地址与 ABI）
   ├─ scripts/                 # 部署、校验、Merkle 生成脚本
   ├─ risk-model/              # 爆仓概率定价脚本/Notebook
   ├─ frontend/                # Next.js dApp：购保、理赔、审计校验
   ├─ data/                    # 样例订单与佐证材料（去隐私）
   ├─ docs/                    # 白皮书、Grant 文档、一页纸
   ├─ demo/                    # 1 分钟演示素材（视频、脚本、截图）
   ├─ .github/workflows/ci.yml # CI：合约测试 + 前端构建
   ├─ README.md                # 安装、演示、地址、截图、视频
   ├─ LICENSE                  # 建议 MIT，初期友好
   └─ SECURITY.md              # 只读 API、风控与 Kill Switch 说明
   ```

2. **SSH 多账号配置（修复 `git@github.com-100x` 拒绝问题）**
   ```
   Host github.com-100x
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_ed25519_github_100x_work
     AddKeysToAgent yes
     UseKeychain yes   # macOS 专用
   ```
   - 运行 `ssh -T git@github.com-100x` 验证连接
   - `git remote add origin git@github.com-100x:<用户名>/liqpass.git`
   - `git push -u origin main`
   - 若失败，确认公钥已添加到 GitHub，并执行 `ssh-add -K ~/.ssh/id_ed25519_github_100x_work`

3. **VS Code + Codex 联动**
   - 打开仓库后让 Codex 生成 `README.md`、`contracts/` 模板、`frontend/` 页面、`risk-model/` 计算脚本等基础文件
   - 推荐扩展：GitHub Pull Requests、ESLint、Solidity (Nomic)、Prettier
   - 约定提交信息前缀：`feat/`、`fix/`、`chore/`、`docs/`、`ci/`

4. **最小 CI（`.github/workflows/ci.yml`）**
   ```yaml
   name: ci
   on: [push, pull_request]
   jobs:
     build-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
         - name: Frontend build
           run: |
             cd frontend
             npm install
             npm run build
         - name: Solidity lint & test (Foundry)
           uses: foundry-rs/foundry-toolchain@v1
           with:
             version: nightly
         - run: |
             forge --version
             forge build
             forge test -vv
   ```

---

## 2. README 首屏要点

- 一句话定位：面向合约高杠杆散户的「爆仓保险 / LiqPass」
- 四个产品 SKU：当日爆仓保、8 小时时段保、月度回撤保、无爆仓返现
- 定价公式：`爆仓概率 × 赔付 × (1 + load) + 运营费`
- Base 主网合约地址 + Basescan 链接 + Demo 链接
- 只读 API & 反欺诈：等待期 / 限赔 / 黑名单 / 风控开关
- 一键本地体验：`frontend` 启动指令、`risk-model` 样例计算、`scripts` 回放强平识别日志
- 截图/嵌图：购买流程、理赔日志、Basescan 事件

---

## 3. 一分钟 Demo 指南

- **0–10 秒**：展示 dApp 首屏，连接钱包，闪现 Base 主网合约地址（可切到 Basescan）
- **10–30 秒**：导入样例订单（只读 API 输出），显示爆仓概率与保费
- **30–45 秒**：确认购买 → 链上交易成功 → 显示订单号、保险单号、等待期
- **45–55 秒**：回放强平/ADL 样例 → 展示自动识别、审计日志、Merkle 证明
- **55–60 秒**：总结价值主张：「降低极端风险、带来新增交易量与手续费、正向现金流」
- 输出格式：竖屏 1080×1920，含中英文字幕；素材存放于 `demo/`，并上传公开链接（YouTube / Farcaster Frames / 官网）

---

## 4. Base 资助路径

1. **Builder Grants（1–5 ETH，回溯式）**
   - 关注独特性、用户上链贡献、上线影响力
   - 支持社区提名表单（Paragraph 文章入口）
2. **Get Funded 总览**
   - 四条路径：Weekly Rewards、Builder Grants、OP Retro、Base Batches
   - 申请前准备：部署到 Base、文档清晰、指标可量化
3. **Ecosystem / Resources 门户**
   - 集中入口，含 Builder Network、Get Funded 等
4. **CDP Paymaster 资助**
   - 注册即获最高 $600 gas 额度，可申请至 $15K
   - 用于免 Gas 购买/理赔，提升上链体验

---

## 5. 申报文案（150 字 / 150 words）

**中文（≤150 字）**
> 爆仓保（LiqPass）面向高杠杆散户，提供“当日/时段/回撤/返现”等参数化保障，用“爆仓概率×赔付×(1+load)+运营费”定价。我们仅使用交易所只读 API 与链上合约，自动识别强平/ADL 并生成可审计日志+Merkle 证明，支持黑名单、等待期、限赔等反欺诈。产品已在 Base 主网部署，演示含购买、识别、理赔与日志验证。它降低极端风险、带来新增交易量与手续费，形成正向现金流；同时结合 Paymaster 做免 Gas 体验，助力更多用户上链。

**English (≤150 words)**
> LiqPass is “liquidation insurance” for high-leverage retail traders. We sell four parameterized SKUs (same-day, time-slot, drawdown cap, and cashback). Pricing = liquidation probability × payout × (1+load) + ops. We use read-only CEX APIs plus on-chain contracts to auto-detect liquidation/ADL and emit auditable logs with Merkle proofs. Anti-fraud includes waiting periods, payout caps, blacklists, and kill-switches. A working demo on Base mainnet shows purchase → detection → claim → proof verification. LiqPass reduces tail risk for users while increasing traded volume and fees for the ecosystem, creating positive cash flow. With CDP Paymaster gas credits, we deliver gasless purchase/claims to onboard more users on Base.

---

## 6. 提交清单（对照 Builder Grants 表单）

- Email / Nominator Name / Project Name（LiqPass / 爆仓保）
- Project URL（仓库或官网）
- Project Twitter / Farcaster
- Builder Twitter / Farcaster
- Is the project live on Base? → 选择 “Yes – live on Base mainnet”，附 Basescan 地址
- Why…?（150 words）→ 使用上面的英文版本
- 1-minute demo link（YouTube / 自建站）
- 同意素材授权条款

---

## 7. 公关与曝光

- 发布 2 条短帖（X / Farcaster），主题「高杠杆爆仓可保」「Base 主网上线」等
- 每条帖子附上 Demo 视频、Basescan 合约、仓库链接、关键截图
- @BuildOnBase 并投递 /base、/base-builds 频道，遵循官方放大指引

---

## 8. 指标与证据（README / Demo 内同步展示）

- 已售保单数、理赔率、强平识别精准度、唯一钱包数、交易量提升证明
- Paymaster 使用占比（免 Gas 转化率）与人均节省 Gas
- 任意其他可量化指标：保费收入、赔付支出、正向现金流状况

---

## 9. 推荐冲刺节奏（示例）

| 时间 | 目标 | 产出 |
| --- | --- | --- |
| Day 1 | 仓库初始化、SSH 配置、README 草稿 | 仓库骨架 + README 初稿 |
| Day 2 | 合约/风控脚本雏形、CI 配置 | Foundry 最小测试 + GitHub Actions |
| Day 3 | 前端最小可用 Demo（购买/理赔） | `frontend` Demo + 截图 |
| Day 4 | 演示脚本拍摄、数据指标整理 | 1 分钟视频 + 指标看板 |
| Day 5 | 150 字中英稿件、申请表填报 | 提交记录 + 公告帖 |

---

执行时保持“代码与材料同步”原则：每完成一个功能模块，就更新 README / 指标 / Demo，并立刻准备申请所需素材，避免在资助申请阶段重复收集。*** End Patch
