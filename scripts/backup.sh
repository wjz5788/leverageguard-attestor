#!/usr/bin/env bash
set -euo pipefail
DB_PATH="${SQLITE_PATH:-$(cd "$(dirname "$0")/.." && pwd)/data/us.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/data/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/us-$STAMP.sqlite"
sqlite3 "$DB_PATH" ".backup '$TARGET'"
echo "Backup created at: $TARGET"
