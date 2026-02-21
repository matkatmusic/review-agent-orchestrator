#!/usr/bin/env bash
set -euo pipefail

# review-questions.sh — Scan Questions/Awaiting/ and spawn agents for pending responses
# Called every N seconds by review-questions-daemon.sh
#
# Usage: review-questions.sh <project_root>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

PROJECT_ROOT="${1:?Usage: review-questions.sh <project_root>}"
AWAITING_PATH="$PROJECT_ROOT/$AWAITING_DIR"

# ---------- Helper functions ----------

# Check if the last substantive block in a question file is a <user_response>
# with non-empty <text> content.
has_pending_user_response() {
    local file="$1"

    # Strategy: find the last <user_response><text>...</text></user_response> block
    # and check if the <text> content is non-empty (not just whitespace).
    #
    # We check that:
    # 1. The file contains at least one <user_response> block
    # 2. The LAST such block has non-empty <text>
    # 3. There is no <response_ block after the last <user_response>

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
    # Extract text between the last <user_response> and its closing </user_response>
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

# Count active agent panes in the tmux session
count_agent_panes() {
    if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        echo 0
        return
    fi
    # Count panes with titles starting with "Q" (agent panes)
    # Exclude the default first pane
    local count
    count=$(tmux list-panes -t "$TMUX_SESSION" -F '#{pane_title}' 2>/dev/null \
        | grep -cE '^Q[0-9]+' || true)
    echo "$count"
}

# Check if a specific Q number has an active pane
has_active_pane() {
    local q_num="$1"
    if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        return 1
    fi
    tmux list-panes -t "$TMUX_SESSION" -F '#{pane_title}' 2>/dev/null \
        | grep -qE "^${q_num}$"
}

# Spawn a tmux pane for a question
spawn_agent_pane() {
    local q_num="$1"
    local question_file="$2"

    # Phase 1: bare claude --worktree, no prompt
    # Phase 2 will add: --permission-mode acceptEdits --allowedTools "..." 'prompt...'
    tmux split-window -t "$TMUX_SESSION" \
        -c "$PROJECT_ROOT" \
        "claude --worktree $q_num"

    # Set pane title for dedup tracking
    tmux select-pane -t "$TMUX_SESSION" -T "$q_num"

    # Rebalance layout
    tmux select-layout -t "$TMUX_SESSION" tiled

    echo "[review]   Spawned agent pane: $q_num"
}

# ---------- Ensure tmux session exists ----------

if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    tmux new-session -d -s "$TMUX_SESSION" -x 200 -y 50 2>/dev/null || true
fi

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

spawned=0
skipped_active=0
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

    # Check for active pane
    if has_active_pane "$q_num"; then
        skipped_active=$((skipped_active + 1))
        continue
    fi

    # Check MAX_AGENTS
    active=$(count_agent_panes)
    if [[ "$active" -ge "$MAX_AGENTS" ]]; then
        skipped_max=$((skipped_max + 1))
        echo "[review]   $q_num queued (max $MAX_AGENTS agents active)"
        continue
    fi

    # Spawn agent
    spawn_agent_pane "$q_num" "$file"
    spawned=$((spawned + 1))
done

# Only log if something happened
if [[ $spawned -gt 0 || $skipped_max -gt 0 ]]; then
    echo "[review] Scan complete: $spawned spawned, $skipped_active active, $skipped_max queued, $skipped_no_response no response"
fi
