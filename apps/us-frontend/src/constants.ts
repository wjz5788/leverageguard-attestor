// 主题常量
export const THEME = {
  bg: "#FFF7ED", // 暖米
  fg: "#3F2E20", // 暖灰
  border: "stone-200",
} as const;

// Base网络配置
export const BASE_MAINNET = {
  chainId: "0x2105",
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"]
} as const;

export const BASE_SEPOLIA = {
  chainId: "0x14A34",
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"]
} as const;

// API配置键
export const API_BASE_KEY = 'liqpass.apiBase';
export const API_READ_KEY = 'liqpass.readKey';

// 主导航配置
export const MAIN_NAV = [
  { label: "Products", to: "/products" },
  { label: "Verify", to: "/verify" },
  { label: "Transparency", to: "/transparency" },
  { label: "Help", to: "/help" },
] as const;

// 账户菜单配置
export const ACCOUNT_MENU_ITEMS = [
  { label: "订单管理", to: "/orders" },
  { label: "赔付管理", to: "/claims" },
  { label: "API 设置", to: "/settings/api" },
] as const;

// 产品列表
export const PRODUCTS = [
  { k: "Payment Links", d: "创建可分享的支付链接，USDC on Base" },
  { k: "Attestations", d: "链上凭证与保单映射" },
  { k: "Risk Controls", d: "等待期、限赔、黑名单" },
  { k: "Payouts", d: "一键触发链上赔付" },
] as const;

// Base主网智能合约配置
export const CHECKOUT_CONTRACT_ADDRESS =
  import.meta.env.VITE_CHECKOUT_CONTRACT_ADDRESS ||
  import.meta.env.VITE_CHECKOUT_USDC_ADDRESS || // 兼容旧字段
  "0xc423c34b57730ba87fb74b99180663913a345d68";
export const BASE_USDC_ADDRESS =
  import.meta.env.VITE_BASE_USDC_ADDRESS ||
  import.meta.env.VITE_CHECKOUT_USDC_ADDRESS || // 兼容旧字段写法
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || "0xaa1f4df6fc3ad033cc71d561689189d11ab54f4b";
export const BASE_RPC = import.meta.env.VITE_BASE_RPC || "https://mainnet.base.org";

// 透明度信息
export const TRANSPARENCY_ITEMS = [
  { k: "合约地址", v: "0x0000000000000000000000000000000000dEaD" },
  { k: "审计报告", v: "v1.0 摘要，升级策略：受控" },
  { k: "储备金/赔付池", v: "本页展示快照与外链" },
  { k: "指标", v: "赔付中位时长、成功率、GMV 等" },
] as const;
