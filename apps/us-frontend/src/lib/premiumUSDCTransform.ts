import { toUSDC6d } from './usdcUtils.ts';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * 递归地遍历对象/数组，将 premiumUSDC 字段转换为 premiumUSDC_6d 字符串。
 * 会在原地修改传入的数据结构，并删除所有 premiumUSDC 字段。
 */
export function normalizePremiumUSDCFields<T extends JsonValue>(payload: T): T {
  return transformPremiumUSDC(payload) as T;
}

function transformPremiumUSDC(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = transformPremiumUSDC(value[i]);
    }
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, JsonValue>;

    if (Object.prototype.hasOwnProperty.call(record, 'premiumUSDC')) {
      if (!Object.prototype.hasOwnProperty.call(record, 'premiumUSDC_6d')) {
        record.premiumUSDC_6d = String(toUSDC6d(record.premiumUSDC as number | string));
      }
      delete record.premiumUSDC;
    }

    if (
      Object.prototype.hasOwnProperty.call(record, 'premiumUSDC_6d') &&
      record.premiumUSDC_6d !== undefined &&
      record.premiumUSDC_6d !== null &&
      typeof record.premiumUSDC_6d !== 'string'
    ) {
      record.premiumUSDC_6d = String(record.premiumUSDC_6d as string | number | boolean);
    }

    for (const key of Object.keys(record)) {
      record[key] = transformPremiumUSDC(record[key]);
    }

    return record;
  }

  return value;
}
