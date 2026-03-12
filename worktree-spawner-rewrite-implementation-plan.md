# Worktree Spawner Rewrite — Implementation Plan

Source spec: worktree-spawner-rewrite.md (v2, post three-way AI review)

---

## Phase 1: worktreeLib.sh

Write all shared functions. No set -e. Every function uses explicit error checking.
Source this file from both spawnWorktree.sh and worktreeDaemon.sh.

### 1.1 Logging

```bash
VERBOSE="${VERBOSE:-false}"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

vlog() {
  [ "${VERBOSE}" = true ] && log "[verbose] $*" || true
}
```

### 1.2 Name/Path Validation

```bash
validate_name() {
  local name="$1"
  if [[ ! "${name}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "Error: invalid worktree name '${name}'. Must match [a-zA-Z0-9_-]+" >&2
    return 1
  fi
}

resolve_paths() {
  # Sets REPO_ROOT and WORKTREE_PATH as globals using realpath
  REPO_ROOT="$(realpath "$(git rev-parse --show-toplevel)")"
  WORKTREE_PATH="$(realpath -m "${REPO_ROOT}/../${WORKTREE_NAME}")"
}
```

### 1.3 Process Management

```bash
ide_is_running_for_path() {
  # Returns 0 if an agy process exists with the given canonical path as an argument.
  # Uses pgrep -x agy (exact binary match) + ps command inspection.
  local target_path="$1"
  local canonical
  canonical="$(realpath "${target_path}" 2>/dev/null)" || canonical="${target_path}"

  local pid
  for pid in $(pgrep -x agy 2>/dev/null); do
    local cmd
    cmd="$(ps -p "${pid}" -o command= 2>/dev/null)" || continue
    if [[ "${cmd}" == *"${canonical}"* ]]; then
      return 0
    fi
  done
  return 1
}

daemon_already_running() {
  # Returns 0 if a daemon is already running for this REPO_ROOT.
  # Uses PID file + kill -0 + command verification (guards against PID reuse).
  local pidfile="${REPO_ROOT}/.worktree-daemon.pid"
  if [ -f "${pidfile}" ]; then
    local existing_pid
    existing_pid="$(<"${pidfile}")"
    if kill -0 "${existing_pid}" 2>/dev/null; then
      if ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
        return 0
      fi
    fi
    # Stale PID file
    rm -f "${pidfile}"
  fi
  return 1
}

any_project_ide_alive() {
  # Returns 0 if ANY agy process exists for this project (main repo or any worktree).
  # Checks against the parent directory that contains the repo and all worktrees.
  local project_parent
  project_parent="$(dirname "${REPO_ROOT}")"
  local pid
  for pid in $(pgrep -x agy 2>/dev/null); do
    local cmd
    cmd="$(ps -p "${pid}" -o command= 2>/dev/null)" || continue
    if [[ "${cmd}" == *"${project_parent}"* ]]; then
      return 0
    fi
  done
  return 1
}
```

### 1.4 Worktree Discovery

```bash
get_worktrees() {
  # Prints tab-separated (path, branch_name) pairs for all linked worktrees.
  # Skips: main worktree (first entry), detached HEAD entries, prunable entries.
  # Caller reads with: while IFS=$'\t' read -r wt_path wt_branch; do ... done < <(get_worktrees)
  local repo_root="${1:-${REPO_ROOT}}"
  local first=true
  local current_path="" current_branch=""

  git -C "${repo_root}" worktree list --porcelain 2>/dev/null | while IFS= read -r line; do
    case "${line}" in
      "worktree "*)
        # Emit previous entry (if not the first/main worktree)
        if [ -n "${current_path}" ] && [ "${first}" = false ] && [ -n "${current_branch}" ]; then
          printf '%s\t%s\n' "${current_path}" "${current_branch}"
        fi
        current_path="${line#worktree }"
        current_branch=""
        first=false
        ;;
      "branch refs/heads/"*)
        current_branch="${line#branch refs/heads/}"
        ;;
      "detached"|"prunable")
        current_branch=""  # skip these
        ;;
      "")
        # Blank line = end of entry. Emit if valid.
        if [ -n "${current_path}" ] && [ "${first}" = false ] && [ -n "${current_branch}" ]; then
          printf '%s\t%s\n' "${current_path}" "${current_branch}"
        fi
        # Reset but DON'T reset first (it's only true for the very first entry)
        current_path=""
        current_branch=""
        ;;
    esac
  done
  # Emit final entry if not emitted by blank line
  if [ -n "${current_path}" ] && [ "${first}" = false ] && [ -n "${current_branch}" ]; then
    printf '%s\t%s\n' "${current_path}" "${current_branch}"
  fi
}

is_managed_worktree() {
  # Returns 0 if the worktree has a .managed-worktree marker file.
  local wt_path="$1"
  [ -f "${wt_path}/.managed-worktree" ]
}
```

