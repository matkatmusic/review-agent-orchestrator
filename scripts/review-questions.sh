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

# ---------- Terminal window ----------

open_terminal_window() {
    if [[ "$TERMINAL_APP" == "Antigravity" ]]; then
        osascript <<APPLESCRIPT 2>/dev/null || true
tell application "System Events"
    tell first process whose bundle identifier is "com.google.antigravity"
        set frontmost to true
        delay 0.3
        -- Ctrl-Shift-\` to open a new terminal pane
        keystroke "\`" using {control down, shift down}
        delay 0.5
        -- Type the tmux attach command
        keystroke "tmux attach -t ${TMUX_SESSION}"
        key code 36 -- Enter
    end tell
end tell
APPLESCRIPT
    elif [[ "$TERMINAL_APP" == "iTerm" ]]; then
        osascript -e "tell application \"iTerm2\" to create window with default profile command \"tmux attach -t $TMUX_SESSION\"" 2>/dev/null || true
    else
        osascript <<APPLESCRIPT 2>/dev/null || true
tell application "Terminal"
    do script "tmux attach -t $TMUX_SESSION"
    set bounds of front window to {0, 0, ${TERMINAL_COLS} * 7, ${TERMINAL_ROWS} * 14}
    set number of columns of front window to ${TERMINAL_COLS}
    set number of rows of front window to ${TERMINAL_ROWS}
end tell
APPLESCRIPT
    fi
    echo "[review]   Opened $TERMINAL_APP window for tmux session '$TMUX_SESSION'"
}

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

# DISABLED: Kill agent, clean up worktree, clear lockfile so scanner respawns fresh
# relaunch_agent() {
#     local q_num="$1"
#     local lockfile="$LOCKS_DIR/${q_num}.lock"
#     if [[ -f "$lockfile" ]]; then
#         local pane_id
#         pane_id=$(head -1 "$lockfile")
#         tmux kill-pane -t "$pane_id" 2>/dev/null || true
#         rm -f "$lockfile"
#     fi
#     if [[ -d "$PROJECT_ROOT/.claude/worktrees/$q_num" ]]; then
#         git -C "$PROJECT_ROOT" worktree remove --force ".claude/worktrees/$q_num" 2>/dev/null || true
#     fi
#     git -C "$PROJECT_ROOT" worktree prune 2>/dev/null || true
#     git -C "$PROJECT_ROOT" branch -D "worktree-$q_num" 2>/dev/null || true
#     echo "[review]   Relaunched: $q_num (killed pane, cleaned worktree)"
# }

# Get the trimmed text of the last pending <user_response> block.
get_pending_response_text() {
    local file="$1"
    local last_user_response
    last_user_response=$(grep -n '<user_response>' "$file" | tail -1 | cut -d: -f1) || true
    [[ -z "$last_user_response" ]] && return
    local raw
    raw=$(sed -n "${last_user_response},\$p" "$file" \
        | sed -n '/<text>/,/<\/text>/p' \
        | sed '1s/.*<text>//; $s/<\/text>.*//' \
        | tr -s '[:space:]' ' ')
    # Trim leading/trailing spaces
    raw="${raw#"${raw%%[![:space:]]*}"}"
    raw="${raw%"${raw##*[![:space:]]}"}"
    echo "$raw"
}

# Extract Q number from filename (e.g., "Q174_foo.md" → "Q174")
extract_q_number() {
    local filename
    filename="$(basename "$1")"
    echo "$filename" | grep -oE '^Q[0-9]+' || true
}

# ---------- Cancel + re-prompt helpers ----------

# Send Ctrl-C until the agent is idle, then send a message.
# Used by both reprompt_agent and notify_main_changed.
cancel_and_send() {
    local pane_id="$1"
    local message="$2"
    local q_num="$3"

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

    tmux send-keys -t "$pane_id" "$message" Enter
    sleep 0.5
    tmux send-keys -t "$pane_id" Enter
}

# Write lockfile: line 1 = pane_id, line 2 = mtime, line 3 = HEAD commit
write_lockfile() {
    local lockfile="$1"
    local pane_id="$2"
    local mtime="$3"
    local head_commit
    head_commit=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
    printf '%s\n%s\n%s\n' "$pane_id" "$mtime" "$head_commit" > "$lockfile"
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

    # Skip if agent is showing a UI prompt — don't interrupt it
    local pane_tail
    pane_tail=$(tmux capture-pane -t "$pane_id" -p -S -10 2>/dev/null || true)
    if echo "$pane_tail" | grep -qF 'Esc to cancel'; then
        return 1
    fi

    # Check if the response is a simple command (resolve/defer) — send directly
    local response_text
    response_text=$(get_pending_response_text "$question_file")
    local response_lower
    response_lower=$(echo "$response_text" | tr '[:upper:]' '[:lower:]')
    local message
    case "$response_lower" in
        resolve|resolved|close|done|"mark resolved")
            message="resolve ${q_num}"
            ;;
        defer|deferred|postpone|later|"not now"|"skip for now"|"move to deferred")
            message="defer ${q_num}"
            ;;
        *)
            message="NEW USER RESPONSE in ${question_file} (main tree copy). Steps: (1) Re-read the file. (2) Classify the latest pending response: RESOLVE, RESPOND, or IMPLEMENT. (3) Execute. CRITICAL: If IMPLEMENT, you MUST call AskUserQuestion with 'Ready to apply changes to main tree?' BEFORE applying any changes to the main tree. Do NOT skip this step."
            ;;
    esac

    cancel_and_send "$pane_id" "$message" "$q_num"

    # Update lockfile with current mtime and HEAD
    write_lockfile "$lockfile" "$pane_id" "$current_mtime"

    echo "[review]   Re-prompted agent: $q_num (pane $pane_id)"
}

# ---------- Notify agents when main branch changes ----------

notify_main_changed() {
    [[ ! -d "$LOCKS_DIR" ]] && return
    local current_head
    current_head=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null) || return
    local notified=0

    for lockfile in "$LOCKS_DIR"/*.lock; do
        [[ ! -f "$lockfile" ]] && continue
        local pane_id stored_head q_num
        pane_id=$(head -1 "$lockfile")
        stored_head=$(sed -n '3p' "$lockfile" 2>/dev/null)
        q_num=$(basename "$lockfile" .lock)

        # Skip if HEAD hasn't changed or no stored HEAD
        [[ -z "$stored_head" || "$stored_head" == "$current_head" ]] && continue

        # Skip idle agents (no pending user response) — rebase is pointless waste
        shopt -s nullglob
        local q_files=("$AWAITING_PATH"/${q_num}_*.md)
        shopt -u nullglob
        if [[ ${#q_files[@]} -gt 0 ]]; then
            if ! has_pending_user_response "${q_files[0]}"; then
                # Update stored HEAD so we don't re-check every scan
                local mtime
                mtime=$(sed -n '2p' "$lockfile" 2>/dev/null)
                write_lockfile "$lockfile" "$pane_id" "$mtime"
                continue
            fi
        fi

        # Verify pane is still alive
        if ! tmux list-panes -t "$TMUX_SESSION" -F '#{pane_id}' 2>/dev/null | grep -qF "$pane_id"; then
            continue
        fi

        # Skip if agent is showing a UI prompt (AskUserQuestion) — ESC would dismiss it
        local pane_tail
        pane_tail=$(tmux capture-pane -t "$pane_id" -p -S -10 2>/dev/null || true)
        if echo "$pane_tail" | grep -qF 'Esc to cancel'; then
            continue
        fi

        local new_head
        new_head=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null)
        cancel_and_send "$pane_id" "The main repo has new commits. You are in worktree-${q_num}. Rebase: git rebase ${new_head} — After rebasing, if you have uncommitted or unapplied IMPLEMENT changes, you MUST call AskUserQuestion with 'Ready to apply changes to main tree?' before applying." "$q_num"

        # Update stored HEAD (preserve pane_id and mtime)
        local mtime
        mtime=$(sed -n '2p' "$lockfile" 2>/dev/null)
        write_lockfile "$lockfile" "$pane_id" "$mtime"

        notified=$((notified + 1))
        echo "[review]   Notified $q_num: main repo has new commits"
    done

    if [[ $notified -gt 0 ]]; then
        echo "[review]   $notified agent(s) notified of new commits in main repo"
    fi
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

    # If no lockfiles remain, kill the tmux session entirely to avoid a leftover blank pane.
    # (tmux spawns a replacement shell when the last pane in a session is killed.)
    shopt -s nullglob
    local remaining_locks=("$LOCKS_DIR"/*.lock)
    shopt -u nullglob
    if [[ ${#remaining_locks[@]} -eq 0 ]] && tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
        echo "[review]   Killed empty tmux session (no active agents)"
    fi
}

# DISABLED: Relaunch on worktree file conflicts with main
# Check if a worktree has file conflicts with new commits on main
# has_conflicting_files() {
#     local q_num="$1"
#     local main_head
#     main_head=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null) || return 1
#     local worktree_base
#     worktree_base=$(git -C "$PROJECT_ROOT" merge-base "worktree-$q_num" HEAD 2>/dev/null) || return 1
#     [[ "$worktree_base" == "$main_head" ]] && return 1
#     local main_changed
#     main_changed=$(git -C "$PROJECT_ROOT" diff --name-only "$worktree_base" HEAD 2>/dev/null) || return 1
#     [[ -z "$main_changed" ]] && return 1
#     local worktree_changed
#     worktree_changed=$(git -C "$PROJECT_ROOT" diff --name-only "$worktree_base" "worktree-$q_num" 2>/dev/null) || return 1
#     [[ -z "$worktree_changed" ]] && return 1
#     local overlap
#     overlap=$(comm -12 <(echo "$main_changed" | sort) <(echo "$worktree_changed" | sort))
#     [[ -n "$overlap" ]]
# }

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
    local initial_msg="Process question file: ${q_relpath} (Q number: ${q_num}). Main tree: ${PROJECT_ROOT}. Resolved dir: ${RESOLVED_DIR}. Deferred dir: ${DEFERRED_DIR}. Awaiting dir: ${AWAITING_DIR}. IMPORTANT: Always read the main tree copy of the question file first (${question_file}), not the worktree copy, because the worktree may be stale."

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

    # Write lockfile with pane_id, file mtime, and HEAD for tracking
    local spawn_mtime
    spawn_mtime=$(stat -f '%m' "$question_file" 2>/dev/null)
    write_lockfile "$lockfile" "$pane_id" "$spawn_mtime"

    # Set pane title
    tmux select-pane -t "$pane_id" -T "$q_num"

    # Rebalance layout
    tmux select-layout -t "$TMUX_SESSION" tiled

    echo "[review]   Spawned agent pane: $q_num (pane $pane_id)"
}

# ---------- Main scan ----------

# Always run cleanup — even when Awaiting/ is empty, stale panes may need killing
ensure_locks_dir
cleanup_finished_panes
cleanup_stale_locks
notify_main_changed

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

# Ensure all Resolved/ files have **RESOLVED** header
shopt -s nullglob
for resolved_file in "$RESOLVED_PATH"/Q*.md; do
    first_line=$(head -1 "$resolved_file")
    if [[ "$first_line" != "**RESOLVED**" ]]; then
        printf '%s\n\n' '**RESOLVED**' | cat - "$resolved_file" > "$resolved_file.tmp"
        mv "$resolved_file.tmp" "$resolved_file"
        echo "[review]   Added **RESOLVED** header: $(basename "$resolved_file")"
    fi
done
shopt -u nullglob

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

    # Re-prompt existing agent
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

# If tmux session exists but no terminal is attached, open one
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    if [[ -z "$(tmux list-clients -t "$TMUX_SESSION" 2>/dev/null)" ]]; then
        open_terminal_window
    fi
fi
