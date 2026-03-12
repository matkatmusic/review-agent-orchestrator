#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# Manual Test Suite for Worktree Management Scripts
# =============================================================================
# Interactive test runner. Automates setup and verification where possible,
# prompts for manual confirmation on IDE-window behavior.
#
# Usage:
#   bash test-worktree-scripts.sh [--verbose|-v] [test-id...]
#
# Examples:
#   bash test-worktree-scripts.sh                # Run all tests in suggested order
#   bash test-worktree-scripts.sh A1             # Run only test A1
#   bash test-worktree-scripts.sh --verbose A1   # Run A1 with verbose daemon/lib output
#   bash test-worktree-scripts.sh -v B7          # Run B7 with verbose output
# =============================================================================

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="${REPO_ROOT}"
LOCK_DIR="${REPO_ROOT}/.worktree-locks"
PID_FILE="${LOCK_DIR}/daemon.pid"
TEST_WT_NAME="test_fresh_1"
TEST_WT_NAME2="test_fresh_2"
TEST_WT_PATH="${REPO_ROOT}/../${TEST_WT_NAME}"
TEST_WT_PATH2="${REPO_ROOT}/../${TEST_WT_NAME2}"

# --- Colors & formatting ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
MANUAL_COUNT=0
VERBOSE=false
DAEMON_VERBOSE_FLAG=""
CLEANUP_DONE=false
THROWAWAY_BRANCH=""

# --- Exit trap: clean up test artifacts on unexpected exit ---
cleanup_on_exit() {
  local exit_code=$?
  if [ "${CLEANUP_DONE}" = true ]; then
    return
  fi
  CLEANUP_DONE=true

  echo ""
  echo "Caught exit — cleaning up test artifacts..."

  if [ "${KEEP_TEST_ARTIFACTS:-}" = "1" ]; then
    echo "  KEEP_TEST_ARTIFACTS=1 — preserving files for debugging."
    # Still kill daemon to avoid orphan processes.
    if [ -f "${PID_FILE}" ]; then
      kill "$(cat "${PID_FILE}")" 2>/dev/null || true
    fi
    return "${exit_code}"
  fi

  # Delete throwaway branch if one was in use when we exited.
  if [ -n "${THROWAWAY_BRANCH}" ]; then
    git branch -D "${THROWAWAY_BRANCH}" 2>/dev/null || true
  fi

  full_cleanup 2>/dev/null || true
  return "${exit_code}"
}

trap cleanup_on_exit EXIT

# --- Helpers ---

banner() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

section() {
  echo ""
  echo -e "${YELLOW}--- $1 ---${RESET}"
}

pass() {
  echo -e "  ${GREEN}PASS${RESET}: $1"
  ((PASS_COUNT += 1))
}

fail() {
  echo -e "  ${RED}FAIL${RESET}: $1"
  ((FAIL_COUNT += 1))
}

skip() {
  echo -e "  ${DIM}SKIP${RESET}: $1"
  ((SKIP_COUNT += 1))
}

manual_check() {
  echo -e "  ${YELLOW}MANUAL${RESET}: $1"
  ((MANUAL_COUNT += 1))
  read -rp "  Did this pass? [y/n/s(kip)]: " answer
  case "${answer}" in
    y|Y) pass "$1 (confirmed)" ;;
    n|N) fail "$1 (user rejected)" ;;
    *)   skip "$1 (skipped)" ;;
  esac
}

assert_file_exists() {
  if [ -f "$1" ]; then
    pass "File exists: $1"
  else
    fail "File missing: $1"
  fi
}

assert_file_missing() {
  if [ ! -f "$1" ]; then
    pass "File absent: $1"
  else
    fail "File should not exist: $1"
  fi
}

assert_dir_exists() {
  if [ -d "$1" ]; then
    pass "Directory exists: $1"
  else
    fail "Directory missing: $1"
  fi
}

assert_dir_missing() {
  if [ ! -d "$1" ]; then
    pass "Directory absent: $1"
  else
    fail "Directory should not exist: $1"
  fi
}

assert_branch_exists() {
  if git show-ref --verify --quiet "refs/heads/$1" 2>/dev/null; then
    pass "Branch exists: $1"
  else
    fail "Branch missing: $1"
  fi
}

assert_branch_missing() {
  if ! git show-ref --verify --quiet "refs/heads/$1" 2>/dev/null; then
    pass "Branch absent: $1"
  else
    fail "Branch should not exist: $1"
  fi
}

assert_lockfile_valid_json() {
  local lockfile="$1"
  if [ ! -f "${lockfile}" ]; then
    fail "Lockfile missing: ${lockfile}"
    return
  fi
  if NODE_OPTIONS='' node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "${lockfile}" 2>/dev/null; then
    pass "Lockfile is valid JSON: ${lockfile}"
  else
    fail "Lockfile is not valid JSON: ${lockfile}"
  fi
}