### 1.5 Scaffold Management

```bash
scaffold_worktree() {
  # Creates scaffold files + .managed-worktree marker + .git/info/exclude entries.
  # MUST be called after the worktree directory exists.
  local wt_path="$1"
  local wt_name="$2"
  local repo_root="${3:-${REPO_ROOT}}"
  local birth_commit
  birth_commit="$(git -C "${repo_root}" rev-parse HEAD)"

  # Write marker FIRST (prevents daemon race — daemon skips unmanaged worktrees)
  cat > "${wt_path}/.managed-worktree" <<EOF
name=${wt_name}
birth_commit=${birth_commit}
created=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF

  # Copy Claude settings
  mkdir -p "${wt_path}/.claude"
  cp "${repo_root}/v1/templates/settings.json" "${wt_path}/.claude/settings.json"

  # Generate tasks.json from template (replace __NAME__ placeholder)
  mkdir -p "${wt_path}/.vscode"
  sed "s/__NAME__/${wt_name}/g" "${repo_root}/v1/templates/tasks.json" \
    > "${wt_path}/.vscode/tasks.json"

  # Allow automatic tasks in this workspace (avoids VS Code trust prompt)
  cat > "${wt_path}/.vscode/settings.json" <<'EOF2'
{
  "task.allowAutomaticTasks": "on"
}
EOF2

  # Make scaffold files invisible to git (worktree-local exclude, not .gitignore)
  local exclude_file="${wt_path}/.git/info/exclude"
  # .git in a worktree is a file pointing to the real gitdir. The exclude file
  # lives inside the real gitdir. For worktrees, .git/info/exclude may need
  # the actual gitdir path.
  local gitdir
  gitdir="$(git -C "${wt_path}" rev-parse --git-dir 2>/dev/null)"
  if [ -n "${gitdir}" ]; then
    exclude_file="${gitdir}/info/exclude"
  fi
  mkdir -p "$(dirname "${exclude_file}")"

  # Append only if not already present
  for pattern in ".claude/settings.json" ".vscode/tasks.json" ".vscode/settings.json" ".managed-worktree"; do
    if ! grep -qxF "${pattern}" "${exclude_file}" 2>/dev/null; then
      echo "${pattern}" >> "${exclude_file}"
    fi
  done
}

check_scaffold_modified() {
  # Returns 0 if scaffold files have been modified from their templates.
  # Compares against RENDERED template (sed __NAME__ applied), not raw template.
  local wt_path="$1"
  local wt_name="$2"
  local repo_root="${3:-${REPO_ROOT}}"
  local modified=false

  # Check settings.json
  if [ -f "${wt_path}/.claude/settings.json" ]; then
    if ! diff -q "${wt_path}/.claude/settings.json" \
                 "${repo_root}/v1/templates/settings.json" >/dev/null 2>&1; then
      modified=true
    fi
  fi

  # Check tasks.json against rendered template
  if [ -f "${wt_path}/.vscode/tasks.json" ]; then
    local rendered
    rendered="$(sed "s/__NAME__/${wt_name}/g" "${repo_root}/v1/templates/tasks.json")"
    if [ "$(cat "${wt_path}/.vscode/tasks.json")" != "${rendered}" ]; then
      modified=true
    fi
  fi

  [ "${modified}" = true ]
}

discard_scaffold_files() {
  # Removes scaffold files. Safe to call even if files don't exist.
  local wt_path="$1"
  rm -f "${wt_path}/.claude/settings.json"
  rm -f "${wt_path}/.vscode/tasks.json"
  rm -f "${wt_path}/.vscode/settings.json"
  rm -f "${wt_path}/.managed-worktree"
  # Clean up empty directories
  rmdir "${wt_path}/.claude" 2>/dev/null || true
  rmdir "${wt_path}/.vscode" 2>/dev/null || true
}

has_non_scaffold_changes() {
  # Returns 0 if the worktree has uncommitted/untracked files.
  # Scaffold files are excluded from git tracking via .git/info/exclude,
  # so they won't appear in git status.
  local wt_path="$1"
  local status
  status="$(git -C "${wt_path}" status --porcelain 2>/dev/null)"
  [ -n "${status}" ]
}
```

