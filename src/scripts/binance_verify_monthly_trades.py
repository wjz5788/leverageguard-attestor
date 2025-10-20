#!/usr/bin/env python3

"""
Binance USDC-M Futures monthly trade summarizer.

Usage:
    python binance_verify_monthly_trades.py --symbol CRVUSDC --month 2025-10

Environment variables (or env/binance.env):
    BINANCE_API_KEY
    BINANCE_SECRET_KEY
"""

import argparse
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd
import requests
from dotenv import load_dotenv
from urllib.parse import urlencode

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = os.getenv("BINANCE_ENV_FILE", REPO_ROOT / "env" / "binance.env")
OUTPUT_DIR = Path(os.getenv("BINANCE_REPORT_DIR", REPO_ROOT / "data" / "reports"))

if Path(ENV_FILE).exists():
    load_dotenv(ENV_FILE)
else:
    load_dotenv()

API_KEY = os.getenv("BINANCE_API_KEY")
API_SECRET = os.getenv("BINANCE_SECRET_KEY")

BASE_URL = "https://fapi.binance.com"


def require_credentials() -> Tuple[str, str]:
    if not API_KEY or not API_SECRET:
        raise SystemExit("缺少 BINANCE_API_KEY/BINANCE_SECRET_KEY 环境变量。请在 env/binance.env 中配置。")
    return API_KEY, API_SECRET


def get_current_ip() -> str:
    try:
        resp = requests.get("https://httpbin.org/ip", timeout=5)
        resp.raise_for_status()
        return resp.json().get("origin", "unknown")
    except Exception:
        return "IP查询失败"


def create_signature(query_string: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), query_string.encode("utf-8"), hashlib.sha256).hexdigest()


def parse_month(month: str) -> Tuple[int, int]:
    dt = datetime.strptime(month, "%Y-%m")
    start = int(datetime(dt.year, dt.month, 1, tzinfo=timezone.utc).timestamp() * 1000)
    if dt.month == 12:
        next_month = datetime(dt.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(dt.year, dt.month + 1, 1, tzinfo=timezone.utc)
    end = int(next_month.timestamp() * 1000)
    return start, end


def fetch_monthly_trades(
    symbol: str,
    start_ms: int,
    end_ms: int,
    min_value_usd: float,
) -> Tuple[List[Dict[str, Any]], float, List[Dict[str, Any]]]:
    api_key, api_secret = require_credentials()

    endpoint = "/fapi/v1/userTrades"
    params = {
        "symbol": symbol,
        "startTime": start_ms,
        "endTime": end_ms,
        "limit": 1000,
    }
    query_string = urlencode(params)
    params["signature"] = create_signature(query_string, api_secret)
    headers = {"X-MBX-APIKEY": api_key}

    url = f"{BASE_URL}{endpoint}?{urlencode(params)}"
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    trades = response.json()

    trade_data: List[Dict[str, Any]] = []
    liquidations: List[Dict[str, Any]] = []
    total_pnl = 0.0

    for trade in trades:
        pnl = float(trade.get("realizedPnl", 0))
        total_pnl += pnl
        qty = float(trade["qty"])
        price = float(trade["price"])
        value = qty * price
        is_buyer = "买入" if trade.get("isBuyer") else "卖出"
        side = "平空仓" if is_buyer == "买入" else "平多仓"

        trade_row = {
            "交易ID": trade["id"],
            "时间": datetime.fromtimestamp(trade["time"] / 1000).strftime("%Y-%m-%d %H:%M:%S"),
            "方向": is_buyer,
            "数量": round(qty, 6),
            "价格": round(price, 6),
            "价值 (USDC)": round(value, 2),
            "实现盈亏 (USDC)": round(pnl, 4),
            "手续费 (USDC)": float(trade.get("commission", 0)),
            "平仓类型": side,
        }
        trade_data.append(trade_row)

        if pnl < 0 and value >= min_value_usd:
            liquidations.append(trade_row)

    return trade_data, total_pnl, liquidations


def save_report(
    symbol: str,
    month: str,
    trade_data: List[Dict[str, Any]],
    total_pnl: float,
    liquidations: List[Dict[str, Any]],
) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{symbol}_{month}_trades.json"
    payload = {
        "symbol": symbol,
        "month": month,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "total_pnl": round(total_pnl, 4),
        "count": len(trade_data),
        "liquidations": liquidations,
        "trades": trade_data,
    }
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="查询币安月度交易并输出报告")
    parser.add_argument("--symbol", default=os.getenv("BINANCE_SYMBOL", "CRVUSDC"), help="交易对，例如 CRVUSDC")
    parser.add_argument("--month", default=datetime.now().strftime("%Y-%m"), help="月份 (YYYY-MM)")
    parser.add_argument("--min-value", type=float, default=float(os.getenv("BINANCE_MIN_VALUE_USD", "100")), help="爆仓阈值（USDC）")
    args = parser.parse_args()

    start_ms, end_ms = parse_month(args.month)
    end_display = datetime.fromtimestamp((end_ms - 1) / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    print(f"云服务器IP: {get_current_ip()} （白名单确认）")
    print(f"查询交易对: {args.symbol}")
    print(f"时间范围: {args.month}-01 ~ {end_display} UTC")

    try:
        trade_data, total_pnl, liquidations = fetch_monthly_trades(
            symbol=args.symbol,
            start_ms=start_ms,
            end_ms=end_ms,
            min_value_usd=args.min_value,
        )
    except requests.HTTPError as exc:
        print(f"API请求失败: {exc.response.status_code} {exc.response.text}")
        raise SystemExit(1) from exc
    except Exception as exc:
        print(f"查询失败: {exc}")
        raise SystemExit(1) from exc

    if not trade_data:
        print("本月无交易记录。")
        return

    df = pd.DataFrame(trade_data)
    print("\n=== 本月交易详情 ===")
    print(df.to_string(index=False))

    print("\n=== 本月汇总 ===")
    print(f"总交易条数: {len(trade_data)}")
    print(f"累计实现盈亏: {round(total_pnl, 4)} USDC")
    if liquidations:
        print(f"潜在爆仓记录: {len(liquidations)} 条")
        liq_df = pd.DataFrame(liquidations)
        print(liq_df[["交易ID", "时间", "价值 (USDC)", "实现盈亏 (USDC)"]].to_string(index=False))
    else:
        print("无爆仓记录（负盈亏 + >=阈值）。")

    report_path = save_report(args.symbol, args.month, trade_data, total_pnl, liquidations)
    print(f"\n详情已导出到 {report_path}")


if __name__ == "__main__":
    main()

