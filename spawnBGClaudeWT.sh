#!/usr/bin/env bash
set -euo pipefail

# --- Usage ---
if [ $# -lt 1 ]; then
  echo "Usage: $0 <worktree-name>"
  exit 1
fi

WORKTREE_NAME="${1// /_}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="${REPO_ROOT}/../${WORKTREE_NAME}"
COMMIT="HEAD"

is_ignored_worktree_file() {
  # Shell uses 0 for "true/success", so return 0 when this path is safe to ignore.
  case "$1" in
    ".claude/settings.json"|".vscode/tasks.json")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

has_meaningful_changes() {
  local line path

  # `git status --porcelain` prefixes each entry with a 2-char status plus a space.
  # Strip those first 3 chars and compare only the worktree-relative path.
  while IFS= read -r line; do
    path="${line:3}"

    if ! is_ignored_worktree_file "${path}"; then
      # Return success here to mean "yes, we found a meaningful change".
      return 0
    fi
  done < <(git -C "${WORKTREE_PATH}" status --porcelain --untracked-files=all 2>/dev/null || true)

  # Nonzero means "no meaningful changes were found".
  return 1
}

discard_ignored_changes() {
  local line path

  while IFS= read -r line; do
    path="${line:3}"

    case "${path}" in
      ".claude/settings.json")
        git -C "${WORKTREE_PATH}" clean -f -- ".claude/settings.json"
        rmdir "${WORKTREE_PATH}/.claude" 2>/dev/null || true
        ;;
      ".vscode/tasks.json")
        git -C "${WORKTREE_PATH}" clean -f -- ".vscode/tasks.json"
        rmdir "${WORKTREE_PATH}/.vscode" 2>/dev/null || true
        ;;
    esac
  done < <(git -C "${WORKTREE_PATH}" status --porcelain --untracked-files=all 2>/dev/null || true)
}

cleanup_worktree() {
  echo "Evaluating cleanup for ${WORKTREE_PATH}"

  if [ ! -d "${WORKTREE_PATH}" ]; then
    echo "Worktree path already removed: ${WORKTREE_PATH}"
    return
  fi

  # Discard generated files first so `git worktree remove` can succeed cleanly.
  discard_ignored_changes

  if has_meaningful_changes; then
    echo "Worktree has local changes; keeping ${WORKTREE_PATH}"
    return
  fi

  if git -C "${REPO_ROOT}" worktree remove "${WORKTREE_PATH}"; then
    echo "Worktree removed."
  else
    echo "Failed to remove worktree: ${WORKTREE_PATH}"
    return
  fi

  if tmux has-session -t "${WORKTREE_NAME}" 2>/dev/null; then
    tmux kill-session -t "${WORKTREE_NAME}"
    echo "tmux session killed."
  fi

  if git -C "${REPO_ROOT}" branch -d "${WORKTREE_NAME}" 2>/dev/null; then
    echo "Branch deleted."
  else
    echo "Branch ${WORKTREE_NAME} kept (unmerged changes). Delete with: git branch -D ${WORKTREE_NAME}"
  fi
}

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
    }
  ]
}
EOF

echo "Worktree '${WORKTREE_NAME}' created at ${WORKTREE_PATH}"
echo "IDE opening — Claude + tmux will auto-launch on folder open."
echo "Worktree cleanup runs after that IDE window closes."

# --- Open in IDE ---
# `--wait` blocks until that IDE window closes, which makes cleanup lifecycle
# depend on the window itself instead of a long-running background task.
agy --new-window --wait "${WORKTREE_PATH}"
cleanup_worktree
