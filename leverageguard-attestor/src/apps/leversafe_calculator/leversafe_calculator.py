"""
LeverSafe 爆仓保险计算器核心逻辑。

提供以下能力：
    * calculate_premium(principal, leverage)
    * calculate_payout(principal, leverage)
    * calculate_insurance(principal, leverage)

运行该脚本可快速查看预设样例的计算结果，或使用 CLI 指定本金与杠杆：

    python leversafe_calculator.py               # 打印默认样例
    python leversafe_calculator.py --principal 120 --leverage 35
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Tuple

MIN_PRINCIPAL = 50.0
MAX_PRINCIPAL = 500.0
MIN_LEVERAGE = 1.0
MAX_LEVERAGE = 200.0


@dataclass(frozen=True)
class InsuranceQuote:
    principal: float
    leverage: float
    premium: float
    premium_rate: float
    payout_ratio: float
    payout_amount: float


class ValidationError(ValueError):
    """输入参数验证错误。"""


def _ensure_range(value: float, min_v: float, max_v: float, label: str) -> float:
    if not (min_v <= value <= max_v):
        raise ValidationError(f"{label} 必须在 {min_v} ~ {max_v} 范围内，当前为 {value}")
    return float(value)


def calculate_premium(principal: float, leverage: float) -> Tuple[float, float]:
    """
    计算保费金额与费率。

    返回 (premium_amount, premium_rate)，其中 premium_rate 已经截断在 [0, 0.15]。
    """
    p = _ensure_range(principal, MIN_PRINCIPAL, MAX_PRINCIPAL, "本金")
    l = _ensure_range(leverage, MIN_LEVERAGE, MAX_LEVERAGE, "杠杆倍数")
    rate = 0.05 + (l - 20) * 0.001 + (p / 500) * 0.02
    rate = min(0.15, rate)
    rate = max(0.0, rate)
    premium = round(rate * p, 2)
    return premium, round(rate * 100, 2)


def calculate_payout(principal: float, leverage: float) -> Tuple[float, float]:
    """
    计算赔付比例与赔付金额。

    返回 (payout_ratio_percent, payout_amount)。
    """
    p = _ensure_range(principal, MIN_PRINCIPAL, MAX_PRINCIPAL, "本金")
    l = _ensure_range(leverage, MIN_LEVERAGE, MAX_LEVERAGE, "杠杆倍数")
    ratio = 0.25 + (l - 50) * 0.005 - (p / 500) * 0.1
    ratio = max(0.1, min(0.5, ratio))
    payout = round(ratio * p, 2)
    return round(ratio * 100, 2), payout


def calculate_insurance(principal: float, leverage: float) -> InsuranceQuote:
    premium, premium_rate = calculate_premium(principal, leverage)
    payout_ratio, payout_amount = calculate_payout(principal, leverage)
    return InsuranceQuote(
        principal=round(float(principal), 2),
        leverage=round(float(leverage), 2),
        premium=premium,
        premium_rate=premium_rate,
        payout_ratio=payout_ratio,
        payout_amount=payout_amount,
    )


def _format_quote(quote: InsuranceQuote) -> str:
    return (
        f"本金: {quote.principal:.2f} USDT\n"
        f"杠杆: {quote.leverage:.2f} x\n"
        f"保费: {quote.premium:.2f} USDT (费率 {quote.premium_rate:.2f}%)\n"
        f"赔付比例: {quote.payout_ratio:.2f}%\n"
        f"赔付金额: {quote.payout_amount:.2f} USDT"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="LeverSafe 爆仓保险计算器")
    parser.add_argument("--principal", type=float, help="本金 (50-500 USDT)")
    parser.add_argument("--leverage", type=float, help="杠杆倍数 (1-200)")
    args = parser.parse_args()

    cases = []
    if args.principal is not None and args.leverage is not None:
        cases.append((args.principal, args.leverage))
    else:
        cases.extend(
            [
                (100, 20),
                (500, 100),
                (100, 100),
            ]
        )

    for idx, (principal, leverage) in enumerate(cases, start=1):
        try:
            quote = calculate_insurance(principal, leverage)
        except ValidationError as exc:
            print(f"[{idx}] 输入无效: {exc}")
            continue
        print(f"\n案例 {idx}")
        print("-" * 20)
        print(_format_quote(quote))


if __name__ == "__main__":
    main()
