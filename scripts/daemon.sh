#!/usr/bin/env bash
set -euo pipefail

# daemon.sh — Thin wrapper that runs the TypeScript daemon in a loop.
# Each iteration runs one scan cycle (pending → pipeline → agents → cleanup).
#
# Usage: daemon.sh <project_root>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBMODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_ROOT="${1:?Usage: daemon.sh <project_root>}"

# Source config for SCAN_INTERVAL (default: 10 seconds)
if [[ -f "$SUBMODULE_DIR/config.local.sh" ]]; then
    source "$SUBMODULE_DIR/config.local.sh"
elif [[ -f "$SUBMODULE_DIR/config.sh" ]]; then
    source "$SUBMODULE_DIR/config.sh"
fi
INTERVAL="${SCAN_INTERVAL:-10}"

echo "[review] Daemon started — project root: $PROJECT_ROOT"
echo "[review] Scan interval: ${INTERVAL}s"

while true; do
    node "$SUBMODULE_DIR/dist/daemon.js" "$PROJECT_ROOT" || true
    sleep "$INTERVAL"
done
