# 仓库链接与密钥管理指引 (Repository Link & Secrets Guide)

## 1. Git 仓库

- **远端地址**：[`https://github.com/wjz5788/leverageguard-attestor`](https://github.com/wjz5788/leverageguard-attestor)
- 当前本地仓库已设置 `origin` 指向该地址，可通过 `git remote -v` 查看。
- 建议使用以下分支策略：
  - `main`：稳定主分支
  - `feature/<模块>-<说明>`：功能开发
  - `hotfix/<问题>`：紧急修复

常用命令：

```bash
git checkout -b feature/order-attestor
git push -u origin feature/order-attestor
```

如需更换远端，可执行：

```bash
git remote set-url origin <new-url>
```

## 2. 环境变量与密钥命名

### 2.1 统一键名

| 用途            | 推荐键名                        | 说明                    |
|-----------------|----------------------------------|-------------------------|
| OKX API Key     | `OKX_API_KEY`                   | 读取于脚本、微服务      |
| OKX Secret      | `OKX_SECRET_KEY` 或 `OKX_API_SECRET` | 两个脚本均有使用     |
| OKX Passphrase  | `OKX_PASSPHRASE` 或 `OKX_API_PASSPHRASE` | 同步填写          |
| Base RPC        | `WEB3_PROVIDER_URL`             | 合约服务使用            |
| 合约地址        | `CONTRACT_ADDRESS`              | 订单验证 / 赔付服务使用 |

> 若脚本出现不同命名，请在 `.env` 中同时配置，以免遗漏。

### 2.2 多环境区分

1. 使用根目录 `.env.example` 作为模板
2. 在 `env/` 目录创建多个文件，例如：
   - `env/okx-mainnet.env`
   - `env/okx-sandbox.env`
   - `env/base-testnet.env`
3. 运行前根据需要加载对应文件：

```bash
source env/okx-mainnet.env
python src/scripts/okx_liquidation_verifier.py ...
```

或使用 `python -m dotenv run -f env/okx-mainnet.env -- <command>`。

### 2.3 交换密钥的注意事项

- 不要在聊天或仓库中明文发送真实 API Key
- 若需要共享，创建临时文件（例如 `okx-mainnet.env.gpg`）并通过安全渠道传输
- 发现密钥泄漏应立即在交易所 / 服务端重置

## 3. 建议的工具

- [`direnv`](https://direnv.net/): 为不同目录自动加载 `.env`
- [`git-secret`](https://git-secret.io/): 将敏感文件以 GPG 加密纳入版本控制
- [`pip install python-dotenv`](https://github.com/theskumar/python-dotenv): 使用 `dotenv run` 在命令前加载环境变量
- CI/CD 平台 (GitHub Actions 等)：在仓库 Secrets 中配置 `OKX_API_KEY` 等变量，避免硬编码

## 4. 日常检查清单

- [ ] 本地无真实密钥文件被 `git status` 检测到
- [ ] `.env` 与 `env/*.env` 均在 `.gitignore` 中
- [ ] 脚本运行前确认当前终端加载的环境文件
- [ ] 推送前使用 `git diff` / `pre-commit` 检查是否包含敏感信息

通过以上约定，可在多密钥、多环境间快速切换，同时维持仓库安全与可协作性。***
