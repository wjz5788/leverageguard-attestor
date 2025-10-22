## LiqPass US 前端本地化作战手册

### 1. 目标与交付
- 目标：在本地复刻一套「可演示、可提测」的 LiqPass US 前端，覆盖首页、验证表单、帮助中心与钱包连接。保留多语言（中/英）与固定交易对校验，确保能对接未来的 `/api/verify`。
- 交付物：`packages/us-frontend` 子包内的页面、组件、帮助文案生成脚本与构建产物。最终通过 `npm run build` 生成 `dist/`，供 Actions 部署脚本上传。

### 2. 本地环境准备
- Node.js 20.x（建议用 `fnm`/`nvm` 管理）。
- 仓库根目录执行 `npm ci --prefix packages/us-frontend` 安装依赖。
- 开发时跑 `npm run dev --prefix packages/us-frontend`，默认端口 5173；如需指定端口加 `-- --port 4173`。
- 构建命令会自动生成帮助页数据（`scripts/generate-help-data.mjs`），请确保 `docs/` 下的帮助文档存在。

### 3. 项目结构一览
- `src/App.tsx`：声明路由；目前只有 `/` 与 `/help`，后续需要补 `/verify`（或 `/trade`）。
- `src/pages/Home.tsx` & `pages/home.ts`：首页逻辑，包含钱包连接按钮（`WalletConnectButton`）。
- `src/components/WalletConnectButton.ts`：封装 MetaMask 交互，含状态更新与多语言提示。
- `src/content/help.ts`：运行时从 `docs/` 自动抽取帮助内容；`generate-help-data.mjs` 用于构建阶段生成缓存。
- `src/config/networks.ts`：Base Mainnet 配置，可复用在验证流程中。
- TODO：新增 `src/pages/Verify.tsx` + `src/pages/verify.ts`（页面描述 + 初始化逻辑）、`src/services/verify.ts`（请求封装）、`src/components/forms/*`（表单组件库）。

### 4. 开发节奏建议（三阶段推进）
1. **Phase 0：打通环境与基础骨架**
   - 跑通 `npm run dev/build`，确认帮助页可以从 `docs/` 自动渲染。
   - 整理 UI 设计稿 / 低保真草图（可复用 README 中的卡片样式）。
   - 建 `src/styles` 下的公共样式（如 Form 卡片、Stepper、提示框）。
2. **Phase 1：验证流程 MVP**
   - 新建 `/verify` 页面，提供「交易所 → 交易对 → 订单号 → 证据上传」四步表单。
   - 交易所/交易对使用固定白名单（参考 `docs/05_前端体验-Frontend/05-02_LiqPass_App_Structure.md`），禁止自由输入。
   - 解析上传的 JSON/Text，抽取 `instType`/`contractType` 与 `instId`；若与表单不符，阻止提交并给出红色提示。
   - 封装 `submitVerification()`，暂用 mock API（可在 `src/services/verify.ts` 写 `Promise.resolve({ status: 'accepted' })`），未来对接日本节点。
3. **Phase 2：多语言与细节打磨**
   - 所有表单提示、按钮、错误文案提供中英双语（沿用 `SupportedLanguage` 架构）。
   - 复用首页的钱包状态文案翻译逻辑，避免重复字符串。
   - `/help` 页面补锚点跳转、TOC 高亮、滚动定位（当前已有基础逻辑，可加「当前章节」高亮）。
   - 新增 `/status` 或首页卡片显示最近一次成功验证、`merkleRoot`、`attest` 统计（可先 mock）。

### 5. 页面拆解与实现提示
- **首页 `/`**
  - 顶部 Hero：标题、一句话价值主张、`Connect MetaMask` 按钮。
  - 中部卡片：固定展示「仅支持四个永续合约」「赔付流程简述」。
  - 底部 CTA：按钮跳转 `/verify`；提供 `Learn more → /help` 链接。
- **验证页 `/verify`**
  - Stepper：当前步骤高亮，可用 flex 布局 + `aria-current`.
  - 表单校验：使用原生 `setCustomValidity` 或轻量库（可选，不引入大型依赖）。
  - 证据解析：单独模块 `parseEvidence(blob: File) -> { exchange, instId, instType } | Error`，方便后端复用。
  - 提交后展示结果卡（成功/失败），并打印哈希/摘要，方便 QA。
- **帮助页 `/help`**
  - 继续读 `docs/`，补充「常见拒绝原因 / How to appeal」等段落。
  - 实现「语言切换」按需显示（当前策略：同屏双语，可继续沿用）。

### 6. 接口与数据对接
- 未来日本节点将暴露 `/api/verify`，POST JSON：`{ exchange, instId, orderId, evidence }`。
- 本地开发可：a) 写 `mock/service-worker`；b) 在 `scripts/` 下建 `dev-server.ts`（Express/Fastify）模拟响应；c) 直接调用静态 Promise。
- 需要在提交时生成 `orderIdHash = sha256(orderId + instId)`，以便与后端日志对齐（可用浏览器 `crypto.subtle.digest`）。

### 7. 多语言与文案管理
- 新增 `src/i18n/strings.ts`（或扩展 `utils/language.ts`），集中存储文案。
- 使用属性 `data-lang="zh"` / `"en"` 控制显示；对表单提示、Toast、按钮文本走相同管线。
- 务必在 `/help`、`/verify` 页面强调“仅支持 BTC-USDT-SWAP / BTC-USDC-SWAP / BTCUSDT / BTCUSDC 永续”。

### 8. 验收清单
- [ ] `npm run build` 产物包含 `dist/__version` 与 `dist/healthz`。
- [ ] 路由 `/`, `/verify`, `/help` 正常渲染，刷新后保持状态（必要时用 `history` 模式）。
- [ ] `/verify` 表单对不在白名单内的交易对直接拒绝；解析证据时如发现现货/交割合约需提示错误。
- [ ] 提交成功后显示摘要卡（地址、订单号后四位、签名预览），并允许重置继续提交。
- [ ] 所有文案提供中英双语；帮助页目录跳转准确。
- [ ] Lighthouse 基准分数 Desktop ≥ 80（性能/可访问性），保证后续优化空间。

### 9. 后续可选提升
- 引入 Zustand/TanStack Query 管理状态，方便接入真实 API。
- 将帮助文档渲染改为 `prebuild + JSON`，减少运行时解析成本（现脚本已初步实现，可继续优化）。
- 补 Storybook/Playwright，覆盖关键交互（连接钱包、表单校验、证据解析）。
- 与后端联调后，把 `verify` 结果写入「最近记录」卡片，并在 `/help` 加上 API 状态提示。

> 小贴士：优先把路径 `/verify` MVP 跑通，再微调 UI；Commit 时保持 `feat(frontend): ...` 命名，便于后续自动化工作流识别。
