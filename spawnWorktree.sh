#!/usr/bin/env bash
# spawnWorktree.sh — Create or reopen a managed git worktree.
# Replaces spawnBGClaudeWT.sh. No lockfiles — state derived from git + markers.
#
# Usage: spawnWorktree.sh [--force] <worktree-name>

# ─── Parse flags ────────────────────────────────────────────────────────────

FORCE=false
POSITIONAL_ARGS=()

for arg in "$@"; do
  case "${arg}" in
    --force) FORCE=true ;;
    *) POSITIONAL_ARGS+=("${arg}") ;;
  esac
done

if [ ${#POSITIONAL_ARGS[@]} -lt 1 ]; then
  echo "Usage: $0 [--force] <worktree-name>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

# ─── STEP 1: Parse + validate ───────────────────────────────────────────────

WORKTREE_NAME="${POSITIONAL_ARGS[0]// /_}"

if ! validate_name "${WORKTREE_NAME}"; then
  exit 1
fi

REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
WORKTREE_PATH=$(resolve_path "${REPO_ROOT}/../${WORKTREE_NAME}")

log "Spawn worktree: name=${WORKTREE_NAME}, path=${WORKTREE_PATH}"

# ─── STEP 2: Determine state ────────────────────────────────────────────────

path_exists=false
branch_exists=false
[ -d "${WORKTREE_PATH}" ] && path_exists=true
git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}" 2>/dev/null && branch_exists=true

# ─── STEP 3: Handle state matrix ────────────────────────────────────────────

need_scaffold=false

if [ "${path_exists}" = true ] && [ "${branch_exists}" = true ]; then
  # CASE A: Both exist — REOPEN
  log "CASE A: Reopening existing worktree '${WORKTREE_NAME}'"

  # Check if scaffold files have been modified
  if check_scaffold_modified "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"; then
    if [ "${FORCE}" = true ]; then
      log "Scaffold modified but --force passed. Overwriting."
      need_scaffold=true
    else
      echo ""
      echo "Scaffold files in '${WORKTREE_NAME}' have been modified."
      read -rp "Overwrite with fresh templates? [y/N]: " answer
      case "${answer}" in
        y|Y) need_scaffold=true ;;
        *)   log "Keeping existing scaffold files." ;;
      esac
    fi
  else
    # Unchanged — silently refresh
    need_scaffold=true
  fi

  if [ "${need_scaffold}" = true ]; then
    scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"
  fi

elif [ "${branch_exists}" = true ] && [ "${path_exists}" = false ]; then
  # CASE B: Branch exists, no path — RE-CREATE from existing branch
  log "CASE B: Branch '${WORKTREE_NAME}' exists but path is gone. Re-creating."
  git worktree prune 2>/dev/null || true
  git worktree add "${WORKTREE_PATH}" "${WORKTREE_NAME}"
  scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"

elif [ "${path_exists}" = true ] && [ "${branch_exists}" = false ]; then
  # CASE C: Path exists, no branch — ERROR
  log "ERROR: Path exists but branch '${WORKTREE_NAME}' does not."
  echo "Manual cleanup needed:"
  echo "  rm -rf ${WORKTREE_PATH}"
  echo "  git worktree prune"
  exit 1

else
  # CASE D: Neither — FRESH CREATE
  log "CASE D: Creating fresh worktree '${WORKTREE_NAME}'"
  git worktree add -b "${WORKTREE_NAME}" "${WORKTREE_PATH}" HEAD
  scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"
fi

# ─── STEP 5: Open IDE ───────────────────────────────────────────────────────

log "Opening IDE at ${WORKTREE_PATH}"
agy --new-window "${WORKTREE_PATH}"

# ─── STEP 6: Ensure daemon running ──────────────────────────────────────────

PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"

if daemon_already_running "${PIDFILE}"; then
  log "Daemon already running (PID $(<"${PIDFILE}"))"
else
  rm -f "${PIDFILE}"
  nohup "${REPO_ROOT}/worktreeDaemon.sh" "${REPO_ROOT}" >> "${REPO_ROOT}/.worktree-daemon.log" 2>&1 &
  log "Daemon started (PID $!)."
fi

# ─── STEP 7: Summary ────────────────────────────────────────────────────────

echo ""
echo "Worktree '${WORKTREE_NAME}' ready at ${WORKTREE_PATH}"
echo "Daemon will auto-cleanup after branch is merged."