assert_output_contains() {
  local output="$1"
  local expected="$2"
  local label="${3:-output contains '${expected}'}"
  if echo "${output}" | grep -qF "${expected}"; then
    pass "${label}"
  else
    fail "${label} (not found in output)"
  fi
}

assert_output_not_contains() {
  local output="$1"
  local expected="$2"
  local label="${3:-output does not contain '${expected}'}"
  if echo "${output}" | grep -qF "${expected}"; then
    fail "${label} (unexpectedly found in output)"
  else
    pass "${label}"
  fi
}

assert_exit_code() {
  local actual="$1"
  local expected="$2"
  local label="${3:-exit code is ${expected}}"
  if [ "${actual}" -eq "${expected}" ]; then
    pass "${label}"
  else
    fail "${label} (got ${actual})"
  fi
}

daemon_pid() {
  if [ -f "${PID_FILE}" ]; then
    cat "${PID_FILE}"
  else
    echo ""
  fi
}

daemon_is_running() {
  local pid
  pid="$(daemon_pid)"
  [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

count_daemon_processes() {
  ps aux | grep "[w]orktreeDaemon" | wc -l | tr -d ' '
}

wait_prompt() {
  echo ""
  read -rp "  Press Enter to continue..." _
}

# Write a lockfile using process.argv (no string interpolation injection).
write_lockfile() {
  local name="$1"
  local wt_path="$2"
  local parent="$3"
  mkdir -p "${LOCK_DIR}"
  NODE_OPTIONS='' node -e "
    const fs = require('fs');
    const data = {
      worktreeName: process.argv[1],
      worktreePath: process.argv[2],
      repoRoot: process.argv[3],
      parentBranch: process.argv[4],
      spawnedAt: new Date().toISOString()
    };
    fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
  " "${name}" "${wt_path}" "${REPO_ROOT}" "${parent}" "${LOCK_DIR}/${name}.lock"
}

# Poll daemon.log for a pattern instead of using fixed sleeps.
# Usage: wait_for_log "pattern" <start_line> [timeout_seconds]
wait_for_log() {
  local pattern="$1"
  local start_line="${2:-0}"
  local timeout="${3:-30}"
  local elapsed=0

  while [ "${elapsed}" -lt "${timeout}" ]; do
    if tail -n +"$((start_line + 1))" "${LOCK_DIR}/daemon.log" 2>/dev/null | grep -qF "${pattern}"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  echo "  Timed out (${timeout}s) waiting for: ${pattern}"
  return 1
}

# Show recent daemon.log lines since a given line number (verbose mode only).
show_daemon_log_tail() {
  if [ "${VERBOSE}" = true ] && [ -f "${LOCK_DIR}/daemon.log" ]; then
    local start_line="${1:-0}"
    local new_lines
    new_lines="$(tail -n +$((start_line + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"
    if [ -n "${new_lines}" ]; then
      echo -e "  ${DIM}--- daemon.log (new lines) ---${RESET}"
      echo "${new_lines}" | sed 's/^/    /'
      echo -e "  ${DIM}--- end daemon.log ---${RESET}"
    fi
  fi
}

# --- Full cleanup (between tests or at start) ---

full_cleanup() {
  section "Cleaning up test artifacts"

  # Kill daemon by PID file (scoped to this repo, no pkill).
  if [ -f "${PID_FILE}" ]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      sleep 1
    fi
    rm -f "${PID_FILE}"
  fi

  # Remove test worktrees — with prefix guardrails.
  for wt in "${TEST_WT_NAME}" "${TEST_WT_NAME2}" "phantom_wt" "orphan_parent_test"; do
    # Refuse to touch anything that doesn't match a test prefix.
    if [[ "${wt}" != test_* ]] && [[ "${wt}" != phantom_* ]] && [[ "${wt}" != orphan_* ]]; then
      echo "  SKIPPING non-test worktree: ${wt}"
      continue
    fi

    local wt_path="${REPO_ROOT}/../${wt}"

    # Refuse to rm -rf if path doesn't resolve under the expected parent.
    if [ -d "${wt_path}" ]; then
      local resolved
      resolved="$(cd "${wt_path}" && pwd)"
      if [[ "${resolved}" != */test_* ]] && [[ "${resolved}" != */phantom_* ]] && [[ "${resolved}" != */orphan_* ]]; then
        echo "  REFUSING to remove unexpected path: ${resolved}"
        continue
      fi
      git worktree remove --force "${wt_path}" 2>/dev/null || rm -rf "${wt_path}"
    fi
    git branch -D "${wt}" 2>/dev/null || true
    rm -f "${LOCK_DIR}/${wt}.lock"
  done

  # Remove test lockfiles
  rm -f "${LOCK_DIR}/corrupt.lock"
  rm -f "${LOCK_DIR}/phantom.lock"
  rm -f "${LOCK_DIR}/phantom_wt.lock"
  rm -f "${LOCK_DIR}/orphan_parent_test.lock"

  git worktree prune 2>/dev/null || true

  # Kill test tmux sessions
  tmux kill-session -t "${TEST_WT_NAME}" 2>/dev/null || true
  tmux kill-session -t "${TEST_WT_NAME2}" 2>/dev/null || true
  tmux kill-session -t "phantom_wt" 2>/dev/null || true
  tmux kill-session -t "orphan_parent_test" 2>/dev/null || true

  # Clean up any leftover throwaway branches from B7/B10.
  local branch
  for branch in $(git branch --list '__test_merge_target_*' 2>/dev/null); do
    git branch -D "${branch}" 2>/dev/null || true
  done

  echo "  Cleanup done."
}

# =============================================================================
# TEST CASES
# =============================================================================

# --- A1: Fresh create (happy path) ---
test_A1() {
  banner "A1: Fresh create (happy path)"
  echo "  Run: bash spawnBGClaudeWT.sh \"test fresh 1\""
  echo "  Expect: new branch, worktree, settings, tasks.json, lockfile, daemon, IDE"
  echo ""

  local output
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  # Make a diverging commit so daemon doesn't consider the branch "merged"
  # (a branch created from HEAD is trivially merged into the parent).
  if [ -d "${TEST_WT_PATH}" ]; then
    (cd "${TEST_WT_PATH}" && echo "test marker" > test_marker.txt && git add test_marker.txt && git commit -m "test: diverge from parent" --no-verify) >/dev/null 2>&1
  fi

  section "Automated checks"
  assert_branch_exists "${TEST_WT_NAME}"
  assert_dir_exists "${TEST_WT_PATH}"
  assert_file_exists "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/tasks.json"

  # Check tasks.json contains correct worktree name
  if [ -f "${TEST_WT_PATH}/.vscode/tasks.json" ]; then
    if grep -q "worktree-${TEST_WT_NAME}" "${TEST_WT_PATH}/.vscode/tasks.json"; then
      pass "tasks.json references worktree-${TEST_WT_NAME}"
    else
      fail "tasks.json missing worktree group reference"
    fi
  fi

  assert_file_exists "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_lockfile_valid_json "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_output_contains "${output}" "Lockfile written"
  assert_output_contains "${output}" "Daemon started"

  # Check daemon is running
  if daemon_is_running; then
    pass "Daemon process is running (PID $(daemon_pid))"
  else
    fail "Daemon process is not running"
  fi

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- A2: Reopen existing worktree ---
test_A2() {
  banner "A2: Reopen existing worktree"
  echo "  Run: bash spawnBGClaudeWT.sh \"test fresh 1\" (same name again)"
  echo "  Expect: 'Reopening' message, no 'Lockfile written', no 'Daemon started'"
  echo ""

  # Precondition: worktree must exist from A1.
  if [ ! -d "${TEST_WT_PATH}" ]; then
    skip "test_fresh_1 worktree missing — run A1 first"
    return
  fi

  local output
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "Reopening existing worktree"
  assert_output_not_contains "${output}" "Lockfile written" "No 'Lockfile written' message (already exists)"
  assert_output_not_contains "${output}" "Daemon started" "No 'Daemon started' message (already running)"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- B1: Singleton — won't start twice ---
test_B1() {
  banner "B1: Singleton — daemon won't start twice"
  echo "  Run: bash worktreeDaemon.sh \"<repo-root>\" while daemon already runs"
  echo "  Expect: 'Daemon already running' message"
  echo ""

  # Precondition: daemon must already be running.
  if ! daemon_is_running; then
    skip "Daemon not running — run A1 first to start it"
    return
  fi

  local output
  output="$(bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "Daemon already running"

  local count
  count="$(count_daemon_processes)"
  if [ "${count}" -le 1 ]; then
    pass "Only ${count} daemon process(es) running"
  else
    fail "Expected <=1 daemon process, found ${count}"
  fi
}

# --- A3: Reopen writes lockfile if missing ---
test_A3() {
  banner "A3: Reopen writes lockfile if missing"
  echo "  Setup: remove lockfile, then reopen"
  echo ""

  # Precondition: worktree must exist from A1.
  if [ ! -d "${TEST_WT_PATH}" ]; then
    skip "test_fresh_1 worktree missing — run A1 first"
    return
  fi

  section "Setup"
  rm -f "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_file_missing "${LOCK_DIR}/${TEST_WT_NAME}.lock"

  section "Execute"
  local output
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "Reopening existing worktree"
  assert_output_contains "${output}" "Lockfile written"
  assert_file_exists "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_lockfile_valid_json "${LOCK_DIR}/${TEST_WT_NAME}.lock"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- B9: SIGINT/SIGTERM — clean shutdown ---
test_B9() {
  banner "B9: SIGTERM — clean daemon shutdown"
  echo "  Run: kill daemon PID"
  echo "  Expect: 'Daemon shutting down', PID file removed"
  echo ""

  if ! daemon_is_running; then
    fail "Daemon not running — cannot test SIGTERM"
    return
  fi

  local pid
  pid="$(daemon_pid)"
  echo "  Sending SIGTERM to daemon PID ${pid}..."
  kill "${pid}"
  sleep 2

  section "Automated checks"
  if ! kill -0 "${pid}" 2>/dev/null; then
    pass "Daemon process ${pid} is no longer running"
  else
    fail "Daemon process ${pid} still running after SIGTERM"
  fi

  assert_file_missing "${PID_FILE}"

  # Check daemon.log for shutdown message
  if [ -f "${LOCK_DIR}/daemon.log" ] && grep -q "Daemon shutting down (PID ${pid})" "${LOCK_DIR}/daemon.log"; then
    pass "daemon.log contains shutdown message for PID ${pid}"
  else
    fail "daemon.log missing shutdown message for PID ${pid}"
  fi
}

# --- B2: Stale PID detection ---
test_B2() {
  banner "B2: Stale PID detection"
  echo "  Setup: ensure daemon running, hard-kill it, verify stale PID takeover"
  echo ""

  section "Setup — start a daemon if not running"
  # Start daemon fresh
  nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOCK_DIR}/daemon.log" 2>&1 &
  sleep 2

  if ! daemon_is_running; then
    fail "Could not start daemon for stale PID test"
    return
  fi

  local old_pid
  old_pid="$(daemon_pid)"
  echo "  Hard-killing daemon PID ${old_pid} (kill -9)..."
  kill -9 "${old_pid}" 2>/dev/null || true
  sleep 1

  # PID file should still exist (stale)
  assert_file_exists "${PID_FILE}"

  section "Execute — start daemon again (should detect stale PID)"
  # Truncate the end of daemon.log so we can check new output
  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOCK_DIR}/daemon.log" 2>&1 &
  sleep 2

  section "Automated checks"
  # Check new log output
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "Stale PID file found (PID ${old_pid})" "Log shows stale PID detection"
  assert_output_contains "${new_output}" "Daemon started" "Log shows new daemon started"

  if daemon_is_running; then
    local new_pid
    new_pid="$(daemon_pid)"
    if [ "${new_pid}" != "${old_pid}" ]; then
      pass "New daemon PID ${new_pid} differs from stale PID ${old_pid}"
    else
      fail "New daemon PID same as stale PID"
    fi
  else
    fail "New daemon not running after stale PID recovery"
  fi

  show_daemon_log_tail "${log_lines_before}"
}

# --- B4: Corrupt lockfile — skip without crash ---
test_B4() {
  banner "B4: Corrupt lockfile — daemon skips without crash"
  echo "  Setup: write bad JSON to a lockfile"
  echo ""

  section "Setup"
  echo "bad json" > "${LOCK_DIR}/corrupt.lock"
  assert_file_exists "${LOCK_DIR}/corrupt.lock"

  # Record log position
  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  echo "  Waiting for daemon to encounter corrupt lockfile..."
  if ! wait_for_log "WARNING: Failed to parse" "${log_lines_before}" 30; then
    fail "Daemon did not warn about corrupt lockfile within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "WARNING: Failed to parse" "Log warns about corrupt lockfile"

  if daemon_is_running; then
    pass "Daemon still running after encountering corrupt lockfile"
  else
    fail "Daemon crashed on corrupt lockfile"
  fi

  show_daemon_log_tail "${log_lines_before}"

  # Cleanup
  rm -f "${LOCK_DIR}/corrupt.lock"
}

# --- B5: Worktree path gone — cleanup remnants ---
test_B5() {
  banner "B5: Worktree path gone — daemon cleans up remnants"
  echo "  Setup: create lockfile pointing to non-existent path"
  echo ""

  section "Setup"
  # Create a lockfile for a phantom worktree
  local phantom_name="phantom_wt"
  local phantom_path="${REPO_ROOT}/../${phantom_name}"

  # Create a branch so the daemon can delete it
  git branch "${phantom_name}" HEAD 2>/dev/null || true

  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  write_lockfile "${phantom_name}" "${phantom_path}" "${current_branch}"
  assert_file_exists "${LOCK_DIR}/${phantom_name}.lock"
  assert_dir_missing "${phantom_path}"

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  echo "  Waiting for daemon to detect missing path..."
  if ! wait_for_log "worktree path gone. Cleaning up remnants" "${log_lines_before}" 30; then
    fail "Daemon did not detect missing path within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "worktree path gone. Cleaning up remnants" "Daemon detects missing path"
  assert_output_contains "${new_output}" "lockfile removed" "Lockfile removed"
  assert_file_missing "${LOCK_DIR}/${phantom_name}.lock"
  assert_branch_missing "${phantom_name}"

  show_daemon_log_tail "${log_lines_before}"
}

# --- B6: Parent branch missing — skip ---
test_B6() {
  banner "B6: Parent branch missing — daemon skips gracefully"
  echo "  Setup: lockfile with non-existent parentBranch"
  echo ""

  section "Setup"
  local orphan_name="orphan_parent_test"
  local orphan_path="${REPO_ROOT}/../${orphan_name}"

  # Create actual worktree so the path exists (daemon won't hit B5 path-gone)
  git worktree add -b "${orphan_name}" "${orphan_path}" HEAD 2>/dev/null || true

  write_lockfile "${orphan_name}" "${orphan_path}" "nonexistent_parent_branch_xyz"
  assert_file_exists "${LOCK_DIR}/${orphan_name}.lock"

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  echo "  Waiting for daemon to detect missing parent branch..."
  if ! wait_for_log "WARNING: Parent branch 'nonexistent_parent_branch_xyz' not found" "${log_lines_before}" 30; then
    fail "Daemon did not warn about missing parent within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "WARNING: Parent branch 'nonexistent_parent_branch_xyz' not found" "Warns about missing parent branch"
  assert_file_exists "${LOCK_DIR}/${orphan_name}.lock"
  pass "Lockfile NOT removed (keeps retrying)"

  show_daemon_log_tail "${log_lines_before}"

  # Cleanup
  rm -f "${LOCK_DIR}/${orphan_name}.lock"
  git worktree remove --force "${orphan_path}" 2>/dev/null || rm -rf "${orphan_path}"
  git branch -D "${orphan_name}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- B8: Branch not merged — no action ---
test_B8() {
  banner "B8: Branch not merged — no action"
  echo "  Setup: worktree with unmerged commits"
  echo ""

  section "Setup"
  # Ensure test_fresh_1 has a commit not on parent
  if [ -d "${TEST_WT_PATH}" ]; then
    (cd "${TEST_WT_PATH}" && echo "unmerged content" > unmerged_file.txt && git add unmerged_file.txt && git commit -m "unmerged test commit" --no-verify)
  else
    fail "test_fresh_1 worktree does not exist — run A1 first"
    return
  fi

  # Ensure lockfile exists
  if [ ! -f "${LOCK_DIR}/${TEST_WT_NAME}.lock" ]; then
    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD)"
    write_lockfile "${TEST_WT_NAME}" "${TEST_WT_PATH}" "${current_branch}"
  fi

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  # Negative check: wait 2 scan intervals to confirm daemon does NOT act.
  echo "  Waiting 2 daemon scan intervals (25 seconds) to confirm no action..."
  sleep 25

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_not_contains "${new_output}" "${TEST_WT_NAME}: branch merged" "No 'branch merged' message for unmerged worktree"
  assert_file_exists "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  pass "Lockfile remains, daemon keeps polling"
  assert_dir_exists "${TEST_WT_PATH}"
  pass "Worktree still exists"

  show_daemon_log_tail "${log_lines_before}"
}

# --- B7 + C1: Branch merged, no meaningful changes — full cleanup ---
test_B7() {
  banner "B7 + C1: Branch merged (no meaningful changes) — full cleanup"
  echo "  Setup: merge worktree branch into parent, let daemon clean up"
  echo ""

  section "Setup"
  # Make sure worktree exists with the lockfile
  if [ ! -d "${TEST_WT_PATH}" ]; then
    fail "test_fresh_1 worktree missing — run A1 first"
    return
  fi

  # Merge into a throwaway branch (never touch the user's working branch)
  local original_branch
  original_branch="$(git rev-parse --abbrev-ref HEAD)"
  local throwaway="__test_merge_target_$(date +%s)_b7"
  THROWAWAY_BRANCH="${throwaway}"
  git checkout -b "${throwaway}" HEAD
  echo "  Merging ${TEST_WT_NAME} into throwaway branch ${throwaway} with --no-ff..."
  git merge --no-ff "${TEST_WT_NAME}" -m "test merge for B7" || {
    git checkout "${original_branch}"
    fail "Merge failed"
    return
  }
  git checkout "${original_branch}"

  # Write lockfile pointing at the throwaway branch
  write_lockfile "${TEST_WT_NAME}" "${TEST_WT_PATH}" "${throwaway}"

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  echo "  Waiting for daemon to detect merge and clean up..."
  if ! wait_for_log "cleanup succeeded" "${log_lines_before}" 30; then
    fail "Daemon did not complete cleanup within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "${TEST_WT_NAME}: branch merged into ${throwaway}" "Daemon detects merge"
  assert_output_contains "${new_output}" "cleanup succeeded" "Cleanup succeeded"
  assert_output_contains "${new_output}" "lockfile removed" "Lockfile removed"
  assert_dir_missing "${TEST_WT_PATH}"
  assert_file_missing "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_branch_missing "${TEST_WT_NAME}"

  show_daemon_log_tail "${log_lines_before}"

  # Clean up throwaway branch (no git reset --hard needed)
  git branch -D "${throwaway}" 2>/dev/null || true
  THROWAWAY_BRANCH=""
}

# --- B10 + C2: Branch merged, with local changes — cleanup blocked ---
test_B10() {
  banner "B10 + C2: Branch merged with local changes — cleanup blocked"
  echo "  Setup: create worktree, merge branch, add uncommitted changes"
  echo ""

  section "Setup — create fresh worktree"
  # Clean slate
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  rm -f "${LOCK_DIR}/${TEST_WT_NAME}.lock"

  # Create worktree with a commit
  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  (cd "${TEST_WT_PATH}" && echo "merged content" > merged_file.txt && git add merged_file.txt && git commit -m "commit for B10 test" --no-verify)

  # Merge into a throwaway branch (never touch the user's working branch)
  local original_branch
  original_branch="$(git rev-parse --abbrev-ref HEAD)"
  local throwaway="__test_merge_target_$(date +%s)_b10"
  THROWAWAY_BRANCH="${throwaway}"
  git checkout -b "${throwaway}" HEAD
  git merge --no-ff "${TEST_WT_NAME}" -m "test merge for B10"
  git checkout "${original_branch}"

  # Now add uncommitted changes to the worktree
  echo "dirty local change" > "${TEST_WT_PATH}/local_edit.txt"

  # Write lockfile pointing at the throwaway branch
  write_lockfile "${TEST_WT_NAME}" "${TEST_WT_PATH}" "${throwaway}"

  # Ensure daemon is running (B7 may have caused it to exit)
  if ! daemon_is_running; then
    echo "  Restarting daemon (previous test may have caused exit)..."
    rm -f "${PID_FILE}"
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOCK_DIR}/daemon.log" 2>&1 &
    sleep 2
  fi

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  echo "  Waiting for daemon to detect merge and attempt cleanup..."
  if ! wait_for_log "cleanup returned non-zero" "${log_lines_before}" 30; then
    fail "Daemon did not report cleanup failure within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "branch merged" "Daemon detects merge"
  assert_output_contains "${new_output}" "cleanup returned non-zero" "Cleanup returned non-zero (local changes)"
  assert_dir_exists "${TEST_WT_PATH}"
  pass "Worktree kept (has local changes)"
  assert_file_missing "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  pass "Lockfile still removed (branch is merged, cleanup attempted)"

  show_daemon_log_tail "${log_lines_before}"

  # Cleanup for next tests (no git reset --hard needed)
  section "Teardown"
  rm -f "${TEST_WT_PATH}/local_edit.txt"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git branch -D "${throwaway}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  THROWAWAY_BRANCH=""
}

# --- A4: Path exists but branch doesn't ---
test_A4() {
  banner "A4: Path exists but branch doesn't"
  echo "  Setup: create worktree, delete branch, try to reopen"
  echo ""

  section "Setup"
  # Create worktree normally
  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD 2>/dev/null || true

  # Delete branch (this will fail if worktree is using it — we need to detach first)
  (cd "${TEST_WT_PATH}" && git checkout --detach HEAD 2>/dev/null) || true
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true

  assert_dir_exists "${TEST_WT_PATH}"
  assert_branch_missing "${TEST_WT_NAME}"

  section "Execute"
  local output exit_code
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 1" 2>&1)" || exit_code=$?
  exit_code=${exit_code:-0}
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "path exists but branch" "Error message about path/branch mismatch"
  assert_exit_code "${exit_code}" 1

  # Cleanup
  section "Teardown"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git worktree prune 2>/dev/null || true
}

# --- A5: Branch exists but path doesn't ---
test_A5() {
  banner "A5: Branch exists but path doesn't"
  echo "  Setup: create branch, ensure no worktree path, run spawn"
  echo ""

  section "Setup"
  # Ensure clean state
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  rm -f "${LOCK_DIR}/${TEST_WT_NAME}.lock"

  # Create branch without worktree
  git branch "${TEST_WT_NAME}" HEAD
  assert_branch_exists "${TEST_WT_NAME}"
  assert_dir_missing "${TEST_WT_PATH}"

  section "Execute"
  local output
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "Reusing existing branch" "Shows 'Reusing existing branch'"
  assert_dir_exists "${TEST_WT_PATH}"
  assert_file_exists "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/tasks.json"
  assert_file_exists "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_lockfile_valid_json "${LOCK_DIR}/${TEST_WT_NAME}.lock"
  assert_output_contains "${output}" "Lockfile written"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- A6: ensure_daemon — no double-start ---
test_A6() {
  banner "A6: ensure_daemon — no double-start"
  echo "  Run: create a second worktree while daemon already runs"
  echo "  Expect: no 'Daemon started', only one daemon process"
  echo ""

  # Daemon should be running from A5
  if ! daemon_is_running; then
    echo "  Starting daemon first..."
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOCK_DIR}/daemon.log" 2>&1 &
    sleep 2
  fi

  section "Execute"
  local output
  output="$(bash "${SCRIPT_DIR}/spawnBGClaudeWT.sh" "test fresh 2" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_not_contains "${output}" "Daemon started" "No 'Daemon started' (already running)"

  local count
  count="$(count_daemon_processes)"
  if [ "${count}" -le 1 ]; then
    pass "Only ${count} daemon process(es) running"
  else
    fail "Expected <=1 daemon process, found ${count}"
  fi

  assert_dir_exists "${TEST_WT_PATH2}"
  assert_file_exists "${LOCK_DIR}/${TEST_WT_NAME2}.lock"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH2}"
}

# --- B3: No lockfiles — immediate exit ---
test_B3() {
  banner "B3: No lockfiles — daemon exits immediately"
  echo "  Setup: remove all lockfiles, start daemon"
  echo ""

  section "Setup"
  # Kill existing daemon
  if daemon_is_running; then
    kill "$(daemon_pid)" 2>/dev/null || true
    sleep 2
  fi
  rm -f "${PID_FILE}"

  # Remove all lockfiles
  rm -f "${LOCK_DIR}"/*.lock

  local log_lines_before
  log_lines_before="$(wc -l < "${LOCK_DIR}/daemon.log" 2>/dev/null || echo 0)"

  section "Execute"
  bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOCK_DIR}/daemon.log" 2>&1 &
  local daemon_bg_pid=$!
  sleep 3

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOCK_DIR}/daemon.log" 2>/dev/null)"

  assert_output_contains "${new_output}" "Daemon started" "Daemon started message"
  assert_output_contains "${new_output}" "No lockfiles remain. Daemon exiting." "Daemon exited due to no lockfiles"

  if ! kill -0 "${daemon_bg_pid}" 2>/dev/null; then
    pass "Daemon process exited"
  else
    fail "Daemon process still running (should have exited)"
    kill "${daemon_bg_pid}" 2>/dev/null || true
  fi

  assert_file_missing "${PID_FILE}"
}

# =============================================================================
# C-series (worktreeLib.sh spot checks)
# =============================================================================

test_C1() {
  banner "C1: Ignored files only — cleanup proceeds"
  echo "  Setup: worktree with only .claude/settings.json and .vscode/tasks.json"
  echo ""

  section "Setup"
  # Clean slate
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  mkdir -p "${TEST_WT_PATH}/.claude" "${TEST_WT_PATH}/.vscode"
  cp "${REPO_ROOT}/v1/templates/settings.json" "${TEST_WT_PATH}/.claude/settings.json"
  echo '{}' > "${TEST_WT_PATH}/.vscode/tasks.json"

  section "Execute"
  local result
  result="$( (
    export WORKTREE_PATH="${TEST_WT_PATH}"
    export WORKTREE_NAME="${TEST_WT_NAME}"
    export REPO_ROOT="${REPO_ROOT}"
    source "${SCRIPT_DIR}/worktreeLib.sh"
    if has_meaningful_changes; then
      echo "HAS_CHANGES"
    else
      echo "NO_CHANGES"
    fi
  ) )"

  section "Automated checks"
  if [ "${result}" = "NO_CHANGES" ]; then
    pass "has_meaningful_changes returns 1 (no meaningful changes) — only ignored files"
  else
    fail "has_meaningful_changes detected changes when only ignored files present"
  fi

  # Cleanup
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

test_C2() {
  banner "C2: Real changes — cleanup blocked"
  echo "  Setup: worktree with an edited source file"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  echo "real edit" > "${TEST_WT_PATH}/real_change.txt"

  section "Execute"
  local result
  result="$( (
    export WORKTREE_PATH="${TEST_WT_PATH}"
    export WORKTREE_NAME="${TEST_WT_NAME}"
    export REPO_ROOT="${REPO_ROOT}"
    source "${SCRIPT_DIR}/worktreeLib.sh"
    if has_meaningful_changes; then
      echo "HAS_CHANGES"
    else
      echo "NO_CHANGES"
    fi
  ) )"

  section "Automated checks"
  if [ "${result}" = "HAS_CHANGES" ]; then
    pass "has_meaningful_changes returns 0 (has changes) — real file detected"
  else
    fail "has_meaningful_changes missed real changes"
  fi

  # Also test cleanup_worktree returns 1
  local cleanup_exit
  (
    export WORKTREE_PATH="${TEST_WT_PATH}"
    export WORKTREE_NAME="${TEST_WT_NAME}"
    export REPO_ROOT="${REPO_ROOT}"
    source "${SCRIPT_DIR}/worktreeLib.sh"
    cleanup_worktree
  ) 2>&1 || cleanup_exit=$?
  cleanup_exit=${cleanup_exit:-0}

  if [ "${cleanup_exit}" -ne 0 ]; then
    pass "cleanup_worktree returns non-zero when real changes present"
  else
    fail "cleanup_worktree returned 0 despite real changes"
  fi

  assert_dir_exists "${TEST_WT_PATH}"
  pass "Worktree kept"

  # Cleanup
  rm -f "${TEST_WT_PATH}/real_change.txt"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

test_C3() {
  banner "C3: discard_ignored_changes removes scaffolding"
  echo "  Verify: .claude/ and .vscode/ cleaned before worktree removal"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  mkdir -p "${TEST_WT_PATH}/.claude" "${TEST_WT_PATH}/.vscode"
  cp "${REPO_ROOT}/v1/templates/settings.json" "${TEST_WT_PATH}/.claude/settings.json"
  echo '{}' > "${TEST_WT_PATH}/.vscode/tasks.json"

  section "Execute"
  (
    export WORKTREE_PATH="${TEST_WT_PATH}"
    export WORKTREE_NAME="${TEST_WT_NAME}"
    export REPO_ROOT="${REPO_ROOT}"
    source "${SCRIPT_DIR}/worktreeLib.sh"
    discard_ignored_changes
  ) 2>&1

  section "Automated checks"
  if [ ! -f "${TEST_WT_PATH}/.claude/settings.json" ]; then
    pass ".claude/settings.json removed by discard_ignored_changes"
  else
    fail ".claude/settings.json still exists"
  fi

  if [ ! -f "${TEST_WT_PATH}/.vscode/tasks.json" ]; then
    pass ".vscode/tasks.json removed by discard_ignored_changes"
  else
    fail ".vscode/tasks.json still exists"
  fi

  # Cleanup
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# =============================================================================
# RUNNER
# =============================================================================

# Suggested test order from the plan
SUGGESTED_ORDER=(A1 A2 B1 A3 B9 B2 B4 B5 B6 B8 B7 B10 A4 A5 A6 B3 C1 C2 C3)

run_test() {
  local test_id="$1"
  case "${test_id}" in
    A1) test_A1 ;;
    A2) test_A2 ;;
    A3) test_A3 ;;
    A4) test_A4 ;;
    A5) test_A5 ;;
    A6) test_A6 ;;
    B1) test_B1 ;;
    B2) test_B2 ;;
    B3) test_B3 ;;
    B4) test_B4 ;;
    B5) test_B5 ;;
    B6) test_B6 ;;
    B7) test_B7 ;;
    B8) test_B8 ;;
    B9) test_B9 ;;
    B10) test_B10 ;;
    C1) test_C1 ;;
    C2) test_C2 ;;
    C3) test_C3 ;;
    *)
      echo "Unknown test: ${test_id}"
      echo "Valid tests: ${SUGGESTED_ORDER[*]}"
      exit 1
      ;;
  esac
}

print_summary() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  TEST SUMMARY${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  ${GREEN}PASS${RESET}:   ${PASS_COUNT}"
  echo -e "  ${RED}FAIL${RESET}:   ${FAIL_COUNT}"
  echo -e "  ${YELLOW}MANUAL${RESET}: ${MANUAL_COUNT}"
  echo -e "  ${DIM}SKIP${RESET}:   ${SKIP_COUNT}"
  echo ""

  if [ "${FAIL_COUNT}" -eq 0 ]; then
    echo -e "  ${GREEN}All automated checks passed!${RESET}"
  else
    echo -e "  ${RED}${FAIL_COUNT} check(s) failed.${RESET}"
  fi
  echo ""
}

# --- Main ---
main() {
  # Parse flags
  local test_args=()
  for arg in "$@"; do
    case "${arg}" in
      --verbose|-v) VERBOSE=true; DAEMON_VERBOSE_FLAG="--verbose" ;;
      *) test_args+=("${arg}") ;;
    esac
  done
  set -- "${test_args[@]+"${test_args[@]}"}"

  banner "Worktree Scripts — Manual Test Suite"
  echo "  Repo root: ${REPO_ROOT}"
  echo "  Lock dir:  ${LOCK_DIR}"
  echo "  Scripts:   spawnBGClaudeWT.sh, worktreeDaemon.sh, worktreeLib.sh"
  if [ "${VERBOSE}" = true ]; then
    echo "  Verbose:   ON"
  fi
  echo ""
  echo "  This test suite will create/destroy worktrees, branches, and"
  echo "  daemon processes. It will also open IDE windows."
  echo ""

  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [--verbose|-v] [test-id...]"
    echo ""
    echo "Run all tests:    $0"
    echo "Run single test:  $0 A1"
    echo "Verbose mode:     $0 --verbose A1"
    echo ""
    echo "Available tests (in suggested order):"
    for t in "${SUGGESTED_ORDER[@]}"; do
      echo "  ${t}"
    done
    exit 0
  fi

  read -rp "  Run full cleanup before starting? [Y/n]: " do_cleanup
  if [ "${do_cleanup}" != "n" ] && [ "${do_cleanup}" != "N" ]; then
    full_cleanup
  fi

  if [ $# -gt 0 ]; then
    # Run specific test(s)
    for test_id in "$@"; do
      run_test "${test_id}"
    done
  else
    # Run all tests in suggested order
    for test_id in "${SUGGESTED_ORDER[@]}"; do
      run_test "${test_id}"
      echo ""
      read -rp "  Continue to next test? [Y/n]: " cont
      if [ "${cont}" = "n" ] || [ "${cont}" = "N" ]; then
        echo "  Stopping."
        break
      fi
    done
  fi

  # Final cleanup offer
  echo ""
  read -rp "  Run full cleanup now? [Y/n]: " do_final_cleanup
  if [ "${do_final_cleanup}" != "n" ] && [ "${do_final_cleanup}" != "N" ]; then
    full_cleanup
  fi

  print_summary
}

main "$@"
