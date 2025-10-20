# 环境变量与密钥管理 (Environment & Secret Management)

为避免混淆多个 API Key / 私钥，建议在 `env/` 目录下按环境划分配置文件，并结合 `.env.example` 统一键名。

## 推荐命名

| 文件示例            | 说明                    |
|---------------------|-------------------------|
| `okx-mainnet.env`   | OKX 主账号生产密钥      |
| `okx-sandbox.env`   | OKX 模拟盘 / 测试密钥   |
| `base-testnet.env`  | Base 测试网链上配置     |
| `local-dev.env`     | 本地调试环境 (合并配置) |

> 所有 `*.env` 文件已被 `.gitignore` 忽略，安全地存放在本地即可。需要共享模板时，可新建 `*.env.example` 并提交。

## 使用方式

### 1. 手动加载

```bash
source env/okx-mainnet.env
python src/scripts/okx_liquidation_verifier.py ...
```

### 2. python-dotenv

`okx_liquidation_verifier.py` 默认调用 `load_dotenv()`，会读取项目根目录 `.env`。可将所需环境复制或软链为 `.env`：

```bash
cp env/okx-mainnet.env .env
python src/scripts/okx_liquidation_verifier.py ...
```

或者设置 `ENV_FILE` 并提前加载：

```bash
export ENV_FILE=env/okx-sandbox.env
python -m dotenv run -f $ENV_FILE -- python src/scripts/okx_batch_verifier.py
```

### 3. direnv / dotenv CLI

可结合 `direnv`、`pip install python-dotenv` 的 `dotenv run` 等工具，实现按目录自动加载，避免忘记切换环境。

## 提示

1. 与脚本保持环境变量命名一致。例如 `okx_batch_verifier.py` 读取 `OKX_API_SECRET`、`OKX_API_PASSPHRASE`，请同时维护与 `OKX_SECRET_KEY`、`OKX_PASSPHRASE` 的值一致。
2. 切换环境前先 `unset` 或关闭终端，避免残留凭证。
3. 永远不要将真实密钥提交到 Git，必要时可使用 `git secrets` 或预提交钩子扫描。
