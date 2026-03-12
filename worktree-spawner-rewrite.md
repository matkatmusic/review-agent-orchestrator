# Worktree Management Scripts — Complete Rewrite (v2)

Revised after three-way AI review (Claude, Codex, Gemini). All 27 identified
issues addressed. See Debates/worktree_spawner_resolution_plan_debate_synthesis.txt
for the full review trail.

## Requirements

R1.  Create a git worktree (if it doesn't exist), using the user's preferred name.
     - Spaces converted to underscores, validated to [a-zA-Z0-9_-]+
     - Validation ENFORCED with regex check (not just space replacement)
     - Always branches from current HEAD
     - If both branch+path exist: reopen + re-scaffold (prompt before overwriting
       modified settings/tasks.json, unless --force flag is passed)
     - If branch exists but path missing: re-create worktree from existing branch
     - If path exists but branch missing: error + manual cleanup instructions

R2.  Open the worktree folder in the user's preferred IDE (currently 'agy').

R3.  Open a Claude instance in the IDE's integrated terminal, with permissions
     from v1/templates/settings.json and in Plan mode (claude --permission-mode plan).
     Fallback: if claude is not installed, print instructions.

R4.  Create a tmux session with the same name as the worktree, CWD = worktree folder.
     Use tmux new-session -A (idempotent — attaches if session already exists).

R5.  Split the Claude terminal in the IDE using task groups — Claude and tmux-attach
     appear side-by-side in the terminal panel automatically.

R6.  Run 'npm install' in the worktree IDE window. Must complete before Claude and
     tmux start (via dependsOn in tasks.json).

R7.  When the worktree IDE window is closed, kill the tmux session. Detected by
     daemon polling for the worktree's agy process via exact path matching
     (not pgrep substring).

R8.  Periodically (every 5s) scan the git repo to detect if the worktree branch has
     been merged (--no-ff) into any branch. Detection method: awk-based merge commit
     parent scan, scoped to commits since branch creation. NO LOCKFILES.
     Squash/rebase merge fallback: check if tracking branch is [gone] or if tree
     hash matches a commit on the target branch.
     On merge detected:
       - First check ALL processes (IDE, tmux, claude) are dead — skip if any alive
       - Re-verify branch tip matches the detected merged tip
       - Remove scaffold files silently
       - WARN if other dirty files exist (skip deletion)
       - Use git worktree remove (WITHOUT --force) first; only escalate if clean

R9.  VS Code tasks.json in the MAIN repo IDE with an input prompt for the worktree
     name, triggerable from Command Palette. No limit on worktree count.

R10. Daemon auto-starts via nohup fork task in main repo (NOT isBackground — avoids
     VS Code task engine hang from empty problemMatcher). Daemon detects ALL project
     IDE windows (main + any worktree). Only exits when zero agy processes exist for
     this project. On reopen, runOnFolderOpen restarts daemon. Daemon rediscovers
     existing managed worktrees (from git worktree list + .managed-worktree marker).

## Design Principles (from review)

- **No pgrep -f for process detection.** Use PID files with kill -0 validation
  for the daemon singleton. Use ps -o command= -p $(pgrep -x agy) with exact
  canonical path matching for IDE detection.
- **Scaffold files are untracked.** During scaffold, append paths to the
  worktree's .git/info/exclude so they don't appear in git status.
- **Ownership marker.** Only act on worktrees with a .managed-worktree file.
  This prevents the daemon from touching manually-created worktrees and solves
  the spawn/daemon race condition.
- **No set -e in the daemon.** Use explicit error checking. A transient git
  command failure must not kill the long-running daemon.
- **No --force on git worktree remove.** Let git's built-in safety checks act
  as a second line of defense. Only escalate after our own dirty check passes.
- **Canonical paths.** Use realpath to resolve symlinks before path comparisons.

## Context

The current scripts (spawnBGClaudeWT.sh, worktreeDaemon.sh, worktreeLib.sh) have a
flawed execution order and use lockfiles for state tracking. The daemon falsely detects
freshly-created branches as "merged" because `git branch --merged` reports reachability,
not actual merge commits. pgrep-based process detection has substring false positives
and self-matches. The entire system needs a rewrite with lockfile-free state derivation,
correct merge detection, and reliable process management.

## Files

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `spawnWorktree.sh` | Replaces spawnBGClaudeWT.sh |
| CREATE | `v1/templates/tasks.json` | Worktree IDE tasks template with `__NAME__` placeholders |
| CREATE | `v1/templates/bootstrap.sh` | Fallback bootstrap script (npm + tmux + claude) |
| REWRITE | `worktreeLib.sh` | Shared functions (merge detection, scaffold, state, process) |
| REWRITE | `worktreeDaemon.sh` | PID-file singleton daemon, no set -e |
| MODIFY | `.vscode/tasks.json` | Add daemon nohup-fork task |
| DELETE | `spawnBGClaudeWT.sh` | Replaced by spawnWorktree.sh |
| DELETE | `.worktree-locks/` | No longer needed |
| MODIFY | `.gitignore` | Remove .worktree-locks/, add .worktree-daemon.pid, .worktree-daemon.log |
| UPDATE | `test-worktree-scripts.sh` | Adapt for new scripts + no lockfiles |

---

## 1. spawnWorktree.sh — Execution Order

```
STEP 1: Parse + validate
  - Parse flags: --force (skip overwrite prompt)
  - WORKTREE_NAME="${1// /_}"
  - ENFORCE validation: [[ ! "$WORKTREE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] && exit 1
  - REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  - WORKTREE_PATH=$(realpath -m "${REPO_ROOT}/../${WORKTREE_NAME}")

STEP 2: Determine state
  - path_exists:   [ -d "${WORKTREE_PATH}" ]
  - branch_exists: git show-ref --verify --quiet "refs/heads/${WORKTREE_NAME}"

STEP 3: Handle state matrix
  CASE A (both exist) — REOPEN:
    - Generate rendered template: sed "s/__NAME__/${WORKTREE_NAME}/g" template > /tmp/rendered
    - Compare .vscode/tasks.json against /tmp/rendered (not raw template)
    - Compare .claude/settings.json against v1/templates/settings.json
    - If modified AND --force not set: prompt "Overwrite? [y/N]"
    - If --force OR yes OR unchanged: overwrite scaffold
    - → Step 5 (open IDE)

  CASE B (branch exists, no path) — RE-CREATE:
    - git worktree prune
    - git worktree add "${WORKTREE_PATH}" "${WORKTREE_NAME}"
    - → Step 4 (scaffold)

  CASE C (path exists, no branch) — ERROR:
    - Print error + manual cleanup instructions
    - Exit 1

  CASE D (neither) — FRESH CREATE:
    - git worktree add -b "${WORKTREE_NAME}" "${WORKTREE_PATH}" HEAD
    - → Step 4 (scaffold)

STEP 4: Scaffold worktree
  - Write .managed-worktree marker FIRST (prevents daemon race condition):
      echo "created=$(git -C "${REPO_ROOT}" rev-parse HEAD)" > "${WORKTREE_PATH}/.managed-worktree"
      echo "birth_commit=$(git -C "${REPO_ROOT}" rev-parse HEAD)" >> "${WORKTREE_PATH}/.managed-worktree"
      echo "name=${WORKTREE_NAME}" >> "${WORKTREE_PATH}/.managed-worktree"
  - mkdir -p "${WORKTREE_PATH}/.claude" "${WORKTREE_PATH}/.vscode"
  - cp v1/templates/settings.json → .claude/settings.json
  - sed "s/__NAME__/${WORKTREE_NAME}/g" v1/templates/tasks.json → .vscode/tasks.json
  - Make scaffold files untracked locally:
      echo ".claude/settings.json" >> "${WORKTREE_PATH}/.git/info/exclude"
      echo ".vscode/tasks.json" >> "${WORKTREE_PATH}/.git/info/exclude"
      echo ".managed-worktree" >> "${WORKTREE_PATH}/.git/info/exclude"

STEP 5: Open IDE
  - agy --new-window "${WORKTREE_PATH}"
  - IDE auto-runs tasks.json on folder open:
    1. npm install (blocking, not isBackground)
    2. Claude + tmux side-by-side (after npm install, via dependsOn)
  - NOTE: First open of a new workspace triggers VS Code trust prompt for
    automatic tasks. User must click "Allow" once. Pre-set in workspace settings
    during scaffold if possible:
      echo '{"task.allowAutomaticTasks": "on"}' > .vscode/settings.json
      (and add .vscode/settings.json to .git/info/exclude)

STEP 6: Ensure daemon running
  - PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"
  - if [ -f "${PIDFILE}" ] && kill -0 "$(<"${PIDFILE}")" 2>/dev/null; then
      log "Daemon already running"
    else
      rm -f "${PIDFILE}"   # clean stale PID file
      nohup "${REPO_ROOT}/worktreeDaemon.sh" "${REPO_ROOT}" >> "${REPO_ROOT}/.worktree-daemon.log" 2>&1 &
    fi

STEP 7: Print summary
```

---

## 2. worktreeDaemon.sh — Main Loop

```
IMPORTANT: Do NOT use set -e in this file. Use explicit error checking.

INIT:
  - Parse REPO_ROOT (realpath), VERBOSE, POLL_INTERVAL=5
  - Singleton via PID file:
      PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"
      if [ -f "${PIDFILE}" ]; then
        existing_pid=$(<"${PIDFILE}")
        if kill -0 "${existing_pid}" 2>/dev/null; then
          # Verify it's actually our daemon (not PID reuse)
          if ps -p "${existing_pid}" -o command= 2>/dev/null | grep -q "worktreeDaemon"; then
            log "Daemon already running (PID ${existing_pid}). Exiting."
            exit 0
          fi
        fi
        rm -f "${PIDFILE}"   # stale PID file
      fi
      echo $$ > "${PIDFILE}"
  - Trap ALL signals:
      cleanup_pidfile() { rm -f "${PIDFILE}"; }
      trap 'cleanup_pidfile; exit 0' EXIT SIGINT SIGTERM SIGHUP

LOOP (every 5s):

  M.1: CHECK ANY PROJECT IDE ALIVE
    - Check for agy processes with REPO_ROOT or any worktree path:
        main_alive=false
        any_worktree_alive=false
        for pid in $(pgrep -x agy); do
          cmd=$(ps -p "$pid" -o command= 2>/dev/null) || continue
          if [[ "$cmd" == *"${REPO_ROOT}"* ]]; then main_alive=true; fi
          # Also check worktree parent dir
          if [[ "$cmd" == *"$(dirname "${REPO_ROOT}")"* ]]; then any_worktree_alive=true; fi
        done
    - If ! main_alive && ! any_worktree_alive → log "All IDEs closed" → exit 0

  M.2: DISCOVER MANAGED WORKTREES
    - git worktree list --porcelain → parse (path, branch) pairs
    - Skip main worktree (first entry)
    - Skip entries with detached HEAD (no branch field)
    - For each worktree: skip if .managed-worktree file does not exist (R10 ownership)

  M.3: FOR EACH MANAGED WORKTREE:

    M.3.1: CHECK WORKTREE IDE ALIVE
      - ide_is_running_for_path "${worktree_path}" (exact canonical path match)
      - If dead + tmux has-session -t "${branch}" succeeds → tmux kill-session -t "${branch}" (R7)

    M.3.2: CHECK MERGE STATUS (R8)
      - Call is_worktree_merged() — see Section 4
      - If not merged: call is_worktree_squash_merged() — see Section 4b

    M.3.3: IF MERGED → GUARDED CLEANUP
      a) CHECK: ide_is_running_for_path "${worktree_path}" — if alive, skip (log warning)
      b) CHECK: tmux has-session -t "${branch}" — if alive, kill it first
      c) RE-VERIFY: current_tip=$(git rev-parse refs/heads/${branch})
         If current_tip != detected_tip → skip (branch moved since detection)
      d) Remove scaffold files (.claude/settings.json, .vscode/tasks.json, .managed-worktree)
      e) Check for dirty files: git -C "${worktree_path}" status --porcelain
         If dirty: log WARNING with file list, skip deletion
      f) If clean: git worktree remove "${worktree_path}" (NO --force)
         If that fails: log error, skip (git's safety net caught something)
         If succeeds: git branch -D "${branch}" || log "branch delete failed"
         git worktree prune

  M.4: sleep ${POLL_INTERVAL}
```

---

## 3. Worktree IDE tasks.json Template (v1/templates/tasks.json)

npm install runs first (not isBackground, blocks). Claude and tmux declare
`dependsOn: "npm install"` and share the same task group for side-by-side split.

Background tasks include proper `problemMatcher` patterns to prevent VS Code
task engine hangs (isBackground requires beginsPattern/endsPattern to signal
"task is ready").

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "npm install",
      "type": "shell",
      "command": "npm install",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "silent", "panel": "shared", "showReuseMessage": false },
      "problemMatcher": []
    },
    {
      "label": "Claude (Plan Mode)",
      "type": "shell",
      "command": "command -v claude >/dev/null 2>&1 && claude --permission-mode plan || echo 'Claude CLI not found. Install from https://claude.ai/code'",
      "dependsOn": "npm install",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "always", "panel": "dedicated", "group": "worktree-__NAME__", "focus": true },
      "isBackground": true,
      "problemMatcher": {
        "pattern": { "regexp": "^$", "file": 1, "location": 2, "message": 3 },
        "background": {
          "activeOnStart": true,
          "beginsPattern": ".",
          "endsPattern": "."
        }
      }
    },
    {
      "label": "tmux: __NAME__",
      "type": "shell",
      "command": "tmux new-session -A -s __NAME__",
      "dependsOn": "npm install",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "always", "panel": "dedicated", "group": "worktree-__NAME__", "focus": false },
      "isBackground": true,
      "problemMatcher": {
        "pattern": { "regexp": "^$", "file": 1, "location": 2, "message": 3 },
        "background": {
          "activeOnStart": true,
          "beginsPattern": ".",
          "endsPattern": "."
        }
      }
    }
  ]
}
```

---

## 3b. Fallback Bootstrap Script (v1/templates/bootstrap.sh)

If VS Code automatic tasks fail (trust prompt not accepted, dependsOn race),
this script can be run manually from the worktree terminal:

```bash
#!/bin/bash
set -e
WT_NAME="${1:?Usage: bootstrap.sh <worktree-name>}"
npm install
tmux new-session -A -d -s "${WT_NAME}" 2>/dev/null || true
command -v claude >/dev/null 2>&1 && claude --permission-mode plan || echo "Claude CLI not found"
```

---

## 4. is_worktree_merged() — awk-based Merge Commit Parent Scan

Scans merge commits (scoped by --since to limit CPU) for ones that have the
worktree branch tip as a non-first parent. Uses awk (C-based) instead of bash
while-read for performance.

Birth commit from .managed-worktree is used to avoid false positives on branches
created at old commits that happen to match historical merge parents.

```bash
is_worktree_merged() {
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip birth_commit

  branch_tip=$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || return 1

  # Read birth commit from marker (if available) to scope the search
  local worktree_path
  worktree_path=$(git -C "${repo_root}" worktree list --porcelain | \
    awk -v branch="refs/heads/${branch_name}" '/^worktree /{p=$2} /^branch /{if($2==branch) print p}')
  if [ -f "${worktree_path}/.managed-worktree" ]; then
    birth_commit=$(grep '^birth_commit=' "${worktree_path}/.managed-worktree" | cut -d= -f2)
  fi

  # Scan merge commits using awk (fast, C-based)
  # --since="30 days ago" prevents scanning entire repo history every 5s
  local since_flag=""
  [ -n "${birth_commit}" ] && since_flag="--since=30 days ago"

  git -C "${repo_root}" log --all --merges --format='%H %P' ${since_flag} 2>/dev/null | \
    awk -v tip="${branch_tip}" '{
      for (i = 3; i <= NF; i++)
        if ($i == tip) exit 0
    } END { exit 1 }'
}
```

Edge cases handled:
- Octopus merges: awk checks all non-first parents (i starts at 3, field 2 is first parent)
- Commits after merge: tip changes, old merge commit no longer matches → correct
- Branch deleted: rev-parse fails → returns 1
- Branch created at old commit: birth_commit + --since window prevents false positives
- CPU: awk processes thousands of lines in milliseconds vs bash while-read

---

## 4b. is_worktree_squash_merged() — Squash/Rebase Merge Fallback

Detects squash merges (no merge commit created) by checking if the tree hash
of the branch tip matches any commit tree on main. Also checks if the tracking
branch has been deleted on the remote ([gone]).

```bash
is_worktree_squash_merged() {
  local branch_name="$1"
  local repo_root="${2:-${REPO_ROOT}}"
  local branch_tip

  branch_tip=$(git -C "${repo_root}" rev-parse "refs/heads/${branch_name}" 2>/dev/null) || return 1

  # Method 1: Check if tracking branch is [gone] (remote branch deleted after PR merge)
  local tracking
  tracking=$(git -C "${repo_root}" for-each-ref --format='%(upstream:track)' "refs/heads/${branch_name}" 2>/dev/null)
  if [ "${tracking}" = "[gone]" ]; then
    return 0
  fi

  # Method 2: Tree hash match — branch tip's tree matches a commit on main
  local tree
  tree=$(git -C "${repo_root}" rev-parse "${branch_tip}^{tree}" 2>/dev/null) || return 1

  git -C "${repo_root}" log main --format='%T' --since="30 days ago" 2>/dev/null | \
    awk -v tree="${tree}" '$1 == tree { exit 0 } END { exit 1 }'
}
```

Known limitation: Tree hash matching can false-positive if two branches
independently produce identical trees. This is extremely rare in practice.

---

## 5. Main Repo .vscode/tasks.json — Additions

Daemon launches via nohup fork (NOT isBackground, which hangs with empty
problemMatcher). The task runs, forks the daemon, and exits immediately.

```json
{
  "label": "Worktree Daemon",
  "type": "shell",
  "command": "nohup ${workspaceFolder}/worktreeDaemon.sh '${workspaceFolder}' >> '${workspaceFolder}/.worktree-daemon.log' 2>&1 & disown",
  "runOptions": { "runOn": "folderOpen" },
  "presentation": { "reveal": "silent", "panel": "shared", "showReuseMessage": false },
  "isBackground": false,
  "problemMatcher": []
}
```

Daemon singleton is enforced via PID file — duplicate launches exit harmlessly.
On IDE reopen, runOnFolderOpen re-fires, daemon restarts if PID file is stale.

---

## 6. worktreeLib.sh — Exported Functions

```
# Process management
ide_is_running_for_path()   — exact canonical path match via ps + pgrep -x agy
daemon_already_running()    — PID file + kill -0 + command verification
daemon_is_running()         — PID file existence + kill -0

