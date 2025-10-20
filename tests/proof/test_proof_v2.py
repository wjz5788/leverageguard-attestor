import hashlib
import json
import sys
from datetime import datetime as dt_datetime, timezone as dt_timezone
from pathlib import Path
from typing import Tuple

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "src" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(SCRIPTS_DIR))

import proof_v2  # noqa: E402
from proof_v2 import (  # noqa: E402
    MANIFEST_CONTENT,
    ValidationError,
    compute_rule_hash,
    ensure_manifest,
    generate_proof,
    reject_inputs,
)


def _prepare_env(monkeypatch, tmp_path: Path) -> Tuple[Path, Path]:
    proofs = tmp_path / "proofs"
    logs = tmp_path / "logs"
    monkeypatch.setenv("PROOF_BASE_DIR", str(proofs))
    monkeypatch.setenv("LOG_BASE_DIR", str(logs))
    # refresh module-level defaults
    monkeypatch.setattr(proof_v2, "DEFAULT_PROOF_DIR", proofs)
    monkeypatch.setattr(proof_v2, "DEFAULT_LOG_DIR", logs)
    return proofs, logs


def _patch_manifest(monkeypatch, tmp_path: Path) -> Path:
    manifest_path = tmp_path / "manifest.json"
    monkeypatch.setattr(proof_v2, "MANIFEST_PATH", manifest_path)
    return manifest_path


def _patch_datetime(monkeypatch, fixed_ms: int):
    class FixedDatetime(dt_datetime):
        @classmethod
        def now(cls, tz=None):
            base = dt_datetime.fromtimestamp(fixed_ms / 1000, tz=dt_timezone.utc)
            if tz:
                return base.astimezone(tz)
            return base.replace(tzinfo=None)

    monkeypatch.setattr(proof_v2, "datetime", FixedDatetime)


def test_manifest_written_and_hash(tmp_path, monkeypatch):
    manifest_path = _patch_manifest(monkeypatch, tmp_path)
    written = ensure_manifest(manifest_path)
    assert written == manifest_path
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data == MANIFEST_CONTENT
    rule_hash = compute_rule_hash(manifest_path)
    assert rule_hash.startswith("0x") and len(rule_hash) == 66


def test_generate_proof_success(monkeypatch, tmp_path):
    _, logs = _prepare_env(monkeypatch, tmp_path)
    now_ms = int(dt_datetime.now(dt_timezone.utc).timestamp() * 1000)
    inputs = {
        "instId": "BTC-USDT-SWAP",
        "ordId": "1234567890",
        "side": "buy",
        "qty": "0.001",
        "avgPx": "27000.125",
        "leverage": "10",
        "marginAsset": "usdt",
        "liquidationFlag": "LIQ",
        "ts": now_ms,
    }

    proof_dir = generate_proof(
        raw_inputs=inputs,
        exchange_hint="okx",
        source="unit-test",
        passive=True,
    )

    proof_json = proof_dir / "proof.json"
    summary_json = proof_dir / "summary.json"
    proof_sha = proof_dir / "proof.sha256"
    root_txt = proof_dir / "root.txt"

    for path in (proof_json, summary_json, proof_sha, root_txt):
        assert path.exists()

    proof_data = json.loads(proof_json.read_text(encoding="utf-8"))
    assert proof_data["version"] == "v2"
    assert proof_data["leaf_count"] == 9
    assert proof_data["exchange"] == "okx"
    assert proof_data["instId"] == "BTC-USDT-SWAP"
    assert proof_data["ordId"] == "1234567890"
    assert proof_data["root"].startswith("0x") and len(proof_data["root"]) == 66

    stored_sha = proof_sha.read_text(encoding="utf-8").strip()
    expected_sha = hashlib.sha256(proof_json.read_bytes()).hexdigest()
    assert stored_sha == "0x" + expected_sha

    summary_data = json.loads(summary_json.read_text(encoding="utf-8"))
    assert summary_data["root"] == proof_data["root"]
    assert summary_data["manifest_hash"] == proof_data["rule_hash"]

    today = dt_datetime.now(dt_timezone.utc).strftime("%Y%m%d")
    log_file = logs / today / "verify.log"
    assert log_file.exists()
    line = log_file.read_text(encoding="utf-8").strip().splitlines()[-1]
    parts = line.split(",")
    assert len(parts) == 12
    assert parts[1] == "okx"
    assert parts[2] == "BTC-USDT-SWAP"
    assert parts[3] == "BTC-USDT-SWAP"
    assert parts[4] == "1234567890"
    assert parts[8] == "ver=v2"
    assert parts[9].startswith("0x") and len(parts[9]) == 66
    assert parts[10] == "ACCEPT"
    assert parts[11] == "OK"
    assert parts[6] == "unit-test"
    assert parts[7] == "true"


