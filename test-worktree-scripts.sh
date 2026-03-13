#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# Manual Test Suite for Worktree Management Scripts (v2 — no lockfiles)
# =============================================================================
# Tests spawnWorktree.sh, worktreeDaemon.sh, worktreeLib.sh
# State derived from: git worktree list + .managed-worktree marker + PID file
#
# Usage:
#   bash test-worktree-scripts.sh [--verbose|-v] [test-id...]
#
# Examples:
#   bash test-worktree-scripts.sh                # Run all tests in suggested order
#   bash test-worktree-scripts.sh A1             # Run only test A1
#   bash test-worktree-scripts.sh --verbose A1   # Run A1 with verbose daemon/lib output
# =============================================================================

REPO_ROOT="$(realpath "$(git rev-parse --show-toplevel)")"
SCRIPT_DIR="${REPO_ROOT}"

# Source worktreeLib early for resolve_path helper
source "${SCRIPT_DIR}/worktreeLib.sh"

PIDFILE="${REPO_ROOT}/.worktree-daemon.pid"
LOGFILE="${REPO_ROOT}/.worktree-daemon.log"
TEST_WT_NAME="test_fresh_1"
TEST_WT_NAME2="test_fresh_2"
TEST_WT_PATH=$(resolve_path "${REPO_ROOT}/../${TEST_WT_NAME}")
TEST_WT_PATH2=$(resolve_path "${REPO_ROOT}/../${TEST_WT_NAME2}")

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
    if [ -f "${PIDFILE}" ]; then
      kill "$(<"${PIDFILE}")" 2>/dev/null || true
    fi
    return "${exit_code}"
  fi

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

