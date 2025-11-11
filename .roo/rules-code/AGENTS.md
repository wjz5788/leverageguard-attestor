# Project Coding Rules (Non-Obvious Only)

*   Always use `envValidator.ts` to validate environment variables in `us-backend`.
*   Use `crypto.ts` for encryption and decryption in `us-backend`.
*   Store evidence using `evidenceStorage.ts` in `us-backend`.
*   Use middleware for authentication and authorization in `us-backend`.
*   Manage global state with `WalletContext.tsx` and `ToastContext.tsx` in `us-frontend`.
*   Use components in `src/components/ui/` to build the user interface in `us-frontend`.
*   Use Ownable, Pausable, and ReentrancyGuard interfaces to manage contracts in `liqpass-verify`.
*   Use the SafeERC20 library for safe ERC20 token operations in `liqpass-verify`.

## 智能合约验证 (Base 主网 - Hardhat 一键验证)

*   安装 Hardhat Etherscan 插件：`npm i -D @nomicfoundation/hardhat-etherscan`
*   在 `hardhat.config.ts` 中配置 Basescan API 密钥和网络：

```typescript
etherscan: {
    apiKey: { base: process.env.BASESCAN_API_KEY! },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      }
    ]
  }
```

*   清除并重新编译合约：`npx hardhat clean && npx hardhat compile`
*   使用以下命令验证合约：

```bash
npx hardhat verify --network base \
  你的合约地址 \
  构造参数1 \
  构造参数2
```

    *   如果项目中有同名合约，请使用 `--contract contracts/CheckoutUSDC.sol:CheckoutUSDC` 明确指定合约全名。
*   常见错误及修复：
    *   `Different compiler settings`：将 `solidity.version` 和 `optimizer.runs` 设置为 `0.8.24 / runs=200`，然后重新编译。
    *   `File import callback not supported / openzeppelin 未找到`：运行 `npm i -D @openzeppelin/contracts@^5`，然后重新编译。
    *   `Bytecode mismatch`：使用相同的编译设置重新本地编译。