### 1.6 Merge Detection

```bash
is_worktree_merged() {
  # Returns 0 if the worktree branch has been merged via --no-ff.
  # Strategy: find a merge commit whose non-first parent equals the branch tip.
  # Uses awk for performance. Scoped by --since when birth_commit is available.
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip

  branch_tip="$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null)" || return 1

  # Read birth_commit from .managed-worktree marker (if available)
  local worktree_path birth_commit=""
  worktree_path="$(git -C "${repo_root}" worktree list --porcelain | \
    awk -v branch="refs/heads/${branch_name}" \
      '/^worktree /{p=$2} /^branch /{if($2==branch) print p}')"
  if [ -f "${worktree_path}/.managed-worktree" ]; then
    birth_commit="$(grep '^birth_commit=' "${worktree_path}/.managed-worktree" | cut -d= -f2)"
  fi

  # Scope search to recent history when birth_commit is known
  local since_flag=""
  if [ -n "${birth_commit}" ]; then
    since_flag="--since=30 days ago"
  fi

  # awk: for each merge commit line "HASH P1 P2 [P3...]", check if branch_tip
  # matches any non-first parent (field 3+). Exit 0 on first match.
  # shellcheck disable=SC2086
  git -C "${repo_root}" log --all --merges --format='%H %P' ${since_flag} 2>/dev/null | \
    awk -v tip="${branch_tip}" '{
      for (i = 3; i <= NF; i++)
        if ($i == tip) exit 0
    } END { exit 1 }'
}

is_worktree_squash_merged() {
  # Returns 0 if the branch was squash-merged (no merge commit exists).
  # Two detection methods:
  #   1. Tracking branch is [gone] (remote deleted after PR merge)
  #   2. Tree hash of branch tip matches a commit on main
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip

  branch_tip="$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null)" || return 1

  # Method 1: tracking branch [gone]
  local tracking
  tracking="$(git -C "${repo_root}" for-each-ref --format='%(upstream:track)' \
    "refs/heads/${branch_name}" 2>/dev/null)"
  if [ "${tracking}" = "[gone]" ]; then
    return 0
  fi

  # Method 2: tree hash match against main
  local tree
  tree="$(git -C "${repo_root}" rev-parse "${branch_tip}^{tree}" 2>/dev/null)" || return 1

  git -C "${repo_root}" log main --format='%T' --since="30 days ago" 2>/dev/null | \
    awk -v tree="${tree}" '$1 == tree { exit 0 } END { exit 1 }'
}
```

### 1.7 Cleanup

```bash
cleanup_worktree() {
  # Guarded cleanup: multiple checks before deletion.
  # Returns 0 on successful cleanup, 1 if blocked.
  local wt_path="$1"
  local wt_branch="$2"
  local repo_root="${3:-${REPO_ROOT}}"

  # Guard 1: IDE must NOT be running for this worktree
  if ide_is_running_for_path "${wt_path}"; then
    log "${wt_branch}: IDE still open at ${wt_path}. Skipping cleanup."
    return 1
  fi

  # Guard 2: Kill tmux session if still alive
  if tmux has-session -t "${wt_branch}" 2>/dev/null; then
    tmux kill-session -t "${wt_branch}" 2>/dev/null || true
    log "${wt_branch}: tmux session killed."
  fi

  # Guard 3: Re-verify branch tip hasn't changed since detection
  # (caller should pass expected_tip if available)
  local current_tip
  current_tip="$(git -C "${repo_root}" rev-parse "refs/heads/${wt_branch}" 2>/dev/null)" || {
    log "${wt_branch}: branch already deleted. Cleaning up worktree path."
    git -C "${repo_root}" worktree remove "${wt_path}" 2>/dev/null || rm -rf "${wt_path}"
    git -C "${repo_root}" worktree prune 2>/dev/null || true
    return 0
  }

  # Remove scaffold files
  discard_scaffold_files "${wt_path}"

  # Guard 4: Check for dirty files (non-scaffold)
  if has_non_scaffold_changes "${wt_path}"; then
    log "WARNING: ${wt_branch} has uncommitted/untracked files:"
    git -C "${wt_path}" status --porcelain 2>/dev/null | while IFS= read -r line; do
      log "  ${line}"
    done
    log "Skipping auto-deletion. Clean up manually: git worktree remove --force ${wt_path}"
    return 1
  fi

  # All guards passed. Remove worktree (NO --force — let git safety catch anything we missed).
  if git -C "${repo_root}" worktree remove "${wt_path}" 2>/dev/null; then
    log "${wt_branch}: worktree removed."
  else
    log "${wt_branch}: git worktree remove failed. Skipping."
    return 1
  fi

  # Delete branch
  if git -C "${repo_root}" branch -D "${wt_branch}" 2>/dev/null; then
    log "${wt_branch}: branch deleted."
  else
    log "${wt_branch}: branch delete failed (may already be gone)."
  fi

  git -C "${repo_root}" worktree prune 2>/dev/null || true
  log "${wt_branch}: cleanup succeeded."
  return 0
}
```

