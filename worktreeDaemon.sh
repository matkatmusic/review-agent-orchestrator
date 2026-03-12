#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# worktreeDaemon.sh — Polling daemon that cleans up worktrees after their
# branches are merged back into the parent branch.
#
# Usage: worktreeDaemon.sh <repo-root> [--verbose]

if [ $# -lt 1 ]; then
  echo "Usage: $0 <repo-root> [--verbose]"
  exit 1
fi

REPO_ROOT="$1"
if [ "${2:-}" = "--verbose" ] || [ "${2:-}" = "-v" ]; then
  VERBOSE=true
else
  VERBOSE=false
fi
LOCK_DIR="${REPO_ROOT}/.worktree-locks"
PID_FILE="${LOCK_DIR}/daemon.pid"
SCAN_INTERVAL=10

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

vlog() {
  [ "${VERBOSE}" = true ] && log "[verbose] $*" || true
}

cleanup_daemon() {
  log "Daemon shutting down (PID $$)."
  rm -f "${PID_FILE}"
  exit 0
}

trap cleanup_daemon SIGINT SIGTERM

# --- Singleton check ---
if [ -f "${PID_FILE}" ]; then
  existing_pid="$(cat "${PID_FILE}")"
  if kill -0 "${existing_pid}" 2>/dev/null && \
     ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
    log "Daemon already running (PID ${existing_pid}). Exiting."
    exit 0
  else
    log "Stale PID file found (PID ${existing_pid}). Taking over."
    rm -f "${PID_FILE}"
  fi
fi

echo $$ > "${PID_FILE}"
log "Daemon started (PID $$)."
vlog "VERBOSE mode enabled"

# --- Main scan loop ---
while true; do
  lockfiles=("${LOCK_DIR}"/*.lock)

  # With nullglob enabled, no matches produce an empty array.
  if [ ${#lockfiles[@]} -eq 0 ] || [ ! -e "${lockfiles[0]}" ]; then
    log "No lockfiles remain. Daemon exiting."
    rm -f "${PID_FILE}"
    exit 0
  fi

  log "--- scan cycle start: ${#lockfiles[@]} lockfile(s) found ---"
  vlog "lockfiles: ${lockfiles[*]}"

  for lockfile in "${lockfiles[@]}"; do
    [ -f "${lockfile}" ] || continue

    log "Processing lockfile: ${lockfile}"

    # Parse all fields via null-delimited output (no eval — see CWE-78/CWE-95).
    {
      IFS= read -r -d '' WORKTREE_NAME
      IFS= read -r -d '' WORKTREE_PATH
      IFS= read -r -d '' REPO_ROOT_PARSED
      IFS= read -r -d '' PARENT_BRANCH
    } < <(node -e "
      const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      process.stdout.write(d.worktreeName + '\0');
      process.stdout.write(d.worktreePath + '\0');
      process.stdout.write(d.repoRoot + '\0');
      process.stdout.write(d.parentBranch + '\0');
    " "${lockfile}" 2>/dev/null) || {
      log "WARNING: Failed to parse ${lockfile}. Skipping."
      continue
    }

    # Validate worktree name to prevent path traversal or injection.
    if [[ ! "${WORKTREE_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log "WARNING: Invalid worktree name '${WORKTREE_NAME}' in ${lockfile}. Skipping."
      continue
    fi

    log "${WORKTREE_NAME}: parsed — path=${WORKTREE_PATH}, parent=${PARENT_BRANCH}"
    vlog "${WORKTREE_NAME}: repoRoot=${REPO_ROOT_PARSED}"

    # If the worktree directory is already gone, just clean up the leftovers.
    if [ ! -d "${WORKTREE_PATH}" ]; then
      log "${WORKTREE_NAME}: worktree path gone. Cleaning up remnants."
      prune_out="$(git -C "${REPO_ROOT}" worktree prune 2>&1)" || true
      vlog "${WORKTREE_NAME}: worktree prune: ${prune_out:-<no output>}"

      if tmux has-session -t "${WORKTREE_NAME}" 2>/dev/null; then
        tmux kill-session -t "${WORKTREE_NAME}"
        log "${WORKTREE_NAME}: tmux session killed."
      else
        vlog "${WORKTREE_NAME}: no tmux session to kill"
      fi

      if git -C "${REPO_ROOT}" branch -d "${WORKTREE_NAME}" 2>/dev/null; then
        log "${WORKTREE_NAME}: branch deleted."
      else
        vlog "${WORKTREE_NAME}: branch not found or not fully merged"
      fi

      rm -f "${lockfile}"
      log "${WORKTREE_NAME}: lockfile removed."
      continue
    fi

    # Check if the parent branch still exists.
    if ! git -C "${REPO_ROOT}" rev-parse --verify "${PARENT_BRANCH}" >/dev/null 2>&1; then
      log "WARNING: Parent branch '${PARENT_BRANCH}' not found for ${WORKTREE_NAME}. Skipping."
      continue
    fi

    # Check if the worktree branch has been merged into the parent.
    # NOTE: This detects standard and --no-ff merges only. Squash merges,
    # cherry-picks, and rebases produce different commit hashes and will NOT
    # be detected. For GitHub squash-merge workflows, consider content diff
    # (git diff PARENT...BRANCH --quiet) or the GitHub API instead.
    merged_list="$(git -C "${REPO_ROOT}" branch --merged "${PARENT_BRANCH}" 2>/dev/null)" || true
    vlog "${WORKTREE_NAME}: branches merged into ${PARENT_BRANCH}: $(echo "${merged_list}" | xargs)"
    if echo "${merged_list}" | grep -qw "${WORKTREE_NAME}"; then
      log "${WORKTREE_NAME}: MERGED into ${PARENT_BRANCH}. Starting cleanup."

      if cleanup_worktree; then
        log "${WORKTREE_NAME}: cleanup succeeded."
      else
        log "${WORKTREE_NAME}: cleanup returned non-zero (worktree may have local changes)."
      fi

      rm -f "${lockfile}"
      log "${WORKTREE_NAME}: lockfile removed."
    else
      log "${WORKTREE_NAME}: not merged into ${PARENT_BRANCH}. No action."
    fi
  done

  log "--- scan cycle end. Sleeping ${SCAN_INTERVAL}s ---"
  sleep "${SCAN_INTERVAL}"
done
