#!/usr/bin/env bash
set -euo pipefail

# reset.sh — Reset a question-review project for a fresh run
# Kills tmux, prunes worktrees, clears locks, updates submodule, reinstalls settings, runs scanner
#
# Usage: reset.sh [--no-scan] <project_root>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBMODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SUBMODULE_DIR/config.sh"

NO_SCAN=false
if [[ "${1:-}" == "--no-scan" ]]; then
    NO_SCAN=true
    shift
fi
PROJECT_ROOT="${1:?Usage: reset.sh [--no-scan] <project_root>}"
SUBMODULE_NAME="$(basename "$SUBMODULE_DIR")"

echo "[reset] Killing tmux session..."
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true

echo "[reset] Removing worktrees..."
for wt in "$PROJECT_ROOT/.claude/worktrees"/*/; do
    [ -d "$wt" ] || continue
    name=$(basename "$wt")
    git -C "$PROJECT_ROOT" worktree remove --force ".claude/worktrees/$name" 2>/dev/null || true
done
git -C "$PROJECT_ROOT" worktree prune 2>/dev/null || true
# Remove stale worktree branches
for branch in $(git -C "$PROJECT_ROOT" branch --list 'worktree-*' 2>/dev/null); do
    git -C "$PROJECT_ROOT" branch -D "$branch" 2>/dev/null || true
done

echo "[reset] Clearing lockfiles..."
rm -f "$PROJECT_ROOT/.question-review-locks"/*.lock 2>/dev/null || true

echo "[reset] Updating submodule..."
git -C "$PROJECT_ROOT" -c protocol.file.allow=always submodule update --remote "$SUBMODULE_NAME"

echo "[reset] Reinstalling settings.json..."
rm -f "$PROJECT_ROOT/.claude/settings.json"
"$SUBMODULE_DIR/setup.sh"

echo "[reset] Moving resolved questions back to Awaiting..."
for f in "$PROJECT_ROOT/$RESOLVED_DIR"/Q*.md; do
    [ -f "$f" ] || continue
    mv "$f" "$PROJECT_ROOT/$AWAITING_DIR/"
done

echo "[reset] Committing reset state..."
git -C "$PROJECT_ROOT" add -A
git -C "$PROJECT_ROOT" commit -m "Reset project for testing" --allow-empty 2>/dev/null || true

if [[ "$NO_SCAN" == false ]]; then
    echo "[reset] Running scanner..."
    "$SUBMODULE_DIR/scripts/review-questions.sh" "$PROJECT_ROOT"
else
    echo "[reset] Done (scanner skipped)."
fi
