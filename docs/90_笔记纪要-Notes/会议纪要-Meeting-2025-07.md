# 讨论7\n\n这是讨论��内容。
下面是一份**可直接运行的本地验证工具**（单文件版）。功能包括：

* 从 OKX 拉取**订单详情 / 成交（自动分页）/ 账单**；
* 在给定或自动推导的时间窗内识别**清算/ADL**强证据；
* 生成**证据包**（`order.json / fills.json / bills.json / meta.json`）；
* 计算**文件哈希与 Merkle Root**并输出 `merkle.json`；
* 产出**人类可读摘要**（`summary.json` 与 `summary.csv` 可增量写入）。

> 依赖：`python-dotenv`, `requests`, `pandas`（可选，若不用 CSV 可去掉），`tzdata`（部分系统）。
> 环境变量：`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`（只读 + IP 白名单）。

---

```python
# filename: okx_liquidation_verifier.py
# usage examples:
#   pip install -U requests python-dotenv pandas
#   export OKX_API_KEY=... OKX_SECRET_KEY=... OKX_PASSPHRASE=...
#   python okx_liquidation_verifier.py --ordId 1234567890123456789 --instId BTC-USDT-SWAP \
#       --out ./evidence/1234567890123456789 --csv ./evidence/summary.csv
#
#   # 指定时间窗（毫秒时间戳），仅 bills 过滤会用到；若不指定将自动从成交时间推导 ±15 分钟
#   python okx_liquidation_verifier.py --ordId ... --instId BTC-USDT-SWAP \
#       --beginMs 1710000000000 --endMs 1710000900000 --out ./evidence/...
#
#   # 仅计算某目录下证据的 Merkle（不发请求）
#   python okx_liquidation_verifier.py --inDir ./evidence/123... --only-merkle

import os, sys, json, time, hmac, base64, hashlib, argparse, math
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from typing import Dict, Any, List, Optional, Tuple
import requests
from requests.exceptions import RequestException
from dotenv import load_dotenv

try:
    import pandas as pd  # optional; used for CSV summary
except Exception:
    pd = None

BASE_URL = os.environ.get("OKX_BASE_URL", "https://www.okx.com")
API_KEY = os.environ.get("OKX_API_KEY")
API_SECRET = os.environ.get("OKX_SECRET_KEY")
PASSPHRASE = os.environ.get("OKX_PASSPHRASE")

USER_AGENT = "LeverageGuard-Local/1.0"
TIMEOUT = 15
RETRIES = 4
RETRY_BACKOFF = 1.6

# ---------- Helpers ----------

def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def okx_sign(ts: str, method: str, path_with_query: str, body: str, secret_key: str) -> str:
    msg = f"{ts}{method.upper()}{path_with_query}{body or ''}"
    mac = hmac.new(secret_key.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()

def req_okx(method: str, path: str, params: Dict[str, Any] = None, body_obj: Any = None) -> Dict[str, Any]:
    if not (API_KEY and API_SECRET and PASSPHRASE):
        raise RuntimeError("Missing OKX credentials in env: OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE")
    ts = iso_now()
    query = ""
    if params:
        query = "?" + urlencode(params, doseq=True, safe=":=,")
    full_path = path + query
    body = ""
    if body_obj is not None:
        body = json.dumps(body_obj, separators=(",", ":"), ensure_ascii=False)
    sign = okx_sign(ts, method, full_path, body, API_SECRET)
    headers = {
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "x-simulated-trading": "0",
    }
    url = BASE_URL + full_path
    last_err = None
    for i in range(RETRIES):
        try:
            resp = requests.request(method, url, headers=headers, data=body or None, timeout=TIMEOUT)
            # OKX 常为 200 + {"code": "0", "data": [...]}
            js = resp.json()
            if str(js.get("code")) == "0":
                return js
            # 某些错误有 msg，可重试有限次数
            last_err = {"status": resp.status_code, "body": js}
        except RequestException as e:
            last_err = {"exception": str(e)}
        if i < RETRIES - 1:
            time.sleep(RETRY_BACKOFF ** i)
    raise RuntimeError(f"OKX API error: {last_err}")

def to_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)

def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def merkle_root(hex_hashes: List[str]) -> Optional[str]:
    if not hex_hashes:
        return None
    layer = [bytes.fromhex(h) for h in hex_hashes]
    if len(layer) == 1:
        return "0x" + layer[0].hex()
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i] if i + 1 == len(layer) else layer[i + 1]
            nxt.append(hashlib.sha256(left + right).digest())
        layer = nxt
    return "0x" + layer[0].hex()

def ensure_dir(p: str):
    os.makedirs(p, exist_ok=True)

# ---------- OKX fetchers ----------

def get_order(ordId: str, instId: str) -> Dict[str, Any]:
    js = req_okx("GET", "/api/v5/trade/order", {"instId": instId, "ordId": ordId})
    arr = js.get("data") or []
    return arr[0] if arr else {}

def get_all_fills(ordId: str, instId: str, limit: int = 100, max_pages: int = 50) -> List[Dict[str, Any]]:
    # /api/v5/trade/fills-history supports pagination via 'after' or 'before'
    out: List[Dict[str, Any]] = []
    after = None
    pages = 0
    while True:
        params = {"instType": "SWAP", "instId": instId, "ordId": ordId, "limit": limit}
        if after:
            params["after"] = after
        js = req_okx("GET", "/api/v5/trade/fills-history", params)
        data = js.get("data") or []
        out.extend(data)
        pages += 1
        if not data or len(data) < limit or pages >= max_pages:
            break
        # 'after' should be the last id
        last_id = data[-1].get("billId") or data[-1].get("tradeId") or data[-1].get("fillId") or data[-1].get("ts")
        after = last_id
    return out

def get_bills(instId: str, begin_ms: Optional[int], end_ms: Optional[int], limit: int = 100, max_pages: int = 20) -> List[Dict[str, Any]]:
    # /api/v5/account/bills  (filters vary; we fetch pages and filter by ts locally)
    out: List[Dict[str, Any]] = []
    after = None
    pages = 0
    while True:
        params = {"instType": "SWAP", "instId": instId, "limit": limit}
        if after:
            params["after"] = after
        js = req_okx("GET", "/api/v5/account/bills", params)
        data = js.get("data") or []
        out.extend(data)
        pages += 1
        if not data or len(data) < limit or pages >= max_pages:
            break
        last_id = data[-1].get("billId") or data[-1].get("ts")
        after = last_id
        # polite delay
        time.sleep(0.2)
    # filter by time window if provided (OKX timestamps are in ms)
    if begin_ms is not None and end_ms is not None:
        flt = []
        for it in out:
            try:
                ts = int(it.get("ts") or 0)
            except Exception:
                ts = 0
            if begin_ms <= ts <= end_ms:
                flt.append(it)
        return flt
    return out

# ---------- Analysis ----------

LIQ_KEYWORDS = ("liquidat", "adl", "auto_deleverag", "force", "强平", "爆仓")

def detect_liquidation_signals(bills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    hits = []
    for b in bills:
        # robust: check multiple fields; OKX schemas may differ by account mode
        fields = []
        for k in ("type", "subType", "billType", "category", "tag", "reason"):
            v = str(b.get(k, "")).lower()
            if v:
                fields.append(v)
        blob = " ".join(fields)
        if any(kw in blob for kw in LIQ_KEYWORDS):
            hits.append(b)
            continue
        # fallback: certain numeric subtype codes (if any) could be mapped; keep everything with big negative pnl?
        pnl = b.get("pnl") or b.get("fillPnl") or b.get("profit")
        try:
            pnl_f = float(pnl)
        except Exception:
            pnl_f = 0.0
        if pnl_f < 0 and abs(pnl_f) > 1:  # heuristic fallback, not decisive
            # mark as candidate but with weaker flag
            b2 = dict(b)
            b2["_weakSignal"] = True
            hits.append(b2)
    return hits

def summarize_fills(fills: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_pnl = 0.0
    total_fee = 0.0
    notional_sum = 0.0
    n = 0
    ts_list = []
    for f in fills:
        n += 1
        try:
            ts_list.append(int(f.get("ts") or 0))
        except Exception:
            pass
        try:
            total_pnl += float(f.get("fillPnl") or 0)
        except Exception:
            pass
        try:
            total_fee += float(f.get("fee") or 0)
        except Exception:
            pass
        try:
            px = float(f.get("fillPx") or 0)
            sz = float(f.get("fillSz") or 0)
            notional_sum += px * sz  # approximate; contract size not applied
        except Exception:
            pass
    tmin = min(ts_list) if ts_list else None
    tmax = max(ts_list) if ts_list else None
    return {
        "total_fills": n,
        "total_pnl": round(total_pnl, 8),
        "total_fee": round(total_fee, 8),
        "approx_notional_sum": round(notional_sum, 8),
        "first_fill_ts": tmin,
        "last_fill_ts": tmax,
    }

# ---------- Evidence / IO ----------

def write_json(path: str, obj: Any):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

def compute_merkle_for_dir(in_dir: str, out_file: str) -> Tuple[str, List[Dict[str, str]]]:
    files = []
    for name in sorted(os.listdir(in_dir)):
        if not name.lower().endswith(".json"):
            continue
        if name == os.path.basename(out_file):
            continue
        p = os.path.join(in_dir, name)
        try:
            raw = open(p, "rb").read()
        except Exception:
            continue
        h = sha256_hex(raw)
        files.append({"file": name, "sha256": h})
    root = merkle_root([x["sha256"] for x in files])
    out = {"files": files, "merkleRoot": root}
    ensure_dir(os.path.dirname(out_file))
    write_json(out_file, out)
    return root or "", files

def save_summary(summary_path: Optional[str], row: Dict[str, Any]):
    if not summary_path:
        return
    if pd is None:
        # plain json lines fallback
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return
    df_new = pd.DataFrame([row])
    if not os.path.exists(summary_path):
        df_new.to_csv(summary_path, index=False, encoding="utf-8-sig")
    else:
        df_new.to_csv(summary_path, mode="a", header=False, index=False, encoding="utf-8-sig")

# ---------- Main flow ----------

def main():
    load_dotenv()

    ap = argparse.ArgumentParser(description="OKX liquidation verifier (local)")
    ap.add_argument("--ordId", help="OKX order id", required=False)
    ap.add_argument("--instId", help="e.g., BTC-USDT-SWAP", required=False)
    ap.add_argument("--beginMs", type=int, help="optional window start (ms)", default=None)
    ap.add_argument("--endMs", type=int, help="optional window end (ms)", default=None)
    ap.add_argument("--out", help="evidence output dir (will contain jsons)", default=None)
    ap.add_argument("--csv", help="append a row to CSV summary (path)", default=None)
    ap.add_argument("--inDir", help="if set with --only-merkle, compute merkle for this dir", default=None)
    ap.add_argument("--only-merkle", action="store_true", help="only compute merkle.json for --inDir")
    args = ap.parse_args()

    if args.only_merkle:
        if not args.inDir:
            print("--inDir required with --only-merkle", file=sys.stderr)
            sys.exit(2)
        out_merkle = os.path.join(args.inDir, "merkle.json")
        root, _ = compute_merkle_for_dir(args.inDir, out_merkle)
        print(f"Merkle Root: {root}")
        return

    if not args.ordId or not args.instId:
        print("--ordId and --instId are required unless --only-merkle", file=sys.stderr)
        sys.exit(2)

    ordId = args.ordId
    instId = args.instId
    out_dir = args.out or os.path.join(os.getcwd(), "evidence", ordId)
    ensure_dir(out_dir)

    # 1) Fetch order
    print(f"[1/5] Fetching order {ordId} ({instId}) ...")
    order = get_order(ordId, instId)
    write_json(os.path.join(out_dir, "order.json"), order)

    # 2) Fetch fills (auto pagination)
    print(f"[2/5] Fetching fills (paginated) ...")
    fills = get_all_fills(ordId, instId)
    write_json(os.path.join(out_dir, "fills.json"), fills)
    fill_sum = summarize_fills(fills)

    # 3) Determine window if not provided
    begin_ms = args.beginMs
    end_ms = args.endMs
    if begin_ms is None or end_ms is None:
        # auto window: [min(fills.ts)-15m, max(fills.ts)+15m], fallback to now±30m
        if fill_sum["first_fill_ts"] and fill_sum["last_fill_ts"]:
            pad = 15 * 60 * 1000
            begin_ms = int(fill_sum["first_fill_ts"]) - pad
            end_ms = int(fill_sum["last_fill_ts"]) + pad
        else:
            now_ms = to_ms(datetime.now(timezone.utc))
            begin_ms = now_ms - 30 * 60 * 1000
            end_ms = now_ms + 30 * 60 * 1000
    print(f"[3/5] Using bills window: {begin_ms} ~ {end_ms} (ms)")

    # 4) Fetch bills within/around window
    print(f"[4/5] Fetching bills ...")
    bills = get_bills(instId, begin_ms, end_ms)
    write_json(os.path.join(out_dir, "bills.json"), bills)

    # Detect liquidation signals
    liq_hits = detect_liquidation_signals(bills)
    has_strong = any(not h.get("_weakSignal") for h in liq_hits)
    liq_count = len(liq_hits)

    # 5) Write meta + Merkle
    meta = {
        "ordId": ordId,
        "instId": instId,
        "beginMs": begin_ms,
        "endMs": end_ms,
        "generatedAt": iso_now(),
        "tool": "LeverageGuard Local Verifier 1.0",
        "notes": "Publicly share only merkle.json and summary.json/csv; keep raw JSONs private."
    }
    write_json(os.path.join(out_dir, "meta.json"), meta)

    root, files = compute_merkle_for_dir(out_dir, os.path.join(out_dir, "merkle.json"))

    # 6) Human-friendly summary
    summary = {
        "ordId": ordId,
        "instId": instId,
        "window": {"beginMs": begin_ms, "endMs": end_ms},
        "fillSummary": fill_sum,
        "billsCount": len(bills),
        "liquidationSignals": liq_count,
        "hasStrongEvidence": has_strong,
        "merkleRoot": root,
        "evidenceFiles": [f["file"] for f in files],
        "generatedAt": iso_now()
    }
    write_json(os.path.join(out_dir, "summary.json"), summary)
    save_summary(args.csv, {
        "ordId": ordId,
        "instId": instId,
        "beginMs": begin_ms,
        "endMs": end_ms,
        "fills": fill_sum["total_fills"],
        "total_pnl": fill_sum["total_pnl"],
        "bills": len(bills),
        "liq_signals": liq_count,
        "has_strong": has_strong,
        "merkleRoot": root,
        "generatedAt": summary["generatedAt"]
    })

    # 7) Console report
    print("\n=== Verification Result ===")
    print(f"Order: {ordId} ({instId})")
    print(f"Fills: {fill_sum['total_fills']} | PnL: {fill_sum['total_pnl']} | Approx Notional: {fill_sum['approx_notional_sum']}")
    print(f"Bills in window: {len(bills)} | Liquidation/ADL signals: {liq_count} | StrongEvidence: {has_strong}")
    print(f"Merkle Root: {root}")
    print(f"Evidence dir: {out_dir}")
    print(f"Summary: {os.path.join(out_dir, 'summary.json')}")
    if args.csv:
        print(f"Appended CSV: {args.csv}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
```

---

### 运行提示（最快路径）

1. 设置只读 Key（白名单填你本地公网 IP），导出为环境变量：
   `export OKX_API_KEY=... OKX_SECRET_KEY=... OKX_PASSPHRASE=...`
2. 安装依赖：
   `pip install -U requests python-dotenv pandas`
3. 执行（自动推导时间窗并输出证据包 + 摘要 + Merkle Root）：

   ```bash
   python okx_liquidation_verifier.py \
     --ordId <你的订单ID> --instId BTC-USDT-SWAP \
     --out ./evidence/<订单ID> \
     --csv ./evidence/summary.csv
   ```
4. 产物位置：`./evidence/<订单ID>/`

   * `order.json / fills.json / bills.json / meta.json`（**私有保存**）
   * `merkle.json / summary.json`（**可公开**，用于 `/files/` 与上链存证）

> 拿到 `merkle.json` 里的 `merkleRoot` 与你公开的 `summary.json` 链接（或自定义摘要链接），就可以去 **Base 主网**用 `attest(root, uri)` 发起第一条存证事件了。
