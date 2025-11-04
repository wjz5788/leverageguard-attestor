# 目标

把文档从主站拆分到独立仓库与独立静态站：中英双语、零后端、持续集成、免费托管。

---

## TL;DR（全自动最小流程）

**默认：GitHub Pages + Docusaurus + 双语（zh-CN / en）**

1. 新建空仓库：`leverageguard-docs`（Public）。
2. 本地初始化：

   ```bash
   npx create-docusaurus@latest leverageguard-docs classic --typescript
   cd leverageguard-docs
   npm i
   ```
3. 启用 i18n（把中文做默认语言）：

   * 编辑 `docusaurus.config.ts`，加入本文给出的 `i18n` 段与导航配置。
4. 新增三篇核心文档（快速开始 / FAQ / 理赔与证据）。
5. 新增 GitHub Actions（`deploy.yml`）自动部署到 GitHub Pages。
6. 首次推送：

   ```bash
   git init && git add . && git commit -m "docs: bootstrap docusaurus with i18n"
   git branch -M main
   git remote add origin git@github.com:<your-username>/leverageguard-docs.git
   git push -u origin main
   ```
7. 仓库 → Settings → Pages：**Build and deployment = GitHub Actions**（默认）。等待工作流完成。
8. 绑定域名：

   * 自定义域 `help.yourdomain.com` → DNS CNAME 到 `<your-username>.github.io`。
   * 仓库根目录 `static/CNAME` 写入 `help.yourdomain.com`。
9. 主站内做 301 跳转 `/help` → `https://help.yourdomain.com`（示例 Nginx/Express 见下）。

到此，第一版文档站上线。

---

## 目录结构（建议）

```
leverageguard-docs/
  docs/
    quick-start.md
    faq.md
    claims-evidence.md
  i18n/
    en/
      docusaurus-plugin-content-docs/current/
        quick-start.md
        faq.md
        claims-evidence.md
  blog/                 # 可留空或关闭
  src/                  # 自定义组件、样式
  static/
    CNAME               # 绑定 help.yourdomain.com 时需要
  docusaurus.config.ts
  sidebars.ts
  package.json
  .github/workflows/deploy.yml
```

---

## `docusaurus.config.ts` 关键片段

把默认模板中的配置替换或合并：

```ts
import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';

const config: Config = {
  title: 'LiqPass Docs',
  tagline: '爆仓保 / LiqPass — 使用帮助与审计说明',
  url: 'https://help.yourdomain.com',         // 若暂未绑定，先用 GitHub Pages URL
  baseUrl: '/',                                 // 自定义域名下保持 '/'
  favicon: 'img/favicon.ico',
  organizationName: '<your-username>',         // GitHub 用户或 org
  projectName: 'leverageguard-docs',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // —— i18n：中文为默认，英语为第二语言 ——
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en'],
    localeConfigs: {
      'zh-CN': {label: '简体中文'},
      en: {label: 'English'},
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.ts'),
          editUrl: 'https://github.com/<your-username>/leverageguard-docs/tree/main/',
        },
        blog: false, // V1 不使用 Blog
        theme: {customCss: require.resolve('./src/css/custom.css')},
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'LiqPass',
      logo: {alt: 'LiqPass', src: 'img/logo.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'default', position: 'left', label: '文档'},
        {href: 'https://yourdomain.com', label: '返回主站', position: 'right'},
        {type: 'localeDropdown', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {title: '产品', items: [{label: '主页', href: 'https://yourdomain.com'}]},
        {title: '合规', items: [{label: '透明度', href: 'https://yourdomain.com/transparency'}]},
        {title: '帮助', items: [{label: 'FAQ', to: '/docs/faq'}]},
      ],
      copyright: `© ${new Date().getFullYear()} LiqPass` ,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
};

export default config;
```

> 若暂不绑定自定义域，把 `url` 设置为 `https://<your-username>.github.io`，`baseUrl` 设为 `'/leverageguard-docs/'`，等绑定域名后再改回 `baseUrl: '/'`。

---

## `sidebars.ts`（简单版）

```ts
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  default: [
    {type: 'doc', id: 'quick-start'},
    {type: 'doc', id: 'claims-evidence'},
    {type: 'doc', id: 'faq'},
  ],
};

export default sidebars;
```

---

## 三篇核心文档（中文原稿 + 英文镜像）

> 先在 `docs/` 写中文，随后复制到 `i18n/en/...` 目录写英文版。

### `docs/quick-start.md`

```md
---
id: quick-start
title: 快速开始（Quick Start）
sidebar_position: 1
---

本页解释如何使用 LiqPass：购买、验证 API、提交理赔、查看上链记录。

## 用户路径
1. 连接钱包（Base）。
2. 在「产品页」选本金与杠杆，完成 USDC 支付。
3. 在「API 设置」绑定交易所只读 API（OKX / Binance）。
4. 在「订单」中选择需要理赔的订单，进入「发起理赔」。
5. 点击「验证」获取证据摘要与预计赔付。
6. 点击「赔付」上链，合约将 USDC 转至你的钱包。
```

### `docs/claims-evidence.md`

```md
---
id: claims-evidence
title: 理赔与证据（Claims & Evidence）
sidebar_position: 2
---

### 证据来源与校验
- 读取交易所订单（只读 API），校验：订单号后 4 位、方向、交易对、数量*价格闭合、时间偏差等。
- 生成「证明片段」与可审计哈希（如 keccak256 摘要）。

### 赔付触发
- 达成爆仓/强平条件，或达到产品的赔付判定规则，即可发起赔付。
- 前端展示：`eligible: true/false` 与 `reasons[]`。

### 上链与可审计性
- 赔付由合约 `claimPayout` 触发，交易哈希可在 BaseScan 查询。
- 证据的 Merkle Root 与摘要会记录到链上事件或透明度页。
```

