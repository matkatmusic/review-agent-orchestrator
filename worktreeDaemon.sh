#!/usr/bin/env bash
# worktreeDaemon.sh — Polling daemon that manages worktree lifecycle.
# NO set -e — uses explicit error checking throughout. A transient git
# command failure must not kill the long-running daemon.
#
# State derived from: git worktree list + .managed-worktree marker + tmux + process table.
# No lockfiles.
#
# Usage: worktreeDaemon.sh <repo-root> [--verbose|-v]

if [ $# -lt 1 ]; then
  echo "Usage: $0 <repo-root> [--verbose|-v]"
  exit 1
fi

REPO_ROOT=$(realpath "$1")
if [ "${2:-}" = "--verbose" ] || [ "${2:-}" = "-v" ]; then
  VERBOSE=true
else
  VERBOSE=false
fi

POLL_INTERVAL=5
PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

# ─── Singleton via PID file ─────────────────────────────────────────────────

if [ -f "${PIDFILE}" ]; then
  existing_pid=$(<"${PIDFILE}") || existing_pid=""
  if [ -n "${existing_pid}" ] && kill -0 "${existing_pid}" 2>/dev/null; then
    # Verify it's actually our daemon (not PID reuse)
    if ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
      log "Daemon already running (PID ${existing_pid}). Exiting."
      exit 0
    fi
  fi
  log "Stale PID file found (PID ${existing_pid:-?}). Taking over."
  rm -f "${PIDFILE}"
fi

echo $$ > "${PIDFILE}"

# ─── Trap ALL signals → cleanup PID file ────────────────────────────────────

cleanup_pidfile() {
  log "Daemon shutting down (PID $$)."
  rm -f "${PIDFILE}"
}
trap 'cleanup_pidfile; exit 0' EXIT SIGINT SIGTERM SIGHUP

log "Daemon started (PID $$)."
vlog "VERBOSE mode enabled. POLL_INTERVAL=${POLL_INTERVAL}s"

# Startup grace period: give the IDE time to launch before checking processes.
# Without this, the daemon can exit before the IDE process is registered.
STARTUP_GRACE=15
ELAPSED_SINCE_START=0

# ─── Main Loop ──────────────────────────────────────────────────────────────

while true; do

  # ── M.1: CHECK ANY PROJECT IDE ALIVE ──────────────────────────────────────

  if ! any_project_ide_alive "${REPO_ROOT}"; then
    if [ "${ELAPSED_SINCE_START}" -lt "${STARTUP_GRACE}" ]; then
      vlog "No IDE found yet, but within startup grace period (${ELAPSED_SINCE_START}/${STARTUP_GRACE}s). Waiting."
    else
      log "All IDEs closed for project. Daemon exiting."
      exit 0
    fi
  fi

  # ── M.2: DISCOVER MANAGED WORKTREES ──────────────────────────────────────

  managed_count=0
  while IFS=' ' read -r wt_path branch_name; do
    [ -z "${wt_path}" ] && continue
    ((managed_count += 1))

    vlog "Processing: ${branch_name} at ${wt_path}"

    # ── M.3.1: CHECK WORKTREE IDE ALIVE ────────────────────────────────────

    local_ide_alive=false
    if ide_is_running_for_path "${wt_path}"; then
      local_ide_alive=true
      vlog "${branch_name}: IDE is running"
    else
      vlog "${branch_name}: IDE not running"
      # Kill tmux session if IDE closed (R7)
      if tmux has-session -t "${branch_name}" 2>/dev/null; then
        tmux kill-session -t "${branch_name}"
        log "${branch_name}: IDE closed, tmux session killed."
      fi
    fi

    # ── M.3.2: CHECK MERGE STATUS (R8) ────────────────────────────────────

    merged=false
    merge_type=""

    if is_worktree_merged "${branch_name}" "${REPO_ROOT}"; then
      merged=true
      merge_type="--no-ff merge"
    elif is_worktree_squash_merged "${branch_name}" "${REPO_ROOT}"; then
      merged=true
      merge_type="squash/rebase merge"
    fi

    if [ "${merged}" = false ]; then
      vlog "${branch_name}: not merged. No action."
      continue
    fi

    log "${branch_name}: MERGED (detected via ${merge_type}). Evaluating cleanup."

    # ── M.3.3: GUARDED CLEANUP ────────────────────────────────────────────

    # a) Skip if IDE is still open
    if [ "${local_ide_alive}" = true ]; then
      log "${branch_name}: WARNING: IDE still open. Skipping cleanup."
      continue
    fi

    # b) Get branch tip for re-verification
    detected_tip=$(git -C "${REPO_ROOT}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || {
      log "${branch_name}: WARNING: Could not resolve branch tip. Skipping."
      continue
    }

    # c-f) Delegate to cleanup_worktree (handles re-verify, scaffold, dirty check, remove)
    if cleanup_worktree "${wt_path}" "${branch_name}" "${REPO_ROOT}" "${detected_tip}"; then
      log "${branch_name}: cleanup succeeded."
    else
      log "${branch_name}: cleanup returned non-zero (worktree may have local changes or IDE open)."
    fi

  done < <(get_worktrees "${REPO_ROOT}")

  vlog "Scan complete. ${managed_count} managed worktree(s) found."

  # ── M.4: SLEEP ──────────────────────────────────────────────────────────

  sleep "${POLL_INTERVAL}"
  ELAPSED_SINCE_START=$((ELAPSED_SINCE_START + POLL_INTERVAL))

done
