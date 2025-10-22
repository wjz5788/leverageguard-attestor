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

import os, sys, json, time, hmac, base64, hashlib, argparse, secrets
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from decimal import Decimal, ROUND_HALF_UP
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
LEAF_DOMAIN = b"LiqPass:v1|"


def _load_keccak_impl():
    try:
        from eth_hash.auto import keccak  # type: ignore

        return keccak
    except Exception:
        try:
            from Crypto.Hash import keccak as _keccak  # type: ignore

            def _crypto_keccak(data: bytes) -> bytes:
                h = _keccak.new(digest_bits=256)
                h.update(data)
                return h.digest()

            return _crypto_keccak
        except Exception:
            try:
                import sha3  # type: ignore

                def _sha3_keccak(data: bytes) -> bytes:
                    k = sha3.keccak_256()
                    k.update(data)
                    return k.digest()

                return _sha3_keccak
            except Exception as exc:
                raise RuntimeError(
                    "Missing keccak256 implementation. Install eth-hash, pycryptodome, or pysha3."
                ) from exc


keccak256 = _load_keccak_impl()


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

def keccak_hex(b: bytes) -> str:
    return "0x" + keccak256(b).hex()

def merkle_root(leaves: List[bytes]) -> Optional[bytes]:
    if not leaves:
        return None
    layer = list(leaves)
    if len(layer) == 1:
        return layer[0]
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i] if i + 1 == len(layer) else layer[i + 1]
            nxt.append(keccak256(left + right))
        layer = nxt
    return layer[0]