---

## Phase 2: v1/templates/tasks.json

Create this file exactly as specified. __NAME__ placeholders are replaced by sed
in scaffold_worktree().

Key details:
- npm install: runOnFolderOpen, NOT isBackground, empty problemMatcher
- Claude + tmux: dependsOn npm install, isBackground, same group for split
- problemMatcher with beginsPattern/endsPattern prevents VS Code task engine hang
- tmux uses -A flag (attach-or-create, idempotent)
- claude command: check if installed first with command -v

File content: see spec Section 3 for exact JSON.

---

## Phase 3: v1/templates/bootstrap.sh

Fallback script if VS Code automatic tasks don't fire.

```bash
#!/bin/bash
set -e
WT_NAME="${1:?Usage: bootstrap.sh <worktree-name>}"
npm install
tmux new-session -A -d -s "${WT_NAME}" 2>/dev/null || true
command -v claude >/dev/null 2>&1 && claude --permission-mode plan || echo "Claude CLI not found"
```

---

## Phase 4: spawnWorktree.sh

Sources worktreeLib.sh. Handles the full state matrix.

```bash
#!/usr/bin/env bash
# spawnWorktree.sh — Create or reopen a managed worktree.
# Usage: spawnWorktree.sh [--force] <worktree-name>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

# --- Parse arguments ---
FORCE=false
WORKTREE_NAME=""
for arg in "$@"; do
  case "${arg}" in
    --force|-f) FORCE=true ;;
    --help|-h)
      echo "Usage: $0 [--force] <worktree-name>"
      exit 0
      ;;
    *)
      if [ -z "${WORKTREE_NAME}" ]; then
        WORKTREE_NAME="${arg// /_}"
      else
        echo "Error: unexpected argument '${arg}'" >&2
        exit 1
      fi
      ;;
  esac
done

if [ -z "${WORKTREE_NAME}" ]; then
  echo "Error: worktree name required" >&2
  echo "Usage: $0 [--force] <worktree-name>"
  exit 1
fi

# --- Step 1: Validate ---
validate_name "${WORKTREE_NAME}" || exit 1
resolve_paths  # sets REPO_ROOT, WORKTREE_PATH

# --- Step 2: Determine state ---
path_exists=false
branch_exists=false
[ -d "${WORKTREE_PATH}" ] && path_exists=true
git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}" 2>/dev/null && branch_exists=true

# --- Step 3: Handle state matrix ---
if [ "${path_exists}" = true ] && [ "${branch_exists}" = true ]; then
  # CASE A: REOPEN
  echo "Reopening existing worktree '${WORKTREE_NAME}' at ${WORKTREE_PATH}"

  if check_scaffold_modified "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"; then
    if [ "${FORCE}" = true ]; then
      echo "  --force: overwriting modified scaffold files."
      scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"
    else
      echo "  Scaffold files (settings.json / tasks.json) have been modified."
      read -rp "  Overwrite with templates? [y/N]: " answer
      case "${answer}" in
        y|Y) scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}" ;;
        *)   echo "  Keeping existing scaffold files." ;;
      esac
    fi
  else
    # Not modified or missing — always scaffold
    scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"
  fi

elif [ "${branch_exists}" = true ] && [ "${path_exists}" = false ]; then
  # CASE B: RE-CREATE from existing branch
  echo "Reusing existing branch '${WORKTREE_NAME}'."
  git worktree prune 2>/dev/null || true
  git worktree add "${WORKTREE_PATH}" "${WORKTREE_NAME}"
  scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"

elif [ "${path_exists}" = true ] && [ "${branch_exists}" = false ]; then
  # CASE C: ERROR
  echo "Error: path exists at ${WORKTREE_PATH} but branch '${WORKTREE_NAME}' does not." >&2
  echo "Manual cleanup required:" >&2
  echo "  rm -rf ${WORKTREE_PATH}" >&2
  echo "  git worktree prune" >&2
  exit 1

else
  # CASE D: FRESH CREATE
  git worktree add -b "${WORKTREE_NAME}" "${WORKTREE_PATH}" HEAD
  scaffold_worktree "${WORKTREE_PATH}" "${WORKTREE_NAME}" "${REPO_ROOT}"
fi

# --- Step 5: Open IDE ---
echo "Opening IDE at ${WORKTREE_PATH}"
agy --new-window "${WORKTREE_PATH}"

# --- Step 6: Ensure daemon ---
if daemon_already_running; then
  vlog "Daemon already running."
else
  rm -f "${REPO_ROOT}/.worktree-daemon.pid"
  nohup "${REPO_ROOT}/worktreeDaemon.sh" "${REPO_ROOT}" \
    >> "${REPO_ROOT}/.worktree-daemon.log" 2>&1 &
  echo "Daemon started (PID $!)."
fi

# --- Step 7: Summary ---
echo "Worktree '${WORKTREE_NAME}' ready at ${WORKTREE_PATH}"
echo "IDE tasks will run: npm install -> Claude + tmux (side-by-side)"
```