assert_managed_worktree() {
  if [ -f "$1/.managed-worktree" ]; then
    pass ".managed-worktree marker exists: $1"
  else
    fail ".managed-worktree marker missing: $1"
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
  if [ -f "${PIDFILE}" ]; then
    cat "${PIDFILE}"
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

# Poll daemon log for a pattern.
# Usage: wait_for_log "pattern" <start_line> [timeout_seconds]
wait_for_log() {
  local pattern="$1"
  local start_line="${2:-0}"
  local timeout="${3:-30}"
  local elapsed=0

  while [ "${elapsed}" -lt "${timeout}" ]; do
    if tail -n +"$((start_line + 1))" "${LOGFILE}" 2>/dev/null | grep -qF "${pattern}"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  echo "  Timed out (${timeout}s) waiting for: ${pattern}"
  return 1
}

show_daemon_log_tail() {
  if [ "${VERBOSE}" = true ] && [ -f "${LOGFILE}" ]; then
    local start_line="${1:-0}"
    local new_lines
    new_lines="$(tail -n +$((start_line + 1)) "${LOGFILE}" 2>/dev/null)"
    if [ -n "${new_lines}" ]; then
      echo -e "  ${DIM}--- daemon.log (new lines) ---${RESET}"
      echo "${new_lines}" | sed 's/^/    /'
      echo -e "  ${DIM}--- end daemon.log ---${RESET}"
    fi
  fi
}

log_line_count() {
  wc -l < "${LOGFILE}" 2>/dev/null | tr -d ' ' || echo 0
}

# --- Full cleanup (between tests or at start) ---

full_cleanup() {
  section "Cleaning up test artifacts"

  # Kill daemon by PID file
  if [ -f "${PIDFILE}" ]; then
    local pid
    pid="$(<"${PIDFILE}")"
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      sleep 1
    fi
    rm -f "${PIDFILE}"
  fi

  # Remove test worktrees — with prefix guardrails
  for wt in "${TEST_WT_NAME}" "${TEST_WT_NAME2}" "phantom_wt" "orphan_parent_test" "test_manual_wt" "test_managed_c5" "test_unmanaged_c5"; do
    if [[ "${wt}" != test_* ]] && [[ "${wt}" != phantom_* ]] && [[ "${wt}" != orphan_* ]]; then
      echo "  SKIPPING non-test worktree: ${wt}"
      continue
    fi

    local wt_path
    wt_path=$(resolve_path "${REPO_ROOT}/../${wt}")

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
  done

  git worktree prune 2>/dev/null || true

  # Kill test tmux sessions
  tmux kill-session -t "${TEST_WT_NAME}" 2>/dev/null || true
  tmux kill-session -t "${TEST_WT_NAME2}" 2>/dev/null || true
  tmux kill-session -t "phantom_wt" 2>/dev/null || true
  tmux kill-session -t "orphan_parent_test" 2>/dev/null || true

  # Clean up throwaway branches
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
  echo "  Run: bash spawnWorktree.sh \"test fresh 1\""
  echo "  Expect: new branch, worktree, .managed-worktree marker, scaffold, daemon, IDE"
  echo ""

  local output
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  # Make a diverging commit so daemon doesn't consider the branch "merged"
  if [ -d "${TEST_WT_PATH}" ]; then
    (cd "${TEST_WT_PATH}" && echo "test marker" > test_marker.txt && git add test_marker.txt && git commit -m "test: diverge from parent" --no-verify) >/dev/null 2>&1
  fi

  section "Automated checks"
  assert_branch_exists "${TEST_WT_NAME}"
  assert_dir_exists "${TEST_WT_PATH}"
  assert_managed_worktree "${TEST_WT_PATH}"
  assert_file_exists "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/tasks.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/settings.json"

  # Check tasks.json contains correct worktree name (rendered from template)
  if [ -f "${TEST_WT_PATH}/.vscode/tasks.json" ]; then
    if grep -q "worktree-${TEST_WT_NAME}" "${TEST_WT_PATH}/.vscode/tasks.json"; then
      pass "tasks.json references worktree-${TEST_WT_NAME}"
    else
      fail "tasks.json missing worktree group reference"
    fi
  fi

  # Check .managed-worktree has birth_commit
  if [ -f "${TEST_WT_PATH}/.managed-worktree" ]; then
    if grep -q "^birth_commit=" "${TEST_WT_PATH}/.managed-worktree"; then
      pass ".managed-worktree contains birth_commit"
    else
      fail ".managed-worktree missing birth_commit"
    fi
  fi

  # Scaffold files should NOT appear in git status (excluded via .git/info/exclude)
  local git_status
  git_status="$(git -C "${TEST_WT_PATH}" status --porcelain -- .managed-worktree .claude/settings.json .vscode/tasks.json .vscode/settings.json 2>/dev/null)"
  if [ -z "${git_status}" ]; then
    pass "Scaffold files excluded from git status"
  else
    fail "Scaffold files appear in git status: ${git_status}"
  fi

  # No lockfile (v2 doesn't use lockfiles)
  assert_dir_missing "${REPO_ROOT}/.worktree-locks"

  # Daemon should be running
  assert_output_contains "${output}" "Daemon started"
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
  echo "  Run: bash spawnWorktree.sh \"test fresh 1\" (same name again)"
  echo "  Expect: CASE A reopen, scaffold refreshed, no new 'Daemon started'"
  echo ""

  if [ ! -d "${TEST_WT_PATH}" ]; then
    skip "test_fresh_1 worktree missing — run A1 first"
    return
  fi

  local output
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "CASE A"
  assert_output_not_contains "${output}" "Daemon started" "No 'Daemon started' message (already running)"
  assert_managed_worktree "${TEST_WT_PATH}"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- A3: Reopen with --force ---
test_A3() {
  banner "A3: Reopen with --force skips overwrite prompt"
  echo "  Setup: modify scaffold, reopen with --force"
  echo ""

  if [ ! -d "${TEST_WT_PATH}" ]; then
    skip "test_fresh_1 worktree missing — run A1 first"
    return
  fi

  section "Setup"
  # Modify a scaffold file
  echo '{"modified": true}' > "${TEST_WT_PATH}/.claude/settings.json"

  section "Execute"
  local output
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" --force "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "CASE A"
  assert_output_contains "${output}" "--force"

  # settings.json should be restored to template
  if diff -q "${REPO_ROOT}/v1/templates/settings.json" "${TEST_WT_PATH}/.claude/settings.json" >/dev/null 2>&1; then
    pass "settings.json restored to template after --force"
  else
    fail "settings.json not restored after --force"
  fi

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- A4: Path exists but branch doesn't ---
test_A4() {
  banner "A4: Path exists but branch doesn't (CASE C error)"
  echo "  Setup: create worktree, delete branch, try to reopen"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD 2>/dev/null || true

  # Detach HEAD and delete branch
  (cd "${TEST_WT_PATH}" && git checkout --detach HEAD 2>/dev/null) || true
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true

  assert_dir_exists "${TEST_WT_PATH}"
  assert_branch_missing "${TEST_WT_NAME}"

  section "Execute"
  local output exit_code
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "test fresh 1" 2>&1)" || exit_code=$?
  exit_code=${exit_code:-0}
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "CASE C" "Shows CASE C error path"
  assert_exit_code "${exit_code}" 1

  # Cleanup
  section "Teardown"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git worktree prune 2>/dev/null || true
}

# --- A5: Branch exists but path doesn't ---
test_A5() {
  banner "A5: Branch exists but path doesn't (CASE B re-create)"
  echo "  Setup: create branch, ensure no worktree path, run spawn"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git branch "${TEST_WT_NAME}" HEAD
  assert_branch_exists "${TEST_WT_NAME}"
  assert_dir_missing "${TEST_WT_PATH}"

  section "Execute"
  local output
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "test fresh 1" 2>&1)" || true
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "CASE B"
  assert_dir_exists "${TEST_WT_PATH}"
  assert_managed_worktree "${TEST_WT_PATH}"
  assert_file_exists "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/tasks.json"

  section "Manual checks"
  manual_check "IDE window opened at ${TEST_WT_PATH}"
}

# --- A6: Name validation ---
test_A6() {
  banner "A6: Name validation rejects invalid characters"
  echo "  Run: bash spawnWorktree.sh \"invalid.name/here\""
  echo ""

  local output exit_code
  output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "invalid.name/here" 2>&1)" || exit_code=$?
  exit_code=${exit_code:-0}
  echo "${output}"

  section "Automated checks"
  assert_output_contains "${output}" "Invalid worktree name"
  assert_exit_code "${exit_code}" 1
}

