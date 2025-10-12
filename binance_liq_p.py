#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Quick liquidation probability estimator for Binance USDⓈ-M futures.

This script fetches Mark Price 1m klines, estimates the short-term volatility,
and applies the first-passage approximation (reflection principle) to derive a
liquidation probability p-value over requested horizons.
"""

import argparse
import json
import math
import time
from statistics import pstdev
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "https://fapi.binance.com"


def http_get(path: str, params: dict) -> list:
    """Perform a lightweight GET request and decode the JSON payload."""
    url = f"{BASE}{path}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "liq-prob/1.0"})
    with urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode())


def fetch_mark_close_prices(symbol: str, minutes: int) -> list:
    """Fetch recent Mark Price 1m klines and return close prices."""
    limit = max(50, min(minutes + 5, 1500))
    data = http_get("/fapi/v1/markPriceKlines", {
        "symbol": symbol,
        "interval": "1m",
        "limit": limit,
    })
    closes = [float(kline[4]) for kline in data]
    if len(closes) < 3:
        raise RuntimeError("Not enough data returned to compute volatility")
    return closes[-minutes - 1:]


def realized_sigma_per_minute(closes: list) -> float:
    """Estimate per-minute log-return volatility using population stddev."""
    rets = []
    for i in range(1, len(closes)):
        if closes[i - 1] <= 0 or closes[i] <= 0:
            continue
        rets.append(math.log(closes[i] / closes[i - 1]))
    if not rets:
        raise RuntimeError("Unable to compute log returns")
    return pstdev(rets)


def approx_liq_price(entry: float, side: str, lev: float, mmr: float) -> float:
    """Approximate liquidation price ignoring fees/funding for ISO margin."""
    if side.lower() == "long":
        return entry * (1 - 1.0 / lev + mmr)
    return entry * (1 + 1.0 / lev - mmr)


def first_passage_prob_zero_drift(distance: float,
                                  sigma_per_min: float,
                                  minutes: int) -> float:
    """Compute first-touch probability assuming zero drift."""
    if distance <= 0:
        return 1.0
    denom = sigma_per_min * math.sqrt(max(minutes, 1))
    if denom == 0:
        return 0.0
    x = -distance / denom
    phi = 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))
    probability = 2.0 * phi
    return max(0.0, min(1.0, probability))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Binance Mark-Price liquidation probability estimator"
    )
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--side", choices=["long", "short"], default="long")
    parser.add_argument("--lev", type=float, default=20,
                        help="leverage, e.g. 20")
    parser.add_argument("--mmr", type=float, default=0.004,
                        help="maintenance margin ratio (e.g. 0.004 = 0.4%)")
    parser.add_argument("--hours", type=float, nargs="*", default=[8, 24, 72],
                        help="time horizons in hours")
    args = parser.parse_args()

    minutes_needed = int(max(args.hours) * 60) + 10
    closes = fetch_mark_close_prices(args.symbol, minutes_needed)
    entry = closes[-1]
    sigma_min = realized_sigma_per_minute(closes)

    liq = approx_liq_price(entry, args.side, args.lev, args.mmr)
    distance = abs(math.log(liq / entry))

    output = {
        "symbol": args.symbol,
        "side": args.side,
        "entry_mark": entry,
        "lev": args.lev,
        "mmr": args.mmr,
        "approx_liq_price": liq,
        "distance_log": distance,
        "sigma_per_min": sigma_min,
        "ts": int(time.time() * 1000),
        "p": {},
    }
    for hours in args.hours:
        mins = int(hours * 60)
        output["p"][f"{hours}h"] = first_passage_prob_zero_drift(
            distance, sigma_min, mins
        )

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