---

## Phase 5: worktreeDaemon.sh

```bash
#!/usr/bin/env bash
# worktreeDaemon.sh — Polling daemon for worktree lifecycle management.
# Usage: worktreeDaemon.sh <repo-root> [--verbose]
#
# IMPORTANT: Do NOT use set -e. Transient git failures must not kill the daemon.

if [ $# -lt 1 ]; then
  echo "Usage: $0 <repo-root> [--verbose]"
  exit 1
fi

REPO_ROOT="$(realpath "$1")"
VERBOSE=false
[ "${2:-}" = "--verbose" ] || [ "${2:-}" = "-v" ] && VERBOSE=true
POLL_INTERVAL=5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/worktreeLib.sh"

PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"

# --- Singleton check ---
if [ -f "${PIDFILE}" ]; then
  existing_pid="$(<"${PIDFILE}")"
  if kill -0 "${existing_pid}" 2>/dev/null; then
    if ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
      log "Daemon already running (PID ${existing_pid}). Exiting."
      exit 0
    fi
  fi
  log "Stale PID file found (PID ${existing_pid}). Taking over."
  rm -f "${PIDFILE}"
fi

echo $$ > "${PIDFILE}"

# --- Signal handling ---
cleanup_pidfile() { rm -f "${PIDFILE}"; }
trap 'log "Daemon shutting down (PID $$)."; cleanup_pidfile; exit 0' EXIT SIGINT SIGTERM SIGHUP

log "Daemon started (PID $$)."
vlog "VERBOSE mode enabled. POLL_INTERVAL=${POLL_INTERVAL}s"

# --- Main loop ---
while true; do

  # M.1: Check if any project IDE is alive
  if ! any_project_ide_alive; then
    log "No project IDE processes found. Daemon exiting."
    exit 0
  fi

  # M.2: Discover managed worktrees
  local_worktrees=()
  while IFS=$'\t' read -r wt_path wt_branch; do
    if is_managed_worktree "${wt_path}"; then
      local_worktrees+=("${wt_path}|${wt_branch}")
    else
      vlog "Skipping unmanaged worktree: ${wt_path} (${wt_branch})"
    fi
  done < <(get_worktrees "${REPO_ROOT}")

  if [ ${#local_worktrees[@]} -eq 0 ]; then
    vlog "No managed worktrees found. Continuing to poll."
  fi

  log "--- scan cycle: ${#local_worktrees[@]} managed worktree(s) ---"

  # M.3: Process each managed worktree
  for entry in "${local_worktrees[@]}"; do
    wt_path="${entry%%|*}"
    wt_branch="${entry##*|}"

    vlog "${wt_branch}: checking (path=${wt_path})"

    # M.3.0: Verify worktree path still exists
    if [ ! -d "${wt_path}" ]; then
      log "${wt_branch}: worktree path gone. Cleaning up remnants."
      git -C "${REPO_ROOT}" worktree prune 2>/dev/null || true
      if git -C "${REPO_ROOT}" branch -d "${wt_branch}" 2>/dev/null; then
        log "${wt_branch}: branch deleted."
      fi
      continue
    fi

    # M.3.1: Check if worktree IDE is alive → kill tmux if dead (R7)
    if ! ide_is_running_for_path "${wt_path}"; then
      if tmux has-session -t "${wt_branch}" 2>/dev/null; then
        tmux kill-session -t "${wt_branch}" 2>/dev/null || true
        log "${wt_branch}: IDE closed, tmux session killed."
      fi
    fi

    # M.3.2: Check merge status (R8)
    local merged=false
    if is_worktree_merged "${wt_branch}" "${REPO_ROOT}"; then
      log "${wt_branch}: detected as merged (--no-ff merge commit found)."
      merged=true
    elif is_worktree_squash_merged "${wt_branch}" "${REPO_ROOT}"; then
      log "${wt_branch}: detected as squash-merged."
      merged=true
    fi

    # M.3.3: If merged → guarded cleanup
    if [ "${merged}" = true ]; then
      if cleanup_worktree "${wt_path}" "${wt_branch}" "${REPO_ROOT}"; then
        log "${wt_branch}: cleanup succeeded."
      else
        log "${wt_branch}: cleanup blocked (see above)."
      fi
    else
      vlog "${wt_branch}: not merged. No action."
    fi
  done

  sleep "${POLL_INTERVAL}"
done
```

