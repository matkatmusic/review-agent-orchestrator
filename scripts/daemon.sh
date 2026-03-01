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

# Auto-rebuild dist/ if src/ is newer or dist/ doesn't exist
if [[ ! -d "$SUBMODULE_DIR/dist" ]] || \
   [[ -n "$(find "$SUBMODULE_DIR/src" -newer "$SUBMODULE_DIR/dist" -name '*.ts' -o -name '*.tsx' 2>/dev/null | head -1)" ]]; then
    echo "[review] dist/ is stale or missing — rebuilding..."
    (cd "$SUBMODULE_DIR" && npm run build) || { echo "[review] Build failed — aborting."; exit 1; }
    echo "[review] Build complete."
fi

echo "[review] Daemon started — project root: $PROJECT_ROOT"
echo "[review] Scan interval: ${INTERVAL}s"

while true; do
    node "$SUBMODULE_DIR/dist/daemon.js" "$PROJECT_ROOT" || true
    sleep "$INTERVAL"
done
