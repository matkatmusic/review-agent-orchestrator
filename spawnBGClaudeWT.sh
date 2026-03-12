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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

LOCK_DIR="${REPO_ROOT}/.worktree-locks"
PID_FILE="${LOCK_DIR}/daemon.pid"

ensure_daemon() {
  mkdir -p "${LOCK_DIR}"
  daemon_running=false
  if [ -f "${PID_FILE}" ]; then
    existing_pid="$(cat "${PID_FILE}")"
    if kill -0 "${existing_pid}" 2>/dev/null && \
       ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
      daemon_running=true
    fi
  fi
  if [ "${daemon_running}" = false ]; then
    rm -f "${PID_FILE}"
    nohup "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" >> "${LOCK_DIR}/daemon.log" 2>&1 &
    echo "Daemon started (PID $!)."
  fi
}

# --- Validate / Reopen ---
path_exists=false
branch_exists=false
[ -e "${WORKTREE_PATH}" ] && path_exists=true
git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}" 2>/dev/null && branch_exists=true

if [ "${path_exists}" = true ] && [ "${branch_exists}" = true ]; then
  # --- Reopen existing worktree ---
  echo "Reopening existing worktree '${WORKTREE_NAME}' at ${WORKTREE_PATH}"

  if [ ! -f "${LOCK_DIR}/${WORKTREE_NAME}.lock" ]; then
    PARENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    mkdir -p "${LOCK_DIR}"
    node -e "
      const fs = require('fs');
      const data = {
        worktreeName: process.argv[1],
        worktreePath: process.argv[2],
        repoRoot: process.argv[3],
        parentBranch: process.argv[4],
        spawnedAt: new Date().toISOString()
      };
      fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
    " "${WORKTREE_NAME}" "${WORKTREE_PATH}" "${REPO_ROOT}" "${PARENT_BRANCH}" \
      "${LOCK_DIR}/${WORKTREE_NAME}.lock"
    echo "Lockfile written: ${LOCK_DIR}/${WORKTREE_NAME}.lock"
  fi

  ensure_daemon
  agy --new-window "${WORKTREE_PATH}"
  exit 0
fi

if [ "${path_exists}" = true ]; then
  echo "Error: path exists but branch '${WORKTREE_NAME}' does not: ${WORKTREE_PATH}"
  echo "Remove it manually: rm -rf ${WORKTREE_PATH}"
  exit 1
fi

SKIP_WORKTREE_CREATE=false
if [ "${branch_exists}" = true ]; then
  # Branch exists but no path — prune stale record, reuse branch
  git worktree prune
  echo "Reusing existing branch '${WORKTREE_NAME}'."
  git worktree add "${WORKTREE_PATH}" "${WORKTREE_NAME}"
  SKIP_WORKTREE_CREATE=true
fi

# --- Create worktree ---
if [ "${SKIP_WORKTREE_CREATE}" != true ]; then
  git worktree add -b "${WORKTREE_NAME}" "${WORKTREE_PATH}" "${COMMIT}"
fi

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
      "label": "npm install",
      "type": "shell",
      "command": "npm install",
      "runOptions": {"runOn": "folderOpen"},
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "group": "worktree-${WORKTREE_NAME}",
        "focus": false
      }
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

# --- Write lockfile ---
PARENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
mkdir -p "${LOCK_DIR}"
node -e "
  const fs = require('fs');
  const data = {
    worktreeName: process.argv[1],
    worktreePath: process.argv[2],
    repoRoot: process.argv[3],
    parentBranch: process.argv[4],
    spawnedAt: new Date().toISOString()
  };
  fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
" "${WORKTREE_NAME}" "${WORKTREE_PATH}" "${REPO_ROOT}" "${PARENT_BRANCH}" "${LOCK_DIR}/${WORKTREE_NAME}.lock"

echo "Lockfile written: ${LOCK_DIR}/${WORKTREE_NAME}.lock"

# --- Start daemon if not already running ---
ensure_daemon

# --- Open in IDE (non-blocking) ---
agy --new-window "${WORKTREE_PATH}"
echo "IDE opened. Daemon will clean up after branch is merged into ${PARENT_BRANCH}."