# Merge detection
is_worktree_merged()        — awk-based merge commit parent scan (Section 4)
is_worktree_squash_merged() — tree hash + tracking branch [gone] (Section 4b)

# Name/path validation
validate_name()             — [a-zA-Z0-9_-]+ regex enforcement with [[ =~ ]]
resolve_paths()             — realpath-based canonical path resolution

# Scaffold management
scaffold_worktree()         — write .managed-worktree marker, copy settings.json,
                              sed tasks.json template, populate .git/info/exclude
check_scaffold_modified()   — diff against RENDERED template (sed __NAME__ first)
discard_scaffold_files()    — rm .claude/settings.json .vscode/tasks.json .managed-worktree

# State inspection
has_non_scaffold_changes()  — git status --porcelain (no scaffold filtering needed
                              since scaffold is excluded from git tracking)
get_worktrees()             — parse git worktree list --porcelain, skip detached HEAD,
                              skip prunable entries, return (path, branch) pairs
is_managed_worktree()       — check for .managed-worktree file

# Cleanup
cleanup_worktree()          — guarded cleanup: check processes, re-verify tip,
                              discard scaffold, check dirty, remove worktree
                              (no --force), delete branch, prune

# Logging
log() / vlog()              — logging helpers (vlog only when VERBOSE=true)
```

---

## 7. Implementation Sequence

1. worktreeLib.sh — all shared functions (independently testable)
   - validate_name(), resolve_paths()
   - ide_is_running_for_path(), daemon_already_running()
   - is_worktree_merged() with awk + birth commit + --since
   - is_worktree_squash_merged()
   - scaffold_worktree() with .managed-worktree + git exclude
   - check_scaffold_modified() with rendered template diff
   - discard_scaffold_files(), has_non_scaffold_changes()
   - get_worktrees() with robust porcelain parsing
   - cleanup_worktree() with all guards
   - log(), vlog()

2. v1/templates/tasks.json — with proper problemMatcher patterns

3. v1/templates/bootstrap.sh — fallback script

4. v1/templates/settings.json — Claude permissions (if not already present)

5. spawnWorktree.sh — sources worktreeLib.sh
   - --force flag
   - Symlink-safe paths (realpath)
   - .managed-worktree marker creation FIRST
   - git exclude population

6. worktreeDaemon.sh — sources worktreeLib.sh
   - PID file singleton (no pgrep for self)
   - No set -e
   - Watch all agy processes (main + worktree)
   - Ownership check (.managed-worktree)
   - TOCTOU-safe cleanup via cleanup_worktree()

7. .vscode/tasks.json — nohup daemon fork task, spawn task with --force

8. Cleanup: delete spawnBGClaudeWT.sh, .worktree-locks/

9. .gitignore updates:
   - Remove: .worktree-locks/
   - Add: .worktree-daemon.pid, .worktree-daemon.log

10. test-worktree-scripts.sh — comprehensive updates

---

## 8. Verification

1. `bash spawnWorktree.sh "test wt"` → creates worktree, opens IDE, tasks auto-run
2. `bash spawnWorktree.sh "invalid.name/here"` → rejects with validation error
3. In worktree IDE: confirm npm install runs first, then Claude + tmux split
4. Run spawnWorktree.sh again with same name → Case A reopen works
5. Merge worktree with --no-ff into parent → daemon detects within 5s, cleans up
6. Squash-merge a worktree branch → daemon detects via tree hash or [gone]
7. While IDE is open, merge the branch → daemon warns but does NOT delete
8. Close worktree IDE → daemon kills tmux session
9. Close ALL project IDEs (main + worktree) → daemon exits
10. Reopen main IDE → daemon restarts, rediscovers existing managed worktrees
11. Create manual worktree (git worktree add) → daemon ignores it (no marker)
12. Run updated test-worktree-scripts.sh
13. Verify .worktree-daemon.pid is cleaned up on daemon exit

---

## 9. Known Limitations

1. **VS Code trust prompt**: First open of a new workspace triggers a one-time
   "Allow automatic tasks?" prompt. No technical fix; pre-setting
   task.allowAutomaticTasks in workspace settings mitigates but is a security
   trade-off. bootstrap.sh provides a manual fallback.

2. **Squash merge tree hash matching**: Can theoretically false-positive if two
   branches independently produce identical trees. Extremely rare in practice.

3. **--since window**: Merge commits older than 30 days won't be detected. For
   typical short-lived feature branches this is more than sufficient. Long-running
   branches may need manual cleanup.

4. **macOS vs Linux**: stat flags (-f vs -c) and process inspection differ. All
   process detection uses POSIX-compatible ps + kill -0. Should be tested on both
   platforms.
