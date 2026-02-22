#!/usr/bin/env bash
set -euo pipefail

# review-questions.sh — Scan Questions/Awaiting/ and spawn agents for pending responses
# Called every N seconds by review-questions-daemon.sh
#
# Usage: review-questions.sh <project_root>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBMODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SUBMODULE_DIR/config.sh"

PROJECT_ROOT="${1:?Usage: review-questions.sh <project_root>}"
AWAITING_PATH="$PROJECT_ROOT/$AWAITING_DIR"
RESOLVED_PATH="$PROJECT_ROOT/$RESOLVED_DIR"
LOCKS_DIR="$PROJECT_ROOT/.question-review-locks"
PROMPT_FILE="$SUBMODULE_DIR/$AGENT_PROMPT"

# ---------- Helper functions ----------

# Check if the last substantive block in a question file is a <user_response>
# with non-empty <text> content.
has_pending_user_response() {
    local file="$1"

    # Get line numbers of key tags
    local last_user_response last_response_agent

    last_user_response=$(grep -n '<user_response>' "$file" | tail -1 | cut -d: -f1) || true
    last_response_agent=$(grep -n '<response_' "$file" | tail -1 | cut -d: -f1) || true

    # No user_response at all
    [[ -z "$last_user_response" ]] && return 1

    # If there's a response_agent AFTER the last user_response, agent already responded
    if [[ -n "$last_response_agent" && "$last_response_agent" -gt "$last_user_response" ]]; then
        return 1
    fi

    # Check if the <text> in the last user_response has non-whitespace content
    local text_content
    text_content=$(sed -n "${last_user_response},\$p" "$file" \
        | sed -n '/<text>/,/<\/text>/p' \
        | sed '1s/.*<text>//; $s/<\/text>.*//' \
        | tr -d '[:space:]')

    [[ -n "$text_content" ]]
}

# Extract Q number from filename (e.g., "Q174_foo.md" → "Q174")
extract_q_number() {
    local filename
    filename="$(basename "$1")"
    echo "$filename" | grep -oE '^Q[0-9]+' || true
}

# ---------- Re-prompt existing agent ----------

reprompt_agent() {
    local q_num="$1"
    local question_file="$2"
    local lockfile="$LOCKS_DIR/${q_num}.lock"
    local pane_id
    pane_id=$(head -1 "$lockfile")

    # Check if file has changed since last re-prompt (mtime stored on line 2)
    local current_mtime last_mtime
    current_mtime=$(stat -f '%m' "$question_file" 2>/dev/null)
    last_mtime=$(sed -n '2p' "$lockfile" 2>/dev/null)
    if [[ -n "$last_mtime" && "$current_mtime" == "$last_mtime" ]]; then
        return 1  # file unchanged since last re-prompt, skip
    fi

    # Cancel any in-progress work before re-prompting.
    # Send Ctrl-C until Claude shows "Press Ctrl-C again to exit" (meaning it's idle).
    local attempt=0
    while [[ $attempt -lt 5 ]]; do
        tmux send-keys -t "$pane_id" C-c
        sleep 0.2
        local pane_tail
        pane_tail=$(tmux capture-pane -t "$pane_id" -p -S -5 2>/dev/null || true)
        if echo "$pane_tail" | grep -qF 'Ctrl-C'; then
            break
        fi
        attempt=$((attempt + 1))
    done
    if [[ $attempt -gt 0 ]]; then
        echo "[review]   Cancelled in-progress work: $q_num ($((attempt + 1)) Ctrl-C's)"
    fi

    tmux send-keys -t "$pane_id" "re-read ${question_file} (the main tree copy, not the worktree copy). process the new response." Enter
    sleep 0.5
    tmux send-keys -t "$pane_id" Enter

    # Store mtime so we don't re-prompt again until the file changes
    echo -e "${pane_id}\n${current_mtime}" > "$lockfile"

    echo "[review]   Re-prompted agent: $q_num (pane $pane_id)"
}

# ---------- Lockfile-based dedup ----------
# Pane titles are unreliable (shells override them). Use lockfiles instead.
# Each lockfile contains the tmux pane_id. If the pane still exists, the agent is active.

ensure_locks_dir() {
    mkdir -p "$LOCKS_DIR"
    # Add to .gitignore if not already there
    local gitignore="$PROJECT_ROOT/.gitignore"
    if [[ -f "$gitignore" ]]; then
        grep -qF '.question-review-locks' "$gitignore" 2>/dev/null || echo '.question-review-locks/' >> "$gitignore"
    else
        echo '.question-review-locks/' > "$gitignore"
    fi
}

