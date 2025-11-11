import { ApiConfig } from './types';

// 构建支付链接
export function buildLink(sku: string, asset: string, price: number, expires: number): string {
  return `https://liq.pass/cover/${sku}?asset=${asset}&price=${price}USDC&exp=${expires}h`;
}

// 获取API配置
export function getApiConfig(): ApiConfig {
  try {
    return {
      base: localStorage.getItem('liqpass.apiBase') || '',
      readKey: localStorage.getItem('liqpass.readKey') || ''
    };
  } catch {
    return { base: '', readKey: '' };
  }
}

// 保存API配置
export function saveApiConfig(base: string, readKey: string): boolean {
  try {
    localStorage.setItem('liqpass.apiBase', base);
    localStorage.setItem('liqpass.readKey', readKey);
    return true;
  } catch {
    return false;
  }
}

// 生成随机ID
export function generateId(): string {
  return Math.random().toString(36).slice(2);
}

// 截断地址
export function truncateAddress(address: string, startLength = 6, endLength = 4): string {
  if (!address) return '';
  if (address.length <= startLength + endLength) return address;
  return `${address.slice(0, startLength)}…${address.slice(-endLength)}`;
}

// 检查开发环境
export function isDevelopment(): boolean {
  try {
    const isViteProd = typeof import.meta !== "undefined" && (import.meta as any)?.env?.PROD;
    const isNodeProd = typeof process !== "undefined" && (process as any)?.env?.NODE_ENV === 'production';
    return !(isViteProd || isNodeProd);
  } catch {
    return false;
  }
}

// 运行自测
export function runSelfTests(): void {
  if (!isDevelopment()) return;

  // 1) 链接生成测试
  const expect = "https://liq.pass/cover/24h?asset=BTCUSDT&price=20USDC&exp=24h";
  console.assert(buildLink("24h", "BTCUSDT", 20, 24) === expect, "buildLink 输出不匹配");

  // 2) 变体参数测试
  const expect2 = "https://liq.pass/cover/8h?asset=ETHUSDT&price=15USDC&exp=8h";
  console.assert(buildLink("8h", "ETHUSDT", 15, 8) === expect2, "buildLink 变体测试失败");

  // 3) 工具函数测试
  const testAddr = "0x1234567890abcdef1234567890abcdef12345678";
  console.assert(truncateAddress(testAddr) === "0x1234…5678", "truncateAddress 测试失败");

  console.log("✅ 自测通过");
}

// 国际化函数
export function i18n(locale: "zh" | "en") {
  const zh = {
    hero: { badge: "支付链接", title: "一键生成 LiqPass 支付链接", subtitle: "复制链接即卖。USDC on Base，链上凭证自动关联。" },
    noWallet: "未检测到钱包。请安装 MetaMask 或使用兼容钱包。",
    linkCreated: "已生成支付链接（演示）。",
    copied: "已复制到剪贴板。",
  };

  const en = {
    hero: { badge: "Payment Links", title: "Create LiqPass payment links in seconds", subtitle: "Share a link to sell. USDC on Base with on‑chain attestations." },
    noWallet: "No wallet detected. Install MetaMask or a compatible wallet.",
    linkCreated: "Payment link created (demo).",
    copied: "Copied to clipboard.",
  };

  return locale === 'zh' ? zh : en;
}