---

## Phase 6: .vscode/tasks.json (main repo)

Replace the current content. Keep the spawn task (update path), add daemon fork task.

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Spawn Claude Worktree",
      "type": "shell",
      "command": "${workspaceFolder}/spawnWorktree.sh",
      "args": ["${input:worktreeName}"],
      "presentation": {
        "reveal": "always",
        "panel": "shared"
      },
      "problemMatcher": []
    },
    {
      "label": "Worktree Daemon",
      "type": "shell",
      "command": "nohup '${workspaceFolder}/worktreeDaemon.sh' '${workspaceFolder}' >> '${workspaceFolder}/.worktree-daemon.log' 2>&1 & disown",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "silent", "panel": "shared", "showReuseMessage": false },
      "isBackground": false,
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "worktreeName",
      "type": "promptString",
      "description": "Worktree name (spaces become underscores, used as branch + folder name)"
    }
  ]
}
```

---

## Phase 7: Cleanup

```bash
# Delete old spawn script
rm spawnBGClaudeWT.sh

# Delete lockfile infrastructure
rm -rf .worktree-locks/

# Update .gitignore
# Remove: .worktree-locks/
# Add: .worktree-daemon.pid
# Add: .worktree-daemon.log
```

---

## Phase 8: test-worktree-scripts.sh Updates

Major changes needed:
1. Replace all references to spawnBGClaudeWT.sh → spawnWorktree.sh
2. Remove all lockfile assertions (assert_lockfile_valid_json, write_lockfile helper, etc.)
3. Remove LOCK_DIR variable and references
4. Replace lockfile checks with .managed-worktree marker checks
5. Replace daemon PID checks: PID_FILE → REPO_ROOT/.worktree-daemon.pid
6. Remove grace period test logic (no longer needed)
7. Add tests for:
   - is_worktree_merged() (merge commit parent scan)
   - .managed-worktree marker creation
   - scaffold_worktree() output
   - validate_name() rejection of bad names
   - daemon singleton via PID file
   - daemon exit when no IDE processes exist
8. Update B7/B10 tests to use merge commit detection instead of lockfile-based detection
9. Update cleanup helpers to not depend on .worktree-locks/

---

## Verification Checklist

1. Fresh create: `bash spawnWorktree.sh "test wt"` → worktree created, IDE opens, tasks auto-run
2. Invalid name: `bash spawnWorktree.sh "invalid.name/here"` → exits with validation error
3. Reopen: `bash spawnWorktree.sh "test wt"` again → Case A, prompts about scaffold
4. Force reopen: `bash spawnWorktree.sh --force "test wt"` → overwrites without prompt
5. npm first: in worktree IDE, npm install completes before Claude and tmux appear
6. Side-by-side: Claude and tmux terminals appear in split view (same task group)
7. Merge detection: `git merge --no-ff test_wt` on parent → daemon detects within 5s
8. Clean cleanup: merged + no dirty files → daemon removes worktree + branch
9. Dirty cleanup: merged + dirty files → daemon warns, skips deletion
10. IDE close → tmux kill: close worktree IDE → daemon kills tmux session within 5s
11. All IDEs close → daemon exits: close all agy windows → daemon exits, PID file removed
12. Daemon restart: reopen main IDE → daemon restarts via runOnFolderOpen
13. Unmanaged worktree: `git worktree add ../manual_wt HEAD` → daemon ignores it
14. Daemon singleton: second `worktreeDaemon.sh` invocation exits immediately
15. Stale PID: kill -9 daemon, restart → detects stale PID, takes over