# Clean up lockfiles for questions no longer in Awaiting/ (resolved/moved)
cleanup_stale_locks() {
    [[ ! -d "$LOCKS_DIR" ]] && return
    for lockfile in "$LOCKS_DIR"/*.lock; do
        [[ ! -f "$lockfile" ]] && continue
        local q_num
        q_num=$(basename "$lockfile" .lock)
        shopt -s nullglob
        local matches=("$AWAITING_PATH"/${q_num}_*.md)
        shopt -u nullglob
        if [[ ${#matches[@]} -eq 0 ]]; then
            local pane_id
            pane_id=$(head -1 "$lockfile")
            tmux kill-pane -t "$pane_id" 2>/dev/null || true
            rm -f "$lockfile"
            # Clean up worktree and branch
            if [[ -d "$PROJECT_ROOT/.claude/worktrees/$q_num" ]]; then
                git -C "$PROJECT_ROOT" worktree remove --force ".claude/worktrees/$q_num" 2>/dev/null || true
            fi
            git -C "$PROJECT_ROOT" worktree prune 2>/dev/null || true
            git -C "$PROJECT_ROOT" branch -D "worktree-$q_num" 2>/dev/null || true
            echo "[review]   Cleaned up: $q_num (pane, lock, worktree, branch)"
        fi
    done
}

# Dismiss finished agent panes waiting for user to press Enter
cleanup_finished_panes() {
    [[ ! -d "$LOCKS_DIR" ]] && return
    for lockfile in "$LOCKS_DIR"/*.lock; do
        [[ ! -f "$lockfile" ]] && continue
        local pane_id
        pane_id=$(head -1 "$lockfile")
        # Check if pane is alive and showing the "finished" message
        local pane_tail
        pane_tail=$(tmux capture-pane -t "$pane_id" -p -S -5 2>/dev/null || true)
        if echo "$pane_tail" | grep -qF 'Press enter to close'; then
            local q_num
            q_num=$(basename "$lockfile" .lock)
            tmux send-keys -t "$pane_id" Enter
            echo "[review]   Dismissed finished pane: $q_num"
        fi
    done
}

# Check if a specific Q number has an active agent (lockfile + pane still alive)
has_active_agent() {
    local q_num="$1"
    local lockfile="$LOCKS_DIR/${q_num}.lock"

    [[ ! -f "$lockfile" ]] && return 1

    # Lockfile exists — check if the pane is still alive
    local pane_id
    pane_id=$(head -1 "$lockfile")

    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null \
       && tmux list-panes -t "$TMUX_SESSION" -F '#{pane_id}' 2>/dev/null | grep -qF "$pane_id"; then
        return 0  # pane alive, agent active
    else
        # Stale lockfile — pane is gone
        rm -f "$lockfile"
        return 1
    fi
}

# Count active agent lockfiles (with live panes)
count_active_agents() {
    local count=0
    if [[ -d "$LOCKS_DIR" ]]; then
        for lockfile in "$LOCKS_DIR"/*.lock; do
            [[ ! -f "$lockfile" ]] && continue
            local pane_id
            pane_id=$(head -1 "$lockfile")
            if tmux has-session -t "$TMUX_SESSION" 2>/dev/null \
               && tmux list-panes -t "$TMUX_SESSION" -F '#{pane_id}' 2>/dev/null | grep -qF "$pane_id"; then
                count=$((count + 1))
            else
                rm -f "$lockfile"  # clean stale lock
            fi
        done
    fi
    echo "$count"
}

# Track whether session was just created (first agent uses new-session, not split-window)
SESSION_CREATED=false

# Spawn a tmux pane for a question
spawn_agent_pane() {
    local q_num="$1"
    local question_file="$2"
    local lockfile="$LOCKS_DIR/${q_num}.lock"

    # Relative path to question file (from project root)
    local q_relpath="${question_file#"$PROJECT_ROOT"/}"

    # Build the initial message with all context the agent needs
    local initial_msg="Process question file: ${q_relpath} (Q number: ${q_num}). Main tree: ${PROJECT_ROOT}. Resolved dir: ${RESOLVED_DIR}. Awaiting dir: ${AWAITING_DIR}. IMPORTANT: Always read the main tree copy of the question file first (${question_file}), not the worktree copy, because the worktree may be stale."

    # Build claude command with prompt (Phase 2) or bare (Phase 1 fallback)
    # Lockfile is removed AFTER 'read' so it persists while the pane is open
    local launcher="$SUBMODULE_DIR/scripts/launch-agent.sh"
    local agent_cmd
    if [[ -f "$PROMPT_FILE" ]]; then
        agent_cmd="unset CLAUDECODE; '${launcher}' '${PROMPT_FILE}' --worktree ${q_num} --add-dir '${PROJECT_ROOT}' -- '${initial_msg}'; echo '[agent] ${q_num} finished. Press enter to close.'; read; rm -f '${lockfile}'"
    else
        echo "[review]   WARNING: Prompt file not found ($PROMPT_FILE). Launching bare claude."
        agent_cmd="unset CLAUDECODE; claude --worktree ${q_num}; echo '[agent] ${q_num} finished. Press enter to close.'; read; rm -f '${lockfile}'"
    fi

    local pane_id
    if [[ "$SESSION_CREATED" == false ]] && ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        # Create session with this agent as pane 0 — no blank shell
        pane_id=$(tmux new-session -d -s "$TMUX_SESSION" -x "$TERMINAL_COLS" -y "$TERMINAL_ROWS" \
            -c "$PROJECT_ROOT" \
            -P -F '#{pane_id}' \
            "$agent_cmd")
        SESSION_CREATED=true
        # Enable pane titles in border; block apps from overriding titles
        tmux set-option -t "$TMUX_SESSION" pane-border-status top
        tmux set-option -t "$TMUX_SESSION" pane-border-format " #{pane_title} "
        tmux set-window-option -t "$TMUX_SESSION" allow-rename off
        tmux set-window-option -t "$TMUX_SESSION" automatic-rename off
    else
        pane_id=$(tmux split-window -t "$TMUX_SESSION" \
            -c "$PROJECT_ROOT" \
            -P -F '#{pane_id}' \
            "$agent_cmd")
    fi

    # Write lockfile with pane_id and file mtime for dedup tracking
    local spawn_mtime
    spawn_mtime=$(stat -f '%m' "$question_file" 2>/dev/null)
    echo -e "${pane_id}\n${spawn_mtime}" > "$lockfile"

    # Set pane title
    tmux select-pane -t "$pane_id" -T "$q_num"

    # Rebalance layout
    tmux select-layout -t "$TMUX_SESSION" tiled

    echo "[review]   Spawned agent pane: $q_num (pane $pane_id)"
}

# ---------- Main scan ----------

# Bail early if Awaiting/ doesn't exist or is empty
if [[ ! -d "$AWAITING_PATH" ]]; then
    exit 0
fi

# Collect Q*.md files
shopt -s nullglob
question_files=("$AWAITING_PATH"/Q*.md)
shopt -u nullglob

if [[ ${#question_files[@]} -eq 0 ]]; then
    exit 0
fi

ensure_locks_dir
cleanup_finished_panes
cleanup_stale_locks

spawned=0
reprompted=0
skipped_no_response=0
skipped_max=0

for file in "${question_files[@]}"; do
    q_num=$(extract_q_number "$file")
    [[ -z "$q_num" ]] && continue

    # Check for pending user response
    if ! has_pending_user_response "$file"; then
        skipped_no_response=$((skipped_no_response + 1))
        continue
    fi

    # Re-prompt existing agent if it has a pending response
    if has_active_agent "$q_num"; then
        if reprompt_agent "$q_num" "$file"; then
            reprompted=$((reprompted + 1))
        fi
        continue
    fi

    # Check MAX_AGENTS
    active=$(count_active_agents)
    if [[ "$active" -ge "$MAX_AGENTS" ]]; then
        skipped_max=$((skipped_max + 1))
        echo "[review]   $q_num queued (max $MAX_AGENTS agents active)"
        continue
    fi

    # Spawn agent (stagger to avoid git worktree lock contention)
    spawn_agent_pane "$q_num" "$file"
    spawned=$((spawned + 1))
    sleep 3
done

# Only log if something happened
if [[ $spawned -gt 0 || $reprompted -gt 0 || $skipped_max -gt 0 ]]; then
    echo "[review] Scan complete: $spawned spawned, $reprompted re-prompted, $skipped_max queued, $skipped_no_response no response"
fi
