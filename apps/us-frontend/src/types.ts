// 钱包状态接口
export interface WalletState {
  address: string;
  chainId: string;
  onBase: boolean;
  busy: boolean;
  message: string;
  setMessage: (s: string) => void;
  connectWallet: () => Promise<void>;
  switchToBase: (testnet?: boolean) => Promise<void>;
  disconnectWallet?: () => void;
}

// Toast项目接口
export interface ToastItem {
  id: string;
  title: string;
  desc?: string;
  type?: "info" | "success" | "error";
}

// 导航项接口
export interface NavItem {
  label: string;
  to: string;
  exact?: boolean;
}

// 数据表格列定义
export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

// 面包屑项接口
export interface BreadcrumbItem {
  to?: string;
  label: string;
}

// 国际化字典类型
export interface Dictionary {
  hero: {
    badge: string;
    title: string;
    subtitle: string;
  };
  noWallet: string;
  linkCreated: string;
  copied: string;
}

// API配置接口
export interface ApiConfig {
  base: string;
  readKey: string;
}