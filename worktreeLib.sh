#!/usr/bin/env bash
# worktreeLib.sh — Shared cleanup functions for worktree management.
# Callers must set WORKTREE_PATH, WORKTREE_NAME, and REPO_ROOT before calling.
# Callers may set VERBOSE=true and provide a log() function for verbose output.

_vlog() {
  if [ "${VERBOSE:-false}" = true ]; then
    if type log &>/dev/null; then
      log "[verbose] $*"
    else
      echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [verbose] $*"
    fi
  fi
}

is_ignored_worktree_file() {
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

  while IFS= read -r line; do
    path="${line:3}"

    if is_ignored_worktree_file "${path}"; then
      _vlog "has_meaningful_changes: ignored file: ${path}"
    else
      _vlog "has_meaningful_changes: meaningful file: ${path}"
      return 0
    fi
  done < <(git -C "${WORKTREE_PATH}" status --porcelain --untracked-files=all 2>/dev/null || true)

  _vlog "has_meaningful_changes: no meaningful changes found"
  return 1
}

discard_ignored_changes() {
  local line path

  while IFS= read -r line; do
    path="${line:3}"

    case "${path}" in
      ".claude/settings.json")
        _vlog "discard_ignored_changes: discarding ${path}"
        git -C "${WORKTREE_PATH}" clean -f -- ".claude/settings.json"
        rmdir "${WORKTREE_PATH}/.claude" 2>/dev/null || true
        ;;
      ".vscode/tasks.json")
        _vlog "discard_ignored_changes: discarding ${path}"
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

  _vlog "cleanup_worktree: discarding ignored changes"
  discard_ignored_changes

  _vlog "cleanup_worktree: checking for meaningful changes"
  if has_meaningful_changes; then
    echo "Worktree has local changes; keeping ${WORKTREE_PATH}"
    return 1
  fi
  _vlog "cleanup_worktree: no meaningful changes, proceeding with removal"

  if git -C "${REPO_ROOT}" worktree remove "${WORKTREE_PATH}"; then
    echo "Worktree removed."
  else
    echo "Failed to remove worktree: ${WORKTREE_PATH}"
    return 1
  fi

  if tmux has-session -t "${WORKTREE_NAME}" 2>/dev/null; then
    tmux kill-session -t "${WORKTREE_NAME}"
    echo "tmux session killed."
  else
    _vlog "cleanup_worktree: no tmux session '${WORKTREE_NAME}' to kill"
  fi

  if git -C "${REPO_ROOT}" branch -d "${WORKTREE_NAME}" 2>/dev/null; then
    echo "Branch deleted."
  else
    echo "Branch ${WORKTREE_NAME} kept (unmerged changes). Delete with: git branch -D ${WORKTREE_NAME}"
  fi
}
