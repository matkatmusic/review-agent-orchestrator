#!/usr/bin/env bash
set -euo pipefail

# --- Usage ---
if [ $# -lt 1 ]; then
  echo "Usage: $0 <worktree-name>"
  exit 1
fi

WORKTREE_NAME="$1"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="${REPO_ROOT}/../${WORKTREE_NAME}"
COMMIT="HEAD"

# --- Validate ---
if [ -e "${WORKTREE_PATH}" ]; then
  echo "Error: path already exists: ${WORKTREE_PATH}"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}" 2>/dev/null; then
  echo "Error: branch '${WORKTREE_NAME}' already exists"
  exit 1
fi

# --- Create worktree ---
git worktree add -b "${WORKTREE_NAME}" "${WORKTREE_PATH}" "${COMMIT}"

# --- Write .claude/settings.json ---
mkdir -p "${WORKTREE_PATH}/.claude"
cp "${REPO_ROOT}/v1/templates/settings.json" "${WORKTREE_PATH}/.claude/settings.json"

# --- Write .vscode/tasks.json ---
mkdir -p "${WORKTREE_PATH}/.vscode"
cat > "${WORKTREE_PATH}/.vscode/tasks.json" << EOF
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Claude (Plan Mode)",
      "type": "shell",
      "command": "claude",
      "runOptions": {"runOn": "folderOpen"},
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "group": "worktree-${WORKTREE_NAME}",
        "focus": true
      },
      "isBackground": true
    },
    {
      "label": "tmux: ${WORKTREE_NAME}",
      "type": "shell",
      "command": "tmux new-session -s ${WORKTREE_NAME}",
      "runOptions": {"runOn": "folderOpen"},
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "group": "worktree-${WORKTREE_NAME}",
        "focus": false
      },
      "isBackground": true
    },
    {
      "label": "Cleanup worktree on close",
      "type": "shell",
      "command": "cleanup() { cd '${REPO_ROOT}' && git worktree remove --force '${WORKTREE_PATH}' 2>/dev/null; if git branch -d '${WORKTREE_NAME}' 2>/dev/null; then echo 'Branch deleted.'; else echo 'Branch ${WORKTREE_NAME} kept (unmerged changes). Delete with: git branch -D ${WORKTREE_NAME}'; fi; echo 'Cleanup complete.'; }; trap cleanup EXIT HUP TERM; echo 'Cleanup watcher active — will run when window closes.'; while true; do sleep 86400; done",
      "runOptions": {"runOn": "folderOpen"},
      "presentation": {
        "reveal": "never",
        "panel": "dedicated",
        "focus": false
      },
      "isBackground": true
    }
  ]
}
EOF

# --- Open in IDE ---
agy "${WORKTREE_PATH}"

echo "Worktree '${WORKTREE_NAME}' created at ${WORKTREE_PATH}"
echo "IDE opening — Claude + tmux will auto-launch on folder open."
echo "Worktree will auto-cleanup when the IDE window is closed."
