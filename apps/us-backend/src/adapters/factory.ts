// 交易所适配器工厂
import { ExchangeAdapter } from './base.js';
import OKXAdapter from './okx.js';
import BinanceAdapter from './binance.js';
import HyperliquidAdapter from './hyperliquid.js';

// 支持的交易所类型
export type ExchangeType = 'okx' | 'binance' | 'hyperliquid';

// 适配器工厂类
export class ExchangeAdapterFactory {
  private static adapters: Map<ExchangeType, ExchangeAdapter> = new Map();

  static {
    // 注册所有适配器
    this.adapters.set('okx', new OKXAdapter());
    this.adapters.set('binance', new BinanceAdapter());
    this.adapters.set('hyperliquid', new HyperliquidAdapter());
  }

  /**
   * 获取指定交易所的适配器
   */
  static getAdapter(exchange: ExchangeType): ExchangeAdapter {
    const adapter = this.adapters.get(exchange);
    if (!adapter) {
      throw new Error(`Unsupported exchange: ${exchange}`);
    }
    return adapter;
  }

  /**
   * 获取所有支持的交易所列表
   */
  static getSupportedExchanges(): ExchangeType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 检查交易所是否支持
   */
  static isSupported(exchange: string): exchange is ExchangeType {
    return this.adapters.has(exchange as ExchangeType);
  }

  /**
   * 获取所有适配器的信息
   */
  static getAllAdaptersInfo() {
    return Array.from(this.adapters.entries()).map(([type, adapter]) => ({
      type,
      name: adapter.name,
      caps: adapter.getSupportedCaps()
    }));
  }
}

export default ExchangeAdapterFactory;