# --- B1: Daemon singleton ---
test_B1() {
  banner "B1: Singleton — daemon won't start twice"
  echo "  Run: worktreeDaemon.sh while daemon already runs"
  echo ""

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

# --- B2: Stale PID detection ---
test_B2() {
  banner "B2: Stale PID detection"
  echo "  Setup: hard-kill daemon, verify stale PID takeover"
  echo ""

  section "Setup — start a daemon if not running"
  if ! daemon_is_running; then
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
    sleep 2
  fi

  if ! daemon_is_running; then
    fail "Could not start daemon for stale PID test"
    return
  fi

  local old_pid
  old_pid="$(daemon_pid)"
  echo "  Hard-killing daemon PID ${old_pid} (kill -9)..."
  kill -9 "${old_pid}" 2>/dev/null || true
  sleep 1

  assert_file_exists "${PIDFILE}"

  section "Execute — start daemon again (should detect stale PID)"
  local log_lines_before
  log_lines_before="$(log_line_count)"

  nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
  sleep 2

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOGFILE}" 2>/dev/null)"

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

# --- B3: PID file lifecycle ---
test_B3() {
  banner "B3: PID file lifecycle"
  echo "  Verify: PID file created on start, removed on clean exit"
  echo ""

  section "Setup — kill any existing daemon"
  if daemon_is_running; then
    kill "$(daemon_pid)" 2>/dev/null || true
    sleep 2
  fi
  rm -f "${PIDFILE}"

  section "Execute — start daemon"
  nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
  sleep 2

  assert_file_exists "${PIDFILE}"
  local pid
  pid="$(daemon_pid)"

  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    pass "Daemon running with PID ${pid}"
  else
    fail "Daemon not running"
    return
  fi

  echo "  Sending SIGTERM..."
  kill "${pid}"
  sleep 2

  section "Automated checks"
  if ! kill -0 "${pid}" 2>/dev/null; then
    pass "Daemon process ${pid} is no longer running"
  else
    fail "Daemon process ${pid} still running after SIGTERM"
  fi

  assert_file_missing "${PIDFILE}"

  if [ -f "${LOGFILE}" ] && grep -q "Daemon shutting down (PID ${pid})" "${LOGFILE}"; then
    pass "daemon.log contains shutdown message for PID ${pid}"
  else
    fail "daemon.log missing shutdown message for PID ${pid}"
  fi
}

# --- B4: Merge detection via merge commit parents ---
test_B4() {
  banner "B4: Merge detection — awk-based merge commit parent scan"
  echo "  Setup: create worktree, merge with --no-ff, verify detection"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  # Create worktree with diverging commit
  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  (cd "${TEST_WT_PATH}" && echo "merge test content" > merge_test.txt && git add merge_test.txt && git commit -m "commit for merge test" --no-verify) >/dev/null 2>&1

  # Write .managed-worktree marker (needed for is_worktree_merged)
  source "${SCRIPT_DIR}/worktreeLib.sh"
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  # Merge into a throwaway branch
  local original_branch
  original_branch="$(git rev-parse --abbrev-ref HEAD)"
  local throwaway="__test_merge_target_$(date +%s)_b4"
  THROWAWAY_BRANCH="${throwaway}"
  git checkout -b "${throwaway}" HEAD
  git merge --no-ff "${TEST_WT_NAME}" -m "test merge for B4" || {
    git checkout "${original_branch}"
    fail "Merge failed"
    return
  }
  git checkout "${original_branch}"

  section "Execute"
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")

  if is_worktree_merged "${TEST_WT_NAME}" "${REPO_ROOT}"; then
    pass "is_worktree_merged correctly detects --no-ff merge"
  else
    fail "is_worktree_merged failed to detect --no-ff merge"
  fi

  section "Teardown"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git branch -D "${throwaway}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  THROWAWAY_BRANCH=""
}

# --- B5: No false positive on fresh branch ---
test_B5() {
  banner "B5: No false positive — fresh branch is NOT considered merged"
  echo "  Setup: create worktree, diverge, check is_worktree_merged returns false"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  (cd "${TEST_WT_PATH}" && echo "diverge" > diverge.txt && git add diverge.txt && git commit -m "diverge" --no-verify) >/dev/null 2>&1

  section "Execute"
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")

  if is_worktree_merged "${TEST_WT_NAME}" "${REPO_ROOT}"; then
    fail "is_worktree_merged false positive on fresh unmerged branch"
  else
    pass "is_worktree_merged correctly returns false for unmerged branch"
  fi

  section "Teardown"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- B6: Daemon cleanup after merge ---
test_B6() {
  banner "B6: Daemon detects merge and cleans up"
  echo "  Setup: create managed worktree, merge with --no-ff, let daemon handle it"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  # Create worktree via spawnWorktree.sh for full scaffold
  local spawn_output
  spawn_output="$(bash "${SCRIPT_DIR}/spawnWorktree.sh" "test fresh 1" 2>&1)" || true

  # Diverge
  (cd "${TEST_WT_PATH}" && echo "merge daemon test" > daemon_merge_test.txt && git add daemon_merge_test.txt && git commit -m "commit for daemon merge test" --no-verify) >/dev/null 2>&1

  # Merge into throwaway branch
  local original_branch
  original_branch="$(git rev-parse --abbrev-ref HEAD)"
  local throwaway="__test_merge_target_$(date +%s)_b6"
  THROWAWAY_BRANCH="${throwaway}"
  git checkout -b "${throwaway}" HEAD
  git merge --no-ff "${TEST_WT_NAME}" -m "test merge for B6" || {
    git checkout "${original_branch}"
    fail "Merge failed"
    return
  }
  git checkout "${original_branch}"

  # Ensure daemon is running
  if ! daemon_is_running; then
    rm -f "${PIDFILE}"
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
    sleep 2
  fi

  local log_lines_before
  log_lines_before="$(log_line_count)"

  echo "  Waiting for daemon to detect merge and clean up..."
  if ! wait_for_log "cleanup succeeded" "${log_lines_before}" 30; then
    fail "Daemon did not complete cleanup within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOGFILE}" 2>/dev/null)"

  assert_output_contains "${new_output}" "MERGED" "Daemon detects merge"
  assert_output_contains "${new_output}" "cleanup succeeded" "Cleanup succeeded"
  assert_dir_missing "${TEST_WT_PATH}"
  assert_branch_missing "${TEST_WT_NAME}"

  show_daemon_log_tail "${log_lines_before}"

  git branch -D "${throwaway}" 2>/dev/null || true
  THROWAWAY_BRANCH=""
}

# --- B7: Daemon skips cleanup when dirty ---
test_B7() {
  banner "B7: Daemon skips cleanup when worktree has uncommitted changes"
  echo "  Setup: create managed worktree, merge, add dirty file"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  # Create and scaffold
  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  (cd "${TEST_WT_PATH}" && echo "merged content" > merged_file.txt && git add merged_file.txt && git commit -m "commit for B7" --no-verify) >/dev/null 2>&1

  # Merge into throwaway
  local original_branch
  original_branch="$(git rev-parse --abbrev-ref HEAD)"
  local throwaway="__test_merge_target_$(date +%s)_b7"
  THROWAWAY_BRANCH="${throwaway}"
  git checkout -b "${throwaway}" HEAD
  git merge --no-ff "${TEST_WT_NAME}" -m "test merge for B7"
  git checkout "${original_branch}"

  # Add uncommitted change (this is a real file, not scaffold)
  echo "dirty local change" > "${TEST_WT_PATH}/local_edit.txt"

  # Ensure daemon is running
  if ! daemon_is_running; then
    rm -f "${PIDFILE}"
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
    sleep 2
  fi

  local log_lines_before
  log_lines_before="$(log_line_count)"

  echo "  Waiting for daemon to detect merge and attempt cleanup..."
  if ! wait_for_log "cleanup returned non-zero" "${log_lines_before}" 30; then
    fail "Daemon did not report cleanup failure within timeout"
  fi

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOGFILE}" 2>/dev/null)"

  assert_output_contains "${new_output}" "MERGED" "Daemon detects merge"
  assert_output_contains "${new_output}" "cleanup returned non-zero" "Cleanup blocked by dirty files"
  assert_dir_exists "${TEST_WT_PATH}"
  pass "Worktree kept (has uncommitted changes)"

  show_daemon_log_tail "${log_lines_before}"

  # Teardown
  section "Teardown"
  rm -f "${TEST_WT_PATH}/local_edit.txt"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git branch -D "${throwaway}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
  THROWAWAY_BRANCH=""
}

