# LeverageGuard / LeverSafe 项目工作区 Project Workspace

该仓库汇总杠杆保险相关的产品方案、技术实现与运营资料，并按照统一命名体系整理。核心分为三部分：

- `docs/`：管理、产品、架构、合约、资助申请等文档索引（详见 `docs/README_索引-Index.md`）
- `src/`：应用与服务源代码（微服务、脚本、前端样例等）
- `data/`：验证证据、报表与输入样本
- `env/`：本地环境变量示例与说明（真实密钥请存放于 `env/*.env`，参见 `env/README_环境变量说明-Environment.md`）

## 结构概览

```
README_总览-Overview.md   # 仓库引导
docs/                     # 文档体系（层级编号 + 主题）
  ├─00_管理规划-Management/      # 项目管理与规划
  ├─01_产品方案-Product/         # 产品定位与参数方案
  ├─02_体验设计-Design/          # 流程与体验设计
  ├─03_系统架构-Architecture/    # 架构、路线图、安全方案
  ├─04_后端实现-Backend/         # 后端实现思路与脚本说明
  ├─05_前端体验-Frontend/        # 前端规格（待补充）
  ├─06_智能合约-SmartContracts/  # 合约规范与审计记录（待补充）
  ├─07_融资合作-Fundraising/     # Base Grants 等资助材料（待补充）
  ├─08_运维交付-Operations/      # 运维部署手册与问题列表
  ├─09_合规审计-AuditCompliance/ # 审计与合规文件
  ├─10_外部沟通-Communications/  # 对外沟通、招募资料
  ├─11_仓库规范-Repository/      # GitHub 仓库规范（待补充）
  ├─90_笔记纪要-Notes/           # 会议纪要与草稿
  └─_assets/图片-images/         # 说明文档配图
src/
  ├─apps/leversafe_calculator/            # LeverSafe 保费/赔付计算器
  ├─scripts/                              # OKX 验证脚本等工具
  └─services/microservices/               # 微服务样板（FastAPI 等）
contracts/                                # 智能合约源码（LeverageGuard 系列）
data/
  ├─evidence/                             # OKX 订单验证输出
  ├─inputs/orders.txt                     # 测试订单 ID 列表
  └─reports/                              # 批量验证报表
```

## Git 使用建议

1. **分支策略**：`main` 保存稳定版本，使用 `feature/<scope>-<desc>` 开发新功能，紧急修复采用 `hotfix/<issue>`。
2. **提交规范**：遵循 `type(scope): summary`，如 `feat(api): add claim endpoint`。针对文档可使用 `docs(...)`。
3. **版本标签**：发布上线或里程碑时打 `vX.Y.Z` 标签，并在 `docs/releases/` 中记录摘要。
4. **敏感信息**：严禁提交 API Key / 私钥等敏感配置，使用 `.env` 或密钥管理工具；本仓库中的示例凭证仅供测试，务必在生产中替换。

## 下一步推荐

- 补充 `docs/05_前端体验-Frontend`、`docs/06_智能合约-SmartContracts`、`docs/07_融资合作-Fundraising` 与 `docs/11_仓库规范-Repository` 中的缺失条目。
- 为微服务与脚本目录撰写模块级 README，明确依赖、启动方式与测试说明。
- 引入自动化文档索引或 Wiki，同步仓库结构到对外渠道（GitHub README / 团队知识库）。
- 若需协作开发，配置 `.pre-commit`、CI/CD 与容器化脚本，确保环境一致。

## Git 远端 (Remote)

当前仓库已关联至 [`https://github.com/wjz5788/leverageguard-attestor`](https://github.com/wjz5788/leverageguard-attestor)。可通过以下命令查看或更新：

```bash
git remote -v
# 如需更换
git remote set-url origin <new-url>
```

如需维护多套密钥，请参考：

- `.env.example`：模板
- `env/README_环境变量说明-Environment.md`
- `docs/11_仓库规范-Repository/11-01_仓库链接与密钥管理-RepoAndSecrets.md`