def jcs_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def to_decimal_str(value: Optional[float]) -> str:
    if value is None:
        return "0.00"
    d = Decimal(str(value))
    return format(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")

def ms_to_iso(ts_ms: Optional[int]) -> Optional[str]:
    if ts_ms is None:
        return None
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")

def derive_batch_id(exchange: str, inst_id: str, ts_ms: int) -> str:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    dt_minute = dt.replace(second=0, microsecond=0)
    return f"{exchange}:{inst_id}:{dt_minute.strftime('%Y%m%dT%H%MZ')}"

def normalize_hex(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.lower()
    if v.startswith("0x"):
        v = v[2:]
    if len(v) % 2 != 0:
        v = "0" + v
    return "0x" + v

def compute_leaf(record: Any) -> Tuple[bytes, bytes, str]:
    canonical = jcs_dumps(record)
    record_hash = keccak256(canonical.encode("utf-8"))
    leaf = keccak256(LEAF_DOMAIN + record_hash)
    return record_hash, leaf, canonical

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

def compute_merkle_for_records(
    records: List[Dict[str, Any]],
    out_file: str,
    parent_root: Optional[str] = None,
    batch_id: Optional[str] = None,
    meta_cid: Optional[str] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    leaves: List[bytes] = []
    manifest_records: List[Dict[str, Any]] = []
    for idx, record in enumerate(records):
        record_hash, leaf, _ = compute_leaf(record)
        leaves.append(leaf)
        manifest_records.append(
            {
                "index": idx,
                "recordHash": "0x" + record_hash.hex(),
                "leaf": "0x" + leaf.hex(),
            }
        )
    root_bytes = merkle_root(leaves)
    root_hex = "0x" + root_bytes.hex() if root_bytes else ""
    manifest: Dict[str, Any] = {
        "version": "liqpass.merkle.v2",
        "hashAlgo": "keccak256",
        "leafDomain": LEAF_DOMAIN.decode("ascii"),
        "count": len(manifest_records),
        "records": manifest_records,
        "merkleRoot": root_hex,
    }
    if parent_root:
        manifest["parentRoot"] = parent_root
    if batch_id:
        manifest["batchId"] = batch_id
    if meta_cid:
        manifest["metaCid"] = meta_cid
    ensure_dir(os.path.dirname(out_file))
    write_json(out_file, manifest)
    return root_hex, manifest_records

def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def derive_pos_side(order: Dict[str, Any]) -> Optional[str]:
    pos_side = order.get("posSide") or order.get("positionSide")
    if isinstance(pos_side, str) and pos_side:
        return pos_side.lower()
    side = (order.get("side") or "").lower()
    if side == "buy":
        return "long"
    if side == "sell":
        return "short"
    return None

def first_ts(items: List[Dict[str, Any]]) -> Optional[int]:
    out = []
    for it in items:
        try:
            ts = int(it.get("ts") or 0)
        except Exception:
            ts = 0
        if ts > 0:
            out.append(ts)
    return min(out) if out else None

def safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        v = str(value).strip()
        if not v:
            return None
        return float(v)
    except Exception:
        return None

def safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        text = str(value).strip()
        if not text:
            return None
        return int(text)
    except Exception:
        return None

def build_liqpass_record(
    ord_id: str,
    inst_id: str,
    order: Dict[str, Any],
    fill_summary: Dict[str, Any],
    bills: List[Dict[str, Any]],
    liq_hits: List[Dict[str, Any]],
    begin_ms: int,
    end_ms: int,
    wallet: Optional[str],
    batch_id: str,
    bind_hash: Optional[str],
    payout_usdt: Optional[float],
    has_strong: bool,
) -> Dict[str, Any]:
    order_ctime = safe_int(order.get("cTime"))
    opened_at = ms_to_iso(order_ctime) if order_ctime else None
    liq_ts = first_ts(liq_hits) or fill_summary.get("last_fill_ts")
    liq_at = ms_to_iso(liq_ts) if liq_ts else None
    leverage = safe_float(order.get("lever"))
    record = {
        "version": "liqpass.v1",
        "wallet": wallet.lower() if wallet else None,
        "exchange": "OKX",
        "inst": inst_id,
        "side": derive_pos_side(order),
        "open_notional_usdt": to_decimal_str(fill_summary.get("approx_notional_sum")),
        "leverage": leverage,
        "opened_at": opened_at,
        "liquidation": bool(has_strong),
        "liq_at": liq_at if has_strong else None,
        "payout_usdt": to_decimal_str(payout_usdt),
        "order_ref": {"okx_ordId": ord_id},
        "bind_hash": bind_hash,
        "batch_id": batch_id,
        "salt": secrets.token_hex(16),
        "window": {"beginMs": begin_ms, "endMs": end_ms},
        "analysis": {
            "fills": fill_summary.get("total_fills"),
            "bills": len(bills),
            "liq_signals": len(liq_hits),
            "has_strong": has_strong,
            "total_pnl": fill_summary.get("total_pnl"),
            "total_fee": fill_summary.get("total_fee"),
        },
        "evidence": {
            "order": "order.json",
            "fills": "fills.json",
            "bills": "bills.json",
            "summary": "summary.json",
        },
    }
    return record

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
    ap.add_argument("--wallet", help="EVM wallet address for binding (optional)", default=None)
    ap.add_argument("--bind-sig", help="EIP-712 signature hex; will be hashed into bind_hash", default=None)
    ap.add_argument("--bind-hash", help="pre-computed bind hash (0x...)", default=None)
    ap.add_argument("--batch-id", help="override batch id (exchange:inst:YYYYMMDDTHHMMZ)", default=None)
    ap.add_argument("--parent-root", help="previous batch merkle root (0x...)", default=None)
    ap.add_argument("--meta-cid", help="optional public CID for batch metadata", default=None)
    args = ap.parse_args()

    if args.only_merkle:
        if not args.inDir:
            print("--inDir required with --only-merkle", file=sys.stderr)
            sys.exit(2)
        records_path = os.path.join(args.inDir, "records.json")
        if not os.path.exists(records_path):
            print(f"records.json not found in {args.inDir}", file=sys.stderr)
            sys.exit(2)
        records = read_json(records_path)
        if not isinstance(records, list):
            print("records.json must contain a JSON array", file=sys.stderr)
            sys.exit(2)
        out_merkle = os.path.join(args.inDir, "merkle.json")
        root, _ = compute_merkle_for_records(records, out_merkle)
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

    wallet_addr = normalize_hex(args.wallet)
    parent_root = normalize_hex(args.parent_root)
    meta_cid = args.meta_cid

    if args.bind_hash:
        bind_hash = normalize_hex(args.bind_hash)
    elif args.bind_sig:
        sig_text = args.bind_sig.strip()
        if sig_text.startswith("0x"):
            sig_text = sig_text[2:]
        try:
            sig_bytes = bytes.fromhex(sig_text)
        except ValueError:
            print("Invalid --bind-sig hex payload", file=sys.stderr)
            sys.exit(2)
        bind_hash = keccak_hex(sig_bytes)
    else:
        bind_hash = None

    reference_ts = (
        fill_sum.get("last_fill_ts")
        or fill_sum.get("first_fill_ts")
        or end_ms
        or begin_ms
        or to_ms(datetime.now(timezone.utc))
    )
    if not isinstance(reference_ts, int):
        reference_ts = int(reference_ts)
    batch_id = args.batch_id or derive_batch_id("OKX", instId, reference_ts)

    payout_guess = None  # placeholder; actual reimbursement handled off-chain

    records = [
        build_liqpass_record(
            ordId,
            instId,
            order,
            fill_sum,
            bills,
            liq_hits,
            begin_ms,
            end_ms,
            wallet_addr,
            batch_id,
            bind_hash,
            payout_guess,
            has_strong,
        )
    ]
    records_path = os.path.join(out_dir, "records.json")
    write_json(records_path, records)

    root, manifest_records = compute_merkle_for_records(
        records,
        os.path.join(out_dir, "merkle.json"),
        parent_root=parent_root,
        batch_id=batch_id,
        meta_cid=meta_cid,
    )

    meta = {
        "ordId": ordId,
        "instId": instId,
        "beginMs": begin_ms,
        "endMs": end_ms,
        "batchId": batch_id,
        "parentRoot": parent_root,
        "metaCid": meta_cid,
        "recordCount": len(records),
        "generatedAt": iso_now(),
        "tool": "LeverageGuard Local Verifier 1.1",
        "notes": "Publish only merkle.json, summary.json/csv, and records with consent.",
    }
    write_json(os.path.join(out_dir, "meta.json"), meta)

    summary = {
        "ordId": ordId,
        "instId": instId,
        "window": {"beginMs": begin_ms, "endMs": end_ms},
        "fillSummary": fill_sum,
        "billsCount": len(bills),
        "liquidationSignals": liq_count,
        "hasStrongEvidence": has_strong,
        "merkleRoot": root,
        "batchId": batch_id,
        "parentRoot": parent_root,
        "metaCid": meta_cid,
        "recordsCount": len(records),
        "recordsFile": os.path.basename(records_path),
        "bindHash": bind_hash,
        "wallet": wallet_addr,
        "recordLeaves": manifest_records,
        "generatedAt": iso_now(),
    }
    write_json(os.path.join(out_dir, "summary.json"), summary)
    save_summary(
        args.csv,
        {
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
            "batch_id": batch_id,
            "parent_root": parent_root,
            "bind_hash": bind_hash,
            "wallet": wallet_addr,
            "generatedAt": summary["generatedAt"],
        },
    )

    # 7) Console report
    print("\n=== Verification Result ===")
    print(f"Order: {ordId} ({instId})")
    print(f"Fills: {fill_sum['total_fills']} | PnL: {fill_sum['total_pnl']} | Approx Notional: {fill_sum['approx_notional_sum']}")
    print(f"Bills in window: {len(bills)} | Liquidation/ADL signals: {liq_count} | StrongEvidence: {has_strong}")
    print(f"BatchId: {batch_id} | Records: {len(records)} | ParentRoot: {parent_root or 'N/A'}")
    print(f"Merkle Root: {root} | BindHash: {bind_hash or 'N/A'}")
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
