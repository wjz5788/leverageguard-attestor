import type { LocalizedText } from '../router';

export type ExchangeId = 'OKX' | 'Binance';

export interface ExchangeOption {
  id: ExchangeId;
  label: LocalizedText;
  description: LocalizedText;
}

export const EXCHANGE_OPTIONS: ExchangeOption[] = [
  {
    id: 'OKX',
    label: { zh: 'OKX', en: 'OKX' },
    description: {
      zh: '支持 BTC-USDT-SWAP 与 BTC-USDC-SWAP 永续合约',
      en: 'Supports BTC-USDT-SWAP and BTC-USDC-SWAP perpetual contracts',
    },
  },
  {
    id: 'Binance',
    label: { zh: 'Binance', en: 'Binance' },
    description: {
      zh: '支持 BTCUSDT 与 BTCUSDC 永续合约',
      en: 'Supports BTCUSDT and BTCUSDC perpetual contracts',
    },
  },
];

export type TradingPairId = 'BTC-USDT-SWAP' | 'BTC-USDC-SWAP' | 'BTCUSDT' | 'BTCUSDC';

export interface TradingPairOption {
  id: TradingPairId;
  exchangeId: ExchangeId;
  label: LocalizedText;
  notice: LocalizedText;
  expectedInstType?: string;
  expectedContractType?: string;
}

export const TRADING_PAIR_OPTIONS: TradingPairOption[] = [
  {
    id: 'BTC-USDT-SWAP',
    exchangeId: 'OKX',
    label: { zh: 'BTC-USDT-SWAP 永续', en: 'BTC-USDT-SWAP Perpetual' },
    notice: {
      zh: 'USDT 保证金 · 永续合约 · 正向',
      en: 'USDT collateral · Perpetual · Linear',
    },
    expectedInstType: 'SWAP',
  },
  {
    id: 'BTC-USDC-SWAP',
    exchangeId: 'OKX',
    label: { zh: 'BTC-USDC-SWAP 永续', en: 'BTC-USDC-SWAP Perpetual' },
    notice: {
      zh: 'USDC 保证金 · 永续合约 · 正向',
      en: 'USDC collateral · Perpetual · Linear',
    },
    expectedInstType: 'SWAP',
  },
  {
    id: 'BTCUSDT',
    exchangeId: 'Binance',
    label: { zh: 'BTCUSDT 永续', en: 'BTCUSDT Perpetual' },
    notice: {
      zh: 'USDT 保证金 · 永续合约 · U 本位',
      en: 'USDT collateral · Perpetual · USDT-margined',
    },
    expectedContractType: 'PERPETUAL',
  },
  {
    id: 'BTCUSDC',
    exchangeId: 'Binance',
    label: { zh: 'BTCUSDC 永续', en: 'BTCUSDC Perpetual' },
    notice: {
      zh: 'USDC 保证金 · 永续合约 · U 本位',
      en: 'USDC collateral · Perpetual · USDC-margined',
    },
    expectedContractType: 'PERPETUAL',
  },
];

export function findExchangeOption(id: ExchangeId): ExchangeOption | undefined {
  return EXCHANGE_OPTIONS.find((option) => option.id === id);
}

export function getPairsForExchange(exchangeId: ExchangeId): TradingPairOption[] {
  return TRADING_PAIR_OPTIONS.filter((pair) => pair.exchangeId === exchangeId);
}

export function findPairOption(id: TradingPairId): TradingPairOption | undefined {
  return TRADING_PAIR_OPTIONS.find((pair) => pair.id === id);
}
