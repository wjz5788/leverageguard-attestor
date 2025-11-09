/**
 * USDC 6位整数转换工具
 * 1 USDC = 1_000_000 (6位小数)
 */

/**
 * 将6位整数转换为USDC小数
 * @param usdc6d 6位整数（1表示0.000001 USDC）
 * @returns USDC小数金额
 */
export function fromUSDC6d(usdc6d: number | string): number {
  const num = typeof usdc6d === 'string' ? parseInt(usdc6d, 10) : usdc6d;
  return num / 1_000_000;
}

/**
 * 将USDC小数转换为6位整数
 * @param usdc USDC小数金额
 * @returns 6位整数
 */
export function toUSDC6d(usdc: number | string): number {
  const num = typeof usdc === 'string' ? parseFloat(usdc) : usdc;
  return Math.round(num * 1_000_000);
}

/**
 * 格式化USDC金额为显示字符串
 * @param usdc6d 6位整数
 * @param minimumFractionDigits 最少小数位数
 * @param maximumFractionDigits 最多小数位数
 * @returns 格式化字符串
 */
export function formatUSDC6d(
  usdc6d: number | string | null | undefined,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2
): string {
  if (usdc6d === null || usdc6d === undefined) return '-';
  
  const num = typeof usdc6d === 'string' ? parseInt(usdc6d, 10) : usdc6d;
  if (Number.isNaN(num)) return '-';
  
  const usdc = fromUSDC6d(num);
  return usdc.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits
  }) + ' USDC';
}

/**
 * 旧版兼容：处理可能的小数或6位整数输入
 * @param value 可能的小数或6位整数
 * @returns 格式化USDC字符串
 */
export function fmtUSDCCompat(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '-';
  
  // 如果数值很大，假设是6位整数；否则是小数
  const is6d = num > 1000 || (num > 0 && num < 0.01);
  const usdc = is6d ? fromUSDC6d(num) : num;
  
  return usdc.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' USDC';
}