### `docs/faq.md`

```md
---
id: faq
title: 常见问题（FAQ）
sidebar_position: 3
---

**Q: 需要哪些权限？**  仅交易所只读 API，不需要交易权限。

**Q: 赔付谁来出 gas？**  由发起理赔的钱包支付 gas，合约将 USDC 汇至该钱包。

**Q: 如何核验订单？**  在理赔页输入订单号，系统从交易所拉取并校验字段后给出结果。
```

> 英文镜像：在 `i18n/en/docusaurus-plugin-content-docs/current/` 下创建同名 `.md`，翻译对应内容。

---

## GitHub Actions：自动部署 Pages

`.github/workflows/deploy.yml`

```yaml
name: Deploy Docusaurus to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> 仓库 Settings → Pages：**Source = GitHub Actions**。首次构建完成后，会得到 `https://<your-username>.github.io/leverageguard-docs/` 或你的自定义域。

---

## 绑定自定义域

1. DNS：`help.yourdomain.com` → CNAME → `<your-username>.github.io`。
2. 在项目 `static/CNAME` 写入：

   ```
   help.yourdomain.com
   ```
3. 等待证书签发与缓存更新（通常几分钟到数十分钟）。

> 未来切换到 Cloudflare Pages：DNS 依旧指向 Cloudflare；在 CF Pages 里配置构建命令 `npm run build` 与产物目录 `build/` 即可。

---

## 主站 301 跳转 `/help`

### Nginx

```nginx
location /help {
  return 301 https://help.yourdomain.com$request_uri;
}
```

### Express（Node）

```ts
app.get('/help*', (req, res) => {
  res.redirect(301, `https://help.yourdomain.com${req.originalUrl.replace(/^\/help/, '')}`);
});
```

---

## i18n 维护要点

* 中文为默认语言，英文放在 `i18n/en/...`。
* 需改动文档时：先改中文，再同步英文。
* 术语表：在 `docs/glossary.md` 与 `i18n/en/.../glossary.md` 维护关键名词。

---

## 搜索：V1 → 浏览器搜索；V2 → Algolia DocSearch

* V1：浏览器原生搜索已够用。
* V2：申请 Algolia DocSearch（免费层）后，在 `themeConfig.algolia` 写入：

```ts
algolia: {
  appId: '...',
  apiKey: '...',
  indexName: 'liqpass',
},
```

---

## 协作与发布流程（PR 驱动）

1. 开一个分支：`docs/feature-xxx`。
2. 提交修改并发 PR，要求 1 名 Reviewer 审核（启用分支保护）。
3. 合并到 `main` 后自动部署。

### `CODEOWNERS`（可选）

```
*  @your-team/docs-maintainers
/docs/*  @your-handle
```

---

## Cloudflare Pages 备选（可晚点切换）

* 新建项目 → 连接到 `leverageguard-docs`。
* 构建命令：`npm ci && npm run build`
* 产物目录：`build`
* 绑定自定义域：`help.yourdomain.com` CNAME 到 CF Pages 提供的目标。

> 切换成本低。需要更强 CDN/规则时再迁移。

---

## 质量基线与风格

* 语气：中立、说明书式；避免夸张形容。
* 结构：左侧三篇核心文档 + 未来扩展（版本化、透明度术语、API 参考）。
* 样式：如需与主站对齐，把主站配色/Logo 放到 `src/css/custom.css` 与 `static/img/`。

---

## 给 AI 的执行卡（可复制给你的自动化工具）

**Card D1 — 初始化仓库**

* 任务：用 Docusaurus TypeScript 模板创建 `leverageguard-docs`，提交到 `main`。
* 步骤：执行 TL;DR 第 2、6 步；提交信息 `docs: bootstrap docusaurus`。

**Card D2 — 启用双语与导航**

* 任务：在 `docusaurus.config.ts` 配置 `i18n`、`navbar`、关闭 blog。
* 验收：本地 `npm run start` 可见语言下拉；侧边栏显示三篇条目。

**Card D3 — 三篇核心文档**

* 任务：创建 `docs/quick-start.md`、`claims-evidence.md`、`faq.md`；英文镜像到 `i18n/en/...`。
* 验收：本地可切换中英且链接正确。

**Card D4 — 部署工作流**

* 任务：添加 `.github/workflows/deploy.yml`；打开 GitHub Pages（Actions）。
* 验收：合并后生成公开 URL。

**Card D5 — 自定义域名**

* 任务：添加 `static/CNAME`，配置 DNS CNAME；在 `docusaurus.config.ts` 设置 `url`、`baseUrl`。
* 验收：`https://help.yourdomain.com` 正常访问。

**Card D6 — 主站跳转**

* 任务：在主站新增 `/help` → 301 到 `help.yourdomain.com`；补一个离线 FAQ 兜底页。
* 验收：断网或外部站挂时，主站仍能显示简要帮助。

---

## 故障排查速查

* **页面 404**：检查 `baseUrl` 与自定义域是否一致；CNAME 生效需要时间。
* **样式错乱**：确认 `build/` 完整上传；清理浏览器缓存。
* **英文缺内容**：别忘了在 `i18n/en/...` 放置对应文档。
* **Actions 报错**：固定 Node 版本 20；`npm ci` 用 lockfile。

---

## 下一步（V2 以后）

* 文档版本化（`npm run docusaurus docs:version 1.0`）。
* 接入 Algolia DocSearch。
* 透明度页术语与指标定义（与产品数据口径统一）。
* API 参考（/settings/api, /orders, /claims, /evidence 等路由的请求与响应示例）。