def test_reject_flow(monkeypatch, tmp_path):
    _, logs = _prepare_env(monkeypatch, tmp_path)
    now_ms = int(dt_datetime.now(dt_timezone.utc).timestamp() * 1000)
    bad_inputs = {
        "instId": "BTC-FOO",
        "ordId": "999",
        "side": "buy",
        "qty": "1",
        "avgPx": "20000",
        "leverage": "5",
        "marginAsset": "usdt",
        "liquidationFlag": "LIQ",
        "ts": now_ms,
    }

    with pytest.raises(ValidationError):
        generate_proof(
            raw_inputs=bad_inputs,
            exchange_hint=None,
            source="unit-test",
            passive=True,
        )

    reject_inputs(
        raw_inputs=bad_inputs,
        exchange_hint=None,
        source="unit-test",
        passive=True,
        error="instId 'BTC-FOO' not in whitelist",
    )

    today = dt_datetime.now(dt_timezone.utc).strftime("%Y%m%d")
    log_file = logs / today / "verify.log"
    assert log_file.exists()
    line = log_file.read_text(encoding="utf-8").strip().splitlines()[-1]
    parts = line.split(",")
    assert len(parts) == 12
    assert parts[10] == "REJECT"
    assert parts[11] == "instId 'BTC-FOO' not in whitelist"
    assert parts[8] == "ver=v2"


def test_golden_vector_okx(monkeypatch, tmp_path):
    _, logs = _prepare_env(monkeypatch, tmp_path)
    fixed_ms = 1700000000000
    _patch_datetime(monkeypatch, fixed_ms)

    inputs = {
        "instId": "BTC-USDT-SWAP",
        "ordId": "GOLDEN-OKX",
        "side": "buy",
        "qty": "0.0105",
        "avgPx": "27500.125",
        "leverage": "7.5",
        "marginAsset": "USDT",
        "liquidationFlag": "LIQ",
        "ts": fixed_ms,
    }

    proof_dir = generate_proof(
        raw_inputs=inputs,
        exchange_hint="okx",
        source="golden",
        passive=True,
    )

    expected_root = "0x1dbb3ef822fedb0a368adf47add7def160bd9700cca36a3cf1b96937155e1074"
    expected_ord_hash = "0x75bfbb6ae41abaafaa9173fae4db5a59eb7634ed1694ff3179aa12fe45ad36a3"

    root_txt = proof_dir / "root.txt"
    assert root_txt.read_text(encoding="utf-8").strip() == expected_root
    assert proof_dir.name == expected_ord_hash

    proof_json = proof_dir / "proof.json"
    proof_data = json.loads(proof_json.read_text(encoding="utf-8"))
    assert proof_data["leaf_count"] == 9
    assert proof_data["root"] == expected_root

    today = proof_v2.datetime.now(dt_timezone.utc).strftime("%Y%m%d")
    log_file = logs / today / "verify.log"
    assert log_file.exists()
    line = log_file.read_text(encoding="utf-8").strip().splitlines()[-1]
    assert "golden" in line