# --- B8: Daemon ignores unmanaged worktrees ---
test_B8() {
  banner "B8: Daemon ignores manually-created worktrees (no marker)"
  echo "  Setup: create worktree manually (no .managed-worktree), verify daemon ignores it"
  echo ""

  section "Setup"
  local manual_name="test_manual_wt"
  local manual_path
  manual_path=$(resolve_path "${REPO_ROOT}/../${manual_name}")

  git worktree remove --force "${manual_path}" 2>/dev/null || rm -rf "${manual_path}"
  git branch -D "${manual_name}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${manual_name}" "${manual_path}" HEAD
  # Deliberately NOT creating .managed-worktree marker

  if ! daemon_is_running; then
    rm -f "${PIDFILE}"
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
    sleep 2
  fi

  local log_lines_before
  log_lines_before="$(log_line_count)"

  echo "  Waiting 2 poll intervals (15s) to confirm daemon ignores it..."
  sleep 15

  section "Automated checks"
  local new_output
  new_output="$(tail -n +$((log_lines_before + 1)) "${LOGFILE}" 2>/dev/null)"

  assert_output_not_contains "${new_output}" "${manual_name}" "Daemon doesn't reference unmanaged worktree"
  assert_dir_exists "${manual_path}"
  pass "Unmanaged worktree untouched"

  show_daemon_log_tail "${log_lines_before}"

  # Teardown
  git worktree remove --force "${manual_path}" 2>/dev/null || rm -rf "${manual_path}"
  git branch -D "${manual_name}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- B9: SIGTERM clean shutdown ---
test_B9() {
  banner "B9: SIGTERM — clean daemon shutdown"
  echo "  Run: kill daemon PID"
  echo "  Expect: 'Daemon shutting down', PID file removed"
  echo ""

  if ! daemon_is_running; then
    echo "  Starting daemon first..."
    nohup bash "${SCRIPT_DIR}/worktreeDaemon.sh" "${REPO_ROOT}" ${DAEMON_VERBOSE_FLAG} >> "${LOGFILE}" 2>&1 &
    sleep 2
  fi

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

  assert_file_missing "${PIDFILE}"

  if [ -f "${LOGFILE}" ] && grep -q "Daemon shutting down (PID ${pid})" "${LOGFILE}"; then
    pass "daemon.log contains shutdown message for PID ${pid}"
  else
    fail "daemon.log missing shutdown message for PID ${pid}"
  fi
}

# --- C1: scaffold_worktree populates .git/info/exclude ---
test_C1() {
  banner "C1: scaffold_worktree populates .git/info/exclude"
  echo "  Verify: scaffold files are excluded from git tracking"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD

  section "Execute"
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  section "Automated checks"
  # Find the exclude file
  local gitdir
  gitdir=$(git -C "${TEST_WT_PATH}" rev-parse --git-dir 2>/dev/null)
  if [[ "${gitdir}" != /* ]]; then
    gitdir="${TEST_WT_PATH}/${gitdir}"
  fi
  local exclude_file="${gitdir}/info/exclude"

  if [ -f "${exclude_file}" ]; then
    for entry in ".managed-worktree" ".claude/settings.json" ".vscode/tasks.json" ".vscode/settings.json"; do
      if grep -qxF "${entry}" "${exclude_file}"; then
        pass "Exclude file contains: ${entry}"
      else
        fail "Exclude file missing: ${entry}"
      fi
    done
  else
    fail "Exclude file not found: ${exclude_file}"
  fi

  # Verify scaffold files don't show in git status
  local status
  status="$(git -C "${TEST_WT_PATH}" status --porcelain 2>/dev/null)"
  if [ -z "${status}" ]; then
    pass "Scaffold files invisible to git status"
  else
    fail "Scaffold files visible in git status: ${status}"
  fi

  # Cleanup
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- C2: has_non_scaffold_changes returns correctly ---
test_C2() {
  banner "C2: has_non_scaffold_changes detects real changes only"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  section "Test 1: scaffold only → no changes"
  if has_non_scaffold_changes "${TEST_WT_PATH}"; then
    fail "False positive — scaffold-only worktree reported as having changes"
  else
    pass "Scaffold-only worktree correctly reports no changes"
  fi

  section "Test 2: add a real file → has changes"
  echo "real edit" > "${TEST_WT_PATH}/real_change.txt"
  if has_non_scaffold_changes "${TEST_WT_PATH}"; then
    pass "Real change correctly detected"
  else
    fail "Real change not detected"
  fi

  # Cleanup
  rm -f "${TEST_WT_PATH}/real_change.txt"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- C3: discard_scaffold_files removes scaffold ---
test_C3() {
  banner "C3: discard_scaffold_files removes scaffold files"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  assert_file_exists "${TEST_WT_PATH}/.managed-worktree"
  assert_file_exists "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_exists "${TEST_WT_PATH}/.vscode/tasks.json"

  section "Execute"
  discard_scaffold_files "${TEST_WT_PATH}"

  section "Automated checks"
  assert_file_missing "${TEST_WT_PATH}/.managed-worktree"
  assert_file_missing "${TEST_WT_PATH}/.claude/settings.json"
  assert_file_missing "${TEST_WT_PATH}/.vscode/tasks.json"
  assert_file_missing "${TEST_WT_PATH}/.vscode/settings.json"

  # Cleanup
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- C4: check_scaffold_modified detects changes ---
test_C4() {
  banner "C4: check_scaffold_modified detects modified scaffold"
  echo ""

  section "Setup"
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${TEST_WT_NAME}" "${TEST_WT_PATH}" HEAD
  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"

  section "Test 1: unmodified → returns 1 (not modified)"
  if check_scaffold_modified "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"; then
    fail "False positive — fresh scaffold reported as modified"
  else
    pass "Fresh scaffold correctly reports unmodified"
  fi

  section "Test 2: modify settings.json → returns 0 (modified)"
  echo '{"modified": true}' > "${TEST_WT_PATH}/.claude/settings.json"
  if check_scaffold_modified "${TEST_WT_PATH}" "${TEST_WT_NAME}" "${REPO_ROOT}"; then
    pass "Modified scaffold correctly detected"
  else
    fail "Modified scaffold not detected"
  fi

  # Cleanup
  git worktree remove --force "${TEST_WT_PATH}" 2>/dev/null || rm -rf "${TEST_WT_PATH}"
  git branch -D "${TEST_WT_NAME}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# --- C5: get_worktrees filters correctly ---
test_C5() {
  banner "C5: get_worktrees returns only managed worktrees"
  echo ""

  section "Setup — create one managed and one unmanaged worktree"
  local managed_name="test_managed_c5"
  local unmanaged_name="test_unmanaged_c5"
  local managed_path unmanaged_path
  managed_path=$(resolve_path "${REPO_ROOT}/../${managed_name}")
  unmanaged_path=$(resolve_path "${REPO_ROOT}/../${unmanaged_name}")

  git worktree remove --force "${managed_path}" 2>/dev/null || rm -rf "${managed_path}"
  git worktree remove --force "${unmanaged_path}" 2>/dev/null || rm -rf "${unmanaged_path}"
  git branch -D "${managed_name}" 2>/dev/null || true
  git branch -D "${unmanaged_name}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true

  git worktree add -b "${managed_name}" "${managed_path}" HEAD
  git worktree add -b "${unmanaged_name}" "${unmanaged_path}" HEAD

  source "${SCRIPT_DIR}/worktreeLib.sh"
  REPO_ROOT=$(realpath "$(git rev-parse --show-toplevel)")
  scaffold_worktree "${managed_path}" "${managed_name}" "${REPO_ROOT}"

  section "Execute"
  local output
  output="$(get_worktrees "${REPO_ROOT}")"
  echo "  get_worktrees output:"
  echo "${output}" | sed 's/^/    /'

  section "Automated checks"
  if echo "${output}" | grep -q "${managed_name}"; then
    pass "Managed worktree '${managed_name}' found"
  else
    fail "Managed worktree '${managed_name}' missing from output"
  fi

  if echo "${output}" | grep -q "${unmanaged_name}"; then
    fail "Unmanaged worktree '${unmanaged_name}' should not appear"
  else
    pass "Unmanaged worktree '${unmanaged_name}' correctly filtered out"
  fi

  # Cleanup
  git worktree remove --force "${managed_path}" 2>/dev/null || rm -rf "${managed_path}"
  git worktree remove --force "${unmanaged_path}" 2>/dev/null || rm -rf "${unmanaged_path}"
  git branch -D "${managed_name}" 2>/dev/null || true
  git branch -D "${unmanaged_name}" 2>/dev/null || true
  git worktree prune 2>/dev/null || true
}

# =============================================================================
# RUNNER
# =============================================================================

SUGGESTED_ORDER=(A1 A2 A3 A6 A4 A5 B1 B2 B3 B4 B5 B6 B7 B8 B9 C1 C2 C3 C4 C5)

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
    C1) test_C1 ;;
    C2) test_C2 ;;
    C3) test_C3 ;;
    C4) test_C4 ;;
    C5) test_C5 ;;
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
  local test_args=()
  for arg in "$@"; do
    case "${arg}" in
      --verbose|-v) VERBOSE=true; DAEMON_VERBOSE_FLAG="--verbose" ;;
      *) test_args+=("${arg}") ;;
    esac
  done
  set -- "${test_args[@]+"${test_args[@]}"}"

  banner "Worktree Scripts — Test Suite (v2)"
  echo "  Repo root: ${REPO_ROOT}"
  echo "  PID file:  ${PIDFILE}"
  echo "  Log file:  ${LOGFILE}"
  echo "  Scripts:   spawnWorktree.sh, worktreeDaemon.sh, worktreeLib.sh"
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
    for test_id in "$@"; do
      run_test "${test_id}"
    done
  else
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

  echo ""
  read -rp "  Run full cleanup now? [Y/n]: " do_final_cleanup
  if [ "${do_final_cleanup}" != "n" ] && [ "${do_final_cleanup}" != "N" ]; then
    full_cleanup
  fi

  print_summary
}

main "$@"
