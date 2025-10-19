# LeverageGuard / LeverSafe 项目工作区

> 官网：https://wjz5788.com · 合约地址（Base Mainnet）：`0x9552b58d323993f84d01e3744f175f47a9462f94` · 联系邮箱：zmshyc@gmail.com

**一句话定位**：LiqPass 是面向散户的链上爆仓保险，让高杠杆交易也能“先买保单再冲单”。

**产品承诺**：
- 仅绑定一家中心化交易所（首期对接 Binance UID）。
- 只读风控，不托管资金、不触碰 API 写权限。
- 被动理赔，按链上保单与凭证自动触发赔付。

**关键材料**：
- 中文帮助文档：《[LiqPass 基金申请帮助文档（中文）](docs/LiqPass_HelpDoc_CN.md)》
- 英文帮助文档：《[LiqPass Help Documentation (EN)](docs/LiqPass_HelpDoc_EN.md)》
- 可核验数据来源清单：[docs/references.md](docs/references.md)
- 线下核对与上链留痕指引：[docs/proof.md](docs/proof.md)

该仓库聚合杠杆保险（LeverageGuard / LeverSafe）相关的产品方案、技术实现与运营资料，方便团队在一个版本库内协作迭代。主要内容按照“文档 / 源码 / 数据”划分，并结合 Base 生态资助申请、风控模型与前端演示等子项目。

## Quick Links

- [Placeholder Link 1](#)
- [Placeholder Link 2](#)
- [Placeholder Link 3](#)

## 目录结构

```
README.md                           # 总览说明（当前文档）
README_总览-Overview.md              # 中文详版概览
binance_liq_p.py                    # 爆仓概率估算脚本（Mark Price）
contracts/                          # 智能合约源码（Foundry / Solidity）
data/                               # 佐证材料、报表、输入样本
docs/                               # 文档体系（编号+主题）
  ├─00_management/                  # 项目管理与规划
  ├─01_product/                     # 产品定位与参数方案
  ├─02_design/                      # 流程与体验设计
  ├─03_architecture/                # 技术架构、安全方案
  ├─04_backend/                     # 后端实现与接口
  ├─06_智能合约-SmartContracts/       # 合约规范与审计资料
  ├─07_融资合作-Fundraising/          # Base Grants 等资助材料
  ├─08_operations/                  # 运维部署/上线手册
  ├─09_audit-compliance/            # 合规与审计文档
  ├─10_communications/              # 对外沟通、市场材料
  ├─notes/                          # 会议纪要与草稿
  └─_assets/                        # 插图、设计稿
env/                                # 环境变量示例与说明
src/                                # 应用源码（脚本、前端、服务）
git-askpass.sh                      # CLI 推送辅助脚本
```

## 协作约定

1. **分支管理**：`main` 保持稳定，功能开发使用 `feature/<scope>-<desc>`，紧急修复采用 `hotfix/<issue>`。
2. **提交规范**：遵循 `type(scope): summary`，例如 `feat(risk-model): add liquidation probability script`；文档提交可使用 `docs(...)`。
3. **敏感信息**：禁止提交 API Key / 私钥等敏感配置，使用 `env/*.env`（已加入 `.gitignore`）或秘密管理工具。
4. **CI/测试**：合约使用 Foundry，前端使用 Node 20；建议补充 `.github/workflows/ci.yml` 以保证 PR 质量。

## 快速上手

- **脚本示例**：`python3 binance_liq_p.py --symbol BTCUSDT --side long --lev 20 --mmr 0.004 --hours 8 24 168`
- **前端入口**：参见 `docs/05_前端体验-Frontend` 与 `src/apps/leversafe_calculator/`
- **资助申请指南**：查看 `docs/08_运维交付-Operations/08-04_写仓库与Base基金流水线-LiqPassPipeline.md`
- **合约部署**：参考 `contracts/README.md` 与对应 Foundry 脚本

## 后续规划

- 完善 `docs/06_智能合约-SmartContracts` 与 `docs/07_融资合作-Fundraising` 资料，支撑 Base Grants 提交
- 在 `src/` 内补齐前端 dApp 与风控服务的 README / 运行说明
- 引入自动化校验（pre-commit、CI）与演示素材（`demo/`）以提升交付效率
