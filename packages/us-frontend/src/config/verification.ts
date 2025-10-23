import type { LocalizedText } from '../router';

export type ExchangeId = 'OKX' | 'Binance';

export interface ExchangeOption {
  id: ExchangeId;
  label: LocalizedText;
  description: LocalizedText;
}

export const EXCHANGES: ExchangeOption[] = [
  {
    id: 'okx',
    label: { zh: 'OKX', en: 'OKX' },
    description: {
      zh: 'Supports BTC-USDT-SWAP and BTC-USDC-SWAP perpetual contracts',
      en: 'Supports BTC-USDT-SWAP and BTC-USDC-SWAP perpetual contracts',
    },
    envs: ['prod', 'demo'],
  },
  {
    id: 'binance',
    label: { zh: 'Binance', en: 'Binance' },
    description: {
      zh: 'Supports BTCUSDT and BTCUSDC perpetual contracts',
      en: 'Supports BTCUSDT and BTCUSDC perpetual contracts',
    },
    envs: ['prod', 'test'],
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
    label: { zh: 'BTC-USDT-SWAP Perpetual', en: 'BTC-USDT-SWAP Perpetual' },
    notice: {
      zh: 'USDT collateral · Perpetual · Linear',
      en: 'USDT collateral · Perpetual · Linear',
    },
    expectedInstType: 'SWAP',
  },
  {
    id: 'BTC-USDC-SWAP',
    exchangeId: 'OKX',
    label: { zh: 'BTC-USDC-SWAP Perpetual', en: 'BTC-USDC-SWAP Perpetual' },
    notice: {
      zh: 'USDC collateral · Perpetual · Linear',
      en: 'USDC collateral · Perpetual · Linear',
    },
    expectedInstType: 'SWAP',
  },
  {
    id: 'BTCUSDT',
    exchangeId: 'Binance',
    label: { zh: 'BTCUSDT Perpetual', en: 'BTCUSDT Perpetual' },
    notice: {
      zh: 'USDT collateral · Perpetual · USDT-margined',
      en: 'USDT collateral · Perpetual · USDT-margined',
    },
    expectedContractType: 'PERPETUAL',
  },
  {
    id: 'BTCUSDC',
    exchangeId: 'Binance',
    label: { zh: 'BTCUSDC Perpetual', en: 'BTCUSDC Perpetual' },
    notice: {
      zh: 'USDC collateral · Perpetual · USDC-margined',
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
