#!/usr/bin/env bash
# worktreeLib.sh — Shared functions for worktree management (v2 rewrite).
# No set -e. All functions use explicit error checking.
# Callers should set REPO_ROOT before sourcing. Other vars are passed as arguments.

# ─── Logging ────────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

vlog() {
  [ "${VERBOSE:-false}" = true ] && log "[verbose] $*" || true
}

# ─── Portable Utilities ──────────────────────────────────────────────────────

# Portable realpath that works on non-existent paths (macOS lacks realpath -m).
# Resolves the existing parent directory, then appends the basename.
resolve_path() {
  local target="$1"
  local dir base
  dir="$(dirname "${target}")"
  base="$(basename "${target}")"
  if [ -d "${dir}" ]; then
    echo "$(cd "${dir}" && pwd)/${base}"
  else
    # Fallback: just clean up the path with cd to parent's parent
    echo "${target}"
  fi
}

# ─── Name / Path Validation ─────────────────────────────────────────────────

validate_name() {
  local name="$1"
  if [[ ! "${name}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    log "ERROR: Invalid worktree name '${name}'. Must match [a-zA-Z0-9_-]+"
    return 1
  fi
  return 0
}

resolve_paths() {
  # Sets REPO_ROOT and WORKTREE_PATH using canonical paths.
  # Usage: resolve_paths <worktree_name>
  local name="$1"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  WORKTREE_PATH=$(resolve_path "${REPO_ROOT}/../${name}")
}

# ─── Scaffold Management ────────────────────────────────────────────────────

scaffold_worktree() {
  # Usage: scaffold_worktree <worktree_path> <worktree_name> <repo_root>
  local wt_path="$1"
  local wt_name="$2"
  local repo_root="$3"
  local birth_commit

  birth_commit=$(git -C "${repo_root}" rev-parse HEAD 2>/dev/null) || {
    log "ERROR: Failed to get HEAD commit"
    return 1
  }

  # Write .managed-worktree marker FIRST (prevents daemon race condition)
  cat > "${wt_path}/.managed-worktree" <<EOF
created=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
birth_commit=${birth_commit}
name=${wt_name}
EOF

  # Create scaffold directories
  mkdir -p "${wt_path}/.claude" "${wt_path}/.vscode"

  # Copy settings.json
  cp "${repo_root}/v1/templates/settings.json" "${wt_path}/.claude/settings.json"

  # Render tasks.json template (sed __NAME__ placeholders)
  sed "s/__NAME__/${wt_name}/g" "${repo_root}/v1/templates/tasks.json" > "${wt_path}/.vscode/tasks.json"

  # Auto-allow VS Code automatic tasks
  cat > "${wt_path}/.vscode/settings.json" <<'EOF2'
{"task.allowAutomaticTasks": "on"}
EOF2

  # Hide scaffold files from git status.
  # Tracked files (.claude/settings.json, .vscode/tasks.json) need --skip-worktree.
  # Untracked files (.managed-worktree, .vscode/settings.json) use .git/info/exclude.
  local tracked_scaffold=(
    ".claude/settings.json"
    ".vscode/tasks.json"
  )
  for entry in "${tracked_scaffold[@]}"; do
    git -C "${wt_path}" update-index --skip-worktree "${entry}" 2>/dev/null || true
  done

  # For untracked files, use .git/info/exclude
  local exclude_file
  local gitdir
  gitdir=$(git -C "${wt_path}" rev-parse --git-dir 2>/dev/null) || true
  if [ -n "${gitdir}" ]; then
    if [[ "${gitdir}" != /* ]]; then
      gitdir="${wt_path}/${gitdir}"
    fi
    exclude_file="${gitdir}/info/exclude"
    mkdir -p "$(dirname "${exclude_file}")"
  else
    exclude_file="${wt_path}/.git/info/exclude"
  fi

  local untracked_scaffold=(
    ".managed-worktree"
    ".vscode/settings.json"
  )
  for entry in "${untracked_scaffold[@]}"; do
    if ! grep -qxF "${entry}" "${exclude_file}" 2>/dev/null; then
      echo "${entry}" >> "${exclude_file}"
    fi
  done

  vlog "Scaffold complete for '${wt_name}' at ${wt_path}"
}

check_scaffold_modified() {
  # Check if scaffold files have been modified from their templates.
  # Returns 0 if modified (needs prompt), 1 if unchanged.
  # Usage: check_scaffold_modified <worktree_path> <worktree_name> <repo_root>
  local wt_path="$1"
  local wt_name="$2"
  local repo_root="$3"
  local modified=false

  # Check tasks.json against RENDERED template
  if [ -f "${wt_path}/.vscode/tasks.json" ]; then
    local rendered
    rendered=$(sed "s/__NAME__/${wt_name}/g" "${repo_root}/v1/templates/tasks.json")
    if ! diff -q <(echo "${rendered}") "${wt_path}/.vscode/tasks.json" >/dev/null 2>&1; then
      vlog "tasks.json has been modified"
      modified=true
    fi
  fi

  # Check settings.json against template
  if [ -f "${wt_path}/.claude/settings.json" ]; then
    if ! diff -q "${repo_root}/v1/templates/settings.json" "${wt_path}/.claude/settings.json" >/dev/null 2>&1; then
      vlog "settings.json has been modified"
      modified=true
    fi
  fi

  if [ "${modified}" = true ]; then
    return 0
  fi
  return 1
}

discard_scaffold_files() {
  # Remove scaffold files from worktree.
  # Usage: discard_scaffold_files <worktree_path>
  local wt_path="$1"
  rm -f "${wt_path}/.claude/settings.json"
  rm -f "${wt_path}/.vscode/tasks.json"
  rm -f "${wt_path}/.vscode/settings.json"
  rm -f "${wt_path}/.managed-worktree"
  rmdir "${wt_path}/.claude" 2>/dev/null || true
  rmdir "${wt_path}/.vscode" 2>/dev/null || true
  vlog "Scaffold files discarded from ${wt_path}"
}

has_non_scaffold_changes() {
  # Check if worktree has changes beyond scaffold files.
  # Scaffold files are excluded via .git/info/exclude, so they won't appear
  # in git status at all. Any output from git status means real changes.
  # Returns 0 if there ARE non-scaffold changes, 1 if clean.
  # Usage: has_non_scaffold_changes <worktree_path>
  local wt_path="$1"
  local status_output
  status_output=$(git -C "${wt_path}" status --porcelain 2>/dev/null) || return 1

  if [ -n "${status_output}" ]; then
    vlog "Non-scaffold changes found in ${wt_path}:"
    vlog "${status_output}"
    return 0
  fi
  return 1
}

# ─── Worktree Discovery ─────────────────────────────────────────────────────

get_worktrees() {
  # Parse git worktree list --porcelain, filter by .managed-worktree marker.
  # Outputs lines of: <path> <branch_name>
  # Skips main worktree (first entry), detached HEAD, and prunable entries.
  # Usage: get_worktrees <repo_root>
  local repo_root="$1"
  local first=true
  local wt_path="" branch=""

  while IFS= read -r line; do
    if [ -z "${line}" ]; then
      # Empty line = end of entry
      if [ "${first}" = true ]; then
        first=false
        wt_path=""
        branch=""
        continue
      fi

      if [ -n "${wt_path}" ] && [ -n "${branch}" ]; then
        # Check for .managed-worktree marker
        if [ -f "${wt_path}/.managed-worktree" ]; then
          echo "${wt_path} ${branch}"
        else
          vlog "Skipping unmanaged worktree: ${wt_path}"
        fi
      fi
      wt_path=""
      branch=""
      continue
    fi

    case "${line}" in
      worktree\ *)
        wt_path="${line#worktree }"
        ;;
      branch\ *)
        # Extract branch name: "branch refs/heads/foo" → "foo"
        branch="${line#branch refs/heads/}"
        ;;
      prunable\ *)
        # Skip prunable entries
        wt_path=""
        ;;
    esac
  done < <(git -C "${repo_root}" worktree list --porcelain 2>/dev/null; echo "")
  # Extra empty line ensures last entry is processed
}

is_managed_worktree() {
  # Check if a path has a .managed-worktree marker.
  # Usage: is_managed_worktree <worktree_path>
  [ -f "$1/.managed-worktree" ]
}

# ─── Merge Detection ────────────────────────────────────────────────────────

is_worktree_merged() {
  # Detect --no-ff merge by scanning merge commit parents.
  # Returns 0 if branch tip appears as a non-first parent of any merge commit.
  # Usage: is_worktree_merged <branch_name> [repo_root]
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip

  branch_tip=$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || return 1

  # Read birth commit from marker (if available) to scope the search
  local worktree_path
  worktree_path=$(git -C "${repo_root}" worktree list --porcelain 2>/dev/null | \
    awk -v branch="refs/heads/${branch_name}" '/^worktree /{p=$2} /^branch /{if($2==branch) print p}')

  local since_flag=""
  if [ -n "${worktree_path}" ] && [ -f "${worktree_path}/.managed-worktree" ]; then
    local birth_commit
    birth_commit=$(grep '^birth_commit=' "${worktree_path}/.managed-worktree" 2>/dev/null | cut -d= -f2)
    if [ -n "${birth_commit}" ]; then
      since_flag="--since=30 days ago"
    fi
  fi

  # Scan merge commits using awk (fast, C-based)
  # shellcheck disable=SC2086
  git -C "${repo_root}" log --all --merges --format='%H %P' ${since_flag} 2>/dev/null | \
    awk -v tip="${branch_tip}" '{
      for (i = 3; i <= NF; i++)
        if ($i == tip) exit 0
    } END { exit 1 }'
}

is_worktree_squash_merged() {
  # Detect squash/rebase merges via tracking branch [gone] or tree hash match.
  # Returns 0 if squash-merged, 1 otherwise.
  # Usage: is_worktree_squash_merged <branch_name> [repo_root]
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip

  branch_tip=$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || return 1

  # Method 1: Check if tracking branch is [gone]
  local tracking
  tracking=$(git -C "${repo_root}" for-each-ref --format='%(upstream:track)' "refs/heads/${branch_name}" 2>/dev/null)
  if [ "${tracking}" = "[gone]" ]; then
    return 0
  fi

  # Method 2: Tree hash match — branch tip's tree matches a commit on main
  local tree main_branch
  tree=$(git -C "${repo_root}" rev-parse "${branch_tip}^{tree}" 2>/dev/null) || return 1

  # Try common main branch names
  for main_branch in main master; do
    if git -C "${repo_root}" show-ref --verify --quiet "refs/heads/${main_branch}" 2>/dev/null; then
      if git -C "${repo_root}" log "${main_branch}" --format='%T' --since="30 days ago" 2>/dev/null | \
        awk -v tree="${tree}" '$1 == tree { exit 0 } END { exit 1 }'; then
        return 0
      fi
    fi
  done

  return 1
}

# ─── Process Management ─────────────────────────────────────────────────────

ide_is_running_for_path() {
  # Check if an agy IDE process is running with the given canonical path.
  # Uses pgrep -x for exact process name match + ps for path verification.
  # Usage: ide_is_running_for_path <canonical_path>
  local target_path
  target_path=$(realpath "$1" 2>/dev/null) || target_path="$1"

  local pid cmd
  for pid in $(pgrep -x agy 2>/dev/null); do
    cmd=$(ps -p "${pid}" -o command= 2>/dev/null) || continue
    if [[ "${cmd}" == *"${target_path}"* ]]; then
      return 0
    fi
  done
  return 1
}

any_project_ide_alive() {
  # Check if ANY agy process is running for this project (main or worktree).
  # Usage: any_project_ide_alive <repo_root>
  local repo_root
  repo_root=$(realpath "$1" 2>/dev/null) || repo_root="$1"
  local parent_dir
  parent_dir=$(dirname "${repo_root}")

  local pid cmd
  for pid in $(pgrep -x agy 2>/dev/null); do
    cmd=$(ps -p "${pid}" -o command= 2>/dev/null) || continue
    # Check for main repo path or any path under the same parent (worktrees)
    if [[ "${cmd}" == *"${repo_root}"* ]] || [[ "${cmd}" == *"${parent_dir}"* ]]; then
      return 0
    fi
  done
  return 1
}

daemon_already_running() {
  # Check if daemon is already running via PID file + kill -0 + command verify.
  # Usage: daemon_already_running <pidfile>
  local pidfile="$1"

  if [ ! -f "${pidfile}" ]; then
    return 1
  fi

  local existing_pid
  existing_pid=$(<"${pidfile}") || return 1

  if kill -0 "${existing_pid}" 2>/dev/null; then
    # Verify it's actually our daemon (not PID reuse)
    if ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
      return 0
    fi
  fi

  # Stale PID file
  return 1
}

daemon_is_running() {
  # Simple check: PID file exists and process is alive.
  # Usage: daemon_is_running <pidfile>
  local pidfile="$1"
  [ -f "${pidfile}" ] && kill -0 "$(<"${pidfile}")" 2>/dev/null
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────

cleanup_worktree() {
  # Guarded cleanup: check processes, re-verify tip, discard scaffold,
  # check dirty, remove worktree (no --force), delete branch, prune.
  # Usage: cleanup_worktree <worktree_path> <branch_name> <repo_root> [detected_tip]
  local wt_path="$1"
  local branch_name="$2"
  local repo_root="$3"
  local detected_tip="${4:-}"

  log "Evaluating cleanup for ${wt_path} (branch: ${branch_name})"

  if [ ! -d "${wt_path}" ]; then
    log "Worktree path already removed: ${wt_path}"
    return 0
  fi

  # Guard: check if IDE is still open for this worktree
  if ide_is_running_for_path "${wt_path}"; then
    log "WARNING: IDE still running for ${wt_path}. Skipping cleanup."
    return 1
  fi

  # Guard: kill tmux session if alive
  if tmux has-session -t "${branch_name}" 2>/dev/null; then
    tmux kill-session -t "${branch_name}"
    log "tmux session '${branch_name}' killed."
  fi

  # Guard: re-verify branch tip hasn't moved since merge detection
  if [ -n "${detected_tip}" ]; then
    local current_tip
    current_tip=$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || true
    if [ -n "${current_tip}" ] && [ "${current_tip}" != "${detected_tip}" ]; then
      log "WARNING: Branch tip moved since merge detection (${detected_tip} -> ${current_tip}). Skipping."
      return 1
    fi
  fi

  # Remove scaffold files
  discard_scaffold_files "${wt_path}"

  # Check for dirty files (non-scaffold changes)
  if has_non_scaffold_changes "${wt_path}"; then
    local dirty_files
    dirty_files=$(git -C "${wt_path}" status --porcelain 2>/dev/null)
    log "WARNING: Worktree has uncommitted changes. Keeping ${wt_path}:"
    log "${dirty_files}"
    return 1
  fi

  vlog "No non-scaffold changes, proceeding with removal"

  # Remove worktree (NO --force — let git safety checks run)
  if git -C "${repo_root}" worktree remove "${wt_path}" 2>/dev/null; then
    log "Worktree removed: ${wt_path}"
  else
    log "ERROR: git worktree remove failed for ${wt_path}. Skipping."
    return 1
  fi

  # Delete branch
  if git -C "${repo_root}" branch -D "${branch_name}" 2>/dev/null; then
    log "Branch deleted: ${branch_name}"
  else
    log "WARNING: Branch delete failed for ${branch_name}"
  fi

  # Prune stale worktree entries
  git -C "${repo_root}" worktree prune 2>/dev/null || true

  return 0
}
