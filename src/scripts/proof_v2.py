#!/usr/bin/env python3
"""
Proof generation tool for liquidation evidence rules v2.

Features:
- Ensures manifest.json matches the fixed rule definition.
- Normalizes inputs, applies quantization, and hashes leaves per v2 spec.
- Builds a SHA-256 Merkle tree (sha256-merkle-v1) with leaf duplication for odd counts.
- Persists proofs under /proofs/YYYY-MM-DD/<ordIdHash>/ with proof.json, proof.sha256, summary.json, root.txt.
- Appends verification logs to logs/YYYYMMDD/verify.log.
- Rejects non-compliant inputs with detailed reasons.
"""
import argparse
import json
import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_EVEN, InvalidOperation
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# ---------- Constants ----------

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROOF_DIR = Path(os.environ.get("PROOF_BASE_DIR", REPO_ROOT / "data" / "proofs"))
DEFAULT_LOG_DIR = Path(os.environ.get("LOG_BASE_DIR", REPO_ROOT / "data" / "logs"))

MANIFEST_PATH = DEFAULT_PROOF_DIR / "manifest.json"

LEAF_SPEC: List[Tuple[str, str]] = [
    ("instId", "string"),
    ("ordId", "string"),
    ("side", "string"),
    ("qty", "decimal"),
    ("avgPx", "decimal"),
    ("leverage", "decimal"),
    ("marginAsset", "string"),
    ("liquidationFlag", "string"),
    ("ts", "integer"),
]

MANIFEST_CONTENT = {
    "rules_version": "2.0",
    "hash_algo": "sha256-merkle-v1",
    "leaf_order": [{"key": key, "type": typ} for key, typ in LEAF_SPEC],
    "quantize": {
        "qty": {"decimal_places": 8, "rounding": "HALF_EVEN"},
        "avgPx": {"decimal_places": 8, "rounding": "HALF_EVEN"},
        "leverage": {"decimal_places": 4, "rounding": "HALF_EVEN"},
    },
    "time_zone": "UTC",
}

QUANT_DECIMALS = {
    "qty": 8,
    "avgPx": 8,
    "leverage": 4,
}

ALLOWED_INSTRUMENTS = {
    "okx": {"BTC-USDT-SWAP", "BTC-USDC-SWAP"},
    "binance": {"BTCUSDT", "BTCUSDC"},
}

ALLOWED_SIDES = {"BUY", "SELL"}
ALLOWED_FLAGS = {"LIQ", "ADL"}
ALLOWED_MARGIN_ASSETS = {"USDT", "USDC"}

DEFAULT_SOURCE = "manual"


# ---------- Exceptions ----------

class ValidationError(Exception):
    """Raised when inputs violate rule-set v2."""


# ---------- Utility helpers ----------

