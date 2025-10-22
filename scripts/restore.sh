#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${SQLITE_PATH:-$(cd "$(dirname "$0")/.." && pwd)/data/us.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/data/backups}"
LATEST="$1"
if [[ "$LATEST" == "latest" ]]; then
  LATEST_FILE="$(ls -1t "$BACKUP_DIR"/us-*.sqlite 2>/dev/null | head -n1 || true)"
else
  LATEST_FILE="$LATEST"
fi
if [[ -z "${LATEST_FILE:-}" ]]; then
  echo "No backup file found" >&2
  exit 1
fi
if [[ ! -f "$LATEST_FILE" ]]; then
  echo "Backup file not found: $LATEST_FILE" >&2
  exit 1
fi
TMP="$DB_PATH.restore"
cp "$LATEST_FILE" "$TMP"
if [[ -f "$DB_PATH" ]]; then
  mv "$DB_PATH" "$DB_PATH.bak.$(date +%s)"
fi
mv "$TMP" "$DB_PATH"
echo "Restored from $LATEST_FILE"
