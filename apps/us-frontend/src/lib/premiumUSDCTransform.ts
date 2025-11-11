import { toUSDC6d } from './usdcUtils.ts';

export type JsonValue =
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
      // 只有当 premiumUSDC_6d 不存在或为空时才进行转换
      if (!Object.prototype.hasOwnProperty.call(record, 'premiumUSDC_6d') || 
          record.premiumUSDC_6d === null || 
          record.premiumUSDC_6d === undefined ||
          record.premiumUSDC_6d === '') {
        const normalized = tryNormalizePremiumUSDC(record.premiumUSDC);
        if (normalized !== undefined) {
          record.premiumUSDC_6d = normalized;
        }
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

function tryNormalizePremiumUSDC(value: JsonValue | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return String(toUSDC6d(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      return undefined;
    }

    return String(toUSDC6d(numericValue));
  }

  return undefined;
}