def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ensure_manifest(path: Path = MANIFEST_PATH) -> Path:
    """Write manifest.json with fixed content if missing or outdated."""
    serialized = json.dumps(MANIFEST_CONTENT, indent=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            current = path.read_text(encoding="utf-8")
            if current == serialized + "\n" or current == serialized:
                return path
        except Exception:
            pass
    path.write_text(serialized + "\n", encoding="utf-8")
    return path


def compute_rule_hash(path: Path) -> str:
    data = path.read_bytes()
    return "0x" + hashlib.sha256(data).hexdigest()


def parse_exchange(inst_id: str, provided: Optional[str]) -> str:
    inst_upper = inst_id.upper()
    if provided:
        provided_lower = provided.lower()
        if provided_lower not in ALLOWED_INSTRUMENTS:
            raise ValidationError(f"exchange '{provided}' not supported")
        allowed = ALLOWED_INSTRUMENTS[provided_lower]
        if inst_upper not in allowed:
            raise ValidationError(f"instId '{inst_upper}' not allowed for exchange {provided_lower}")
        return provided_lower
    for ex, symbols in ALLOWED_INSTRUMENTS.items():
        if inst_upper in symbols:
            return ex
    raise ValidationError(f"instId '{inst_upper}' not in whitelist")


def quantize_decimal(value, decimals: int) -> str:
    if isinstance(value, Decimal):
        d = value
    else:
        d = Decimal(str(value))
    quant = Decimal(1).scaleb(-decimals)
    q = d.quantize(quant, rounding=ROUND_HALF_EVEN)
    s = format(q, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def normalize_timestamp(value) -> Tuple[int, datetime]:
    if isinstance(value, (int, float)):
        ts_int = int(value)
    elif isinstance(value, str):
        v = value.strip()
        if v.isdigit():
            ts_int = int(v)
        else:
            # Support ISO-8601 inputs
            try:
                dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValidationError(f"invalid ts format: {value}") from exc
            ts_int = int(dt.timestamp() * 1000)
    else:
        raise ValidationError("ts must be integer milliseconds or ISO-8601 string")
    dt = datetime.fromtimestamp(ts_int / 1000, tz=timezone.utc)
    now = datetime.now(timezone.utc)
    if abs((dt - now)) > timedelta(hours=24):
        raise ValidationError("ts outside acceptable ±24h window")
    return ts_int, dt


@dataclass
class Leaf:
    key: str
    type: str
    value: str
    hash: str


def hash_leaf(key: str, type_name: str, value: str) -> str:
    payload = f"v2|{key}|{type_name}|{value}"
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return "0x" + digest


def compute_merkle(leaves: List[Leaf]) -> str:
    if not leaves:
        raise ValidationError("no leaves to hash")
    layer = [bytes.fromhex(leaf.hash[2:]) for leaf in leaves]
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i] if i + 1 >= len(layer) else layer[i + 1]
            nxt.append(hashlib.sha256(left + right).digest())
        layer = nxt
    return "0x" + layer[0].hex()


def compute_ord_id_hash(exchange: str, inst_id: str, ord_id: str) -> str:
    payload = f"{exchange.lower()}|{inst_id.lower()}|{ord_id}"
    return "0x" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_proof_base_dir() -> Path:
    return DEFAULT_PROOF_DIR


def get_log_base_dir() -> Path:
    return DEFAULT_LOG_DIR


def append_log_line(
    *,
    exchange: str,
    inst_id_selected: str,
    parsed_inst_id: str,
    ord_id: str,
    ord_id_hash: str,
    source: str,
    passive: str,
    rule_hash: str,
    decision: str,
    reason: str,
):
    ts = iso_now()
    log_dir = get_log_base_dir() / datetime.now(timezone.utc).strftime("%Y%m%d")
    log_dir.mkdir(parents=True, exist_ok=True)
    reason_sanitized = reason.replace("\n", " ").replace("\r", " ")
    line = ",".join(
        [
            ts,
            exchange,
            inst_id_selected,
            parsed_inst_id,
            ord_id,
            ord_id_hash,
            source,
            passive,
            "ver=v2",
            rule_hash,
            decision,
            reason_sanitized or "OK",
        ]
    )
    with (log_dir / "verify.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def normalize_inputs(raw: Dict[str, str]) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    inst = str(raw.get("instId", "")).strip().upper()
    if not inst:
        raise ValidationError("instId missing")
    normalized["instId"] = inst

    ord_id = str(raw.get("ordId", "")).strip()
    if not ord_id:
        raise ValidationError("ordId missing")
    normalized["ordId"] = ord_id

    side = str(raw.get("side", "")).strip().upper()
    if side not in ALLOWED_SIDES:
        raise ValidationError("side must be BUY or SELL")
    normalized["side"] = side

    for key in ("qty", "avgPx", "leverage"):
        if key not in raw:
            raise ValidationError(f"{key} missing")
        try:
            raw_decimal = Decimal(str(raw[key]))
        except (ValueError, ArithmeticError, InvalidOperation) as exc:
            raise ValidationError(f"{key} invalid decimal") from exc
        if raw_decimal <= 0:
            raise ValidationError(f"{key} must be positive")
        try:
            val = quantize_decimal(raw_decimal, QUANT_DECIMALS[key])
        except (ValueError, ArithmeticError, InvalidOperation) as exc:
            raise ValidationError(f"{key} invalid decimal") from exc
        normalized[key] = val

    margin = str(raw.get("marginAsset", "")).strip().upper()
    if margin not in ALLOWED_MARGIN_ASSETS:
        raise ValidationError("marginAsset must be USDT or USDC")
    normalized["marginAsset"] = margin

    flag = str(raw.get("liquidationFlag", "")).strip().upper()
    if flag not in ALLOWED_FLAGS:
        raise ValidationError("liquidationFlag must be LIQ or ADL")
    normalized["liquidationFlag"] = flag

    if "ts" not in raw:
        raise ValidationError("ts missing")
    ts_value, _ = normalize_timestamp(raw["ts"])
    normalized["ts"] = str(ts_value)

    return normalized


def build_leaves(normalized: Dict[str, str]) -> List[Leaf]:
    leaves: List[Leaf] = []
    for key, typ in LEAF_SPEC:
        if key not in normalized:
            raise ValidationError(f"{key} missing after normalization")
        value = normalized[key]
        leaf_hash = hash_leaf(key, typ, value)
        leaves.append(Leaf(key=key, type=typ, value=value, hash=leaf_hash))
    return leaves


def write_outputs(
    *,
    proof_dir: Path,
    leaves: List[Leaf],
    root_hash: str,
    rule_hash: str,
    ord_id: str,
    ord_id_hash: str,
    exchange: str,
    inst_id: str,
):
    proof_dir.mkdir(parents=True, exist_ok=True)

    proof_path = proof_dir / "proof.json"
    proof_sha_path = proof_dir / "proof.sha256"
    summary_path = proof_dir / "summary.json"
    root_path = proof_dir / "root.txt"

    proof_payload = {
        "version": "v2",
        "rule_hash": rule_hash,
        "root": root_hash,
        "leaf_count": len(leaves),
        "exchange": exchange,
        "instId": inst_id,
        "ordId": ord_id,
        "ordIdHash": ord_id_hash,
        "leaf_order": [{"key": leaf.key, "type": leaf.type} for leaf in leaves],
        "leaves": [leaf.__dict__ for leaf in leaves],
        "generated_at": iso_now(),
    }
    proof_text = json.dumps(proof_payload, indent=2) + "\n"
    if proof_path.exists():
        existing_proof = proof_path.read_text(encoding="utf-8")
        if existing_proof != proof_text:
            raise ValidationError("existing proof.json mismatch for ordIdHash")
    else:
        proof_path.write_text(proof_text, encoding="utf-8")

    proof_bytes = proof_path.read_bytes()
    proof_sha = "0x" + hashlib.sha256(proof_bytes).hexdigest()
    if proof_sha_path.exists():
        existing_sha = proof_sha_path.read_text(encoding="utf-8").strip()
        if existing_sha != proof_sha:
            raise ValidationError("existing proof.sha256 mismatch for ordIdHash")
    else:
        proof_sha_path.write_text(proof_sha + "\n", encoding="utf-8")

    summary_payload = {
        "root": root_hash,
        "version": "v2",
        "leaf_count": len(leaves),
        "manifest_hash": rule_hash,
    }
    summary_text = json.dumps(summary_payload, indent=2) + "\n"
    if summary_path.exists():
        existing_summary = summary_path.read_text(encoding="utf-8")
        if existing_summary != summary_text:
            raise ValidationError("existing summary.json mismatch for ordIdHash")
    else:
        summary_path.write_text(summary_text, encoding="utf-8")

    if root_path.exists():
        existing_root = root_path.read_text(encoding="utf-8").strip()
        if existing_root != root_hash:
            raise ValidationError("existing proof root mismatch for ordIdHash")
    else:
        root_path.write_text(root_hash + "\n", encoding="utf-8")


def generate_proof(
    *,
    raw_inputs: Dict[str, str],
    exchange_hint: Optional[str],
    source: Optional[str],
    passive: bool,
) -> Path:
    manifest_path = ensure_manifest()
    rule_hash = compute_rule_hash(manifest_path)

    normalized = normalize_inputs(raw_inputs)
    exchange = parse_exchange(normalized["instId"], exchange_hint)
    ord_id_hash = compute_ord_id_hash(exchange, normalized["instId"], normalized["ordId"])

    leaves = build_leaves(normalized)
    root = compute_merkle(leaves)

    base_dir = get_proof_base_dir()
    utc_today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    proof_dir = base_dir / utc_today / ord_id_hash

    write_outputs(
        proof_dir=proof_dir,
        leaves=leaves,
        root_hash=root,
        rule_hash=rule_hash,
        ord_id=normalized["ordId"],
        ord_id_hash=ord_id_hash,
        exchange=exchange,
        inst_id=normalized["instId"],
    )

    append_log_line(
        exchange=exchange,
        inst_id_selected=normalized["instId"],
        parsed_inst_id=normalized["instId"],
        ord_id=normalized["ordId"],
        ord_id_hash=ord_id_hash,
        source=(source or DEFAULT_SOURCE),
        passive="true" if passive else "false",
        rule_hash=rule_hash,
        decision="ACCEPT",
        reason="OK",
    )

    return proof_dir


def reject_inputs(
    *,
    raw_inputs: Dict[str, str],
    exchange_hint: Optional[str],
    source: Optional[str],
    passive: bool,
    error: str,
):
    inst_id = str(raw_inputs.get("instId", "")).strip().upper() or "N/A"
    ord_id = str(raw_inputs.get("ordId", "")).strip() or "N/A"
    try:
        manifest_path = ensure_manifest()
        rule_hash = compute_rule_hash(manifest_path)
    except Exception:
        rule_hash = "0x" + "0" * 64
    try:
        exchange = parse_exchange(inst_id, exchange_hint)
    except Exception:
        exchange = "unknown"
    ord_id_hash = compute_ord_id_hash(exchange, inst_id, ord_id) if exchange != "unknown" else "0x" + "0" * 64

    append_log_line(
        exchange=exchange,
        inst_id_selected=inst_id,
        parsed_inst_id=inst_id,
        ord_id=ord_id,
        ord_id_hash=ord_id_hash,
        source=(source or DEFAULT_SOURCE),
        passive="true" if passive else "false",
        rule_hash=rule_hash,
        decision="REJECT",
        reason=error,
    )


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Generate liquidation proof artifacts (v2).")
    ap.add_argument("--exchange", help="Exchange hint: okx or binance", default=None)
    for key, _ in LEAF_SPEC:
        ap.add_argument(f"--{key}", help=f"Input value for {key}", required=False)
    ap.add_argument("--source", help="Source identifier for logging", default=None)
    ap.add_argument("--active", action="store_true", help="Set passive=false in logs")
    ap.add_argument("--input-json", help="Optional path to JSON containing inputs", default=None)
    return ap.parse_args()


def main():
    args = parse_args()
    raw_inputs: Dict[str, str] = {}
    if args.input_json:
        payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise SystemExit("input JSON must be an object")
        raw_inputs.update(payload)
    for key, _ in LEAF_SPEC:
        val = getattr(args, key)
        if val is not None:
            raw_inputs[key] = val
    passive = not args.active
    if not raw_inputs:
        raise SystemExit("no inputs provided")
    try:
        proof_dir = generate_proof(
            raw_inputs=raw_inputs,
            exchange_hint=args.exchange,
            source=args.source,
            passive=passive,
        )
        print(f"Proof generated at: {proof_dir}")
    except ValidationError as exc:
        reject_inputs(
            raw_inputs=raw_inputs,
            exchange_hint=args.exchange,
            source=args.source,
            passive=passive,
            error=str(exc),
        )
        print(f"400: {exc}", flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
