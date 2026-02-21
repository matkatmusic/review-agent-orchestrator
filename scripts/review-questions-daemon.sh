#!/usr/bin/env bash
set -euo pipefail

# review-questions-daemon.sh — Background loop that scans for pending questions
# Launched automatically by VS Code on workspace open (.vscode/tasks.json)
# Killed automatically when VS Code closes (terminal process dies)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

# Find the project root
PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-superproject-working-tree 2>/dev/null)" || true
if [[ -z "$PROJECT_ROOT" ]]; then
    PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
fi

# ---------- Self-healing: run setup if Questions/ doesn't exist ----------

if [[ ! -d "$PROJECT_ROOT/$QUESTIONS_DIR" ]]; then
    echo "[daemon] Questions folder not found. Running setup..."
    "$SCRIPT_DIR/../setup.sh"
    echo ""
fi

# ---------- Create tmux session and open visible window ----------

if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    # Create session with the initial pane showing a status message (not a bare shell)
    tmux new-session -d -s "$TMUX_SESSION" -x "$TERMINAL_COLS" -y "$TERMINAL_ROWS" \
        "echo '=== Question Review System ==='; echo 'Agent panes will appear here as questions are processed.'; echo 'This pane closes when all agents are done.'; echo ''; watch -n 5 'ls $PROJECT_ROOT/.question-review-locks/*.lock 2>/dev/null | while read f; do q=\$(basename \$f .lock); echo \"\$q: active\"; done; echo \"---\"; echo \"Awaiting: \$(ls $PROJECT_ROOT/$AWAITING_DIR/Q*.md 2>/dev/null | wc -l | tr -d \" \") questions\"'"
    echo "[daemon] Created tmux session: $TMUX_SESSION"

    # Open a terminal window attached to the session so the user can see agent panes
    if [[ "$TERMINAL_APP" == "iTerm" ]]; then
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
    echo "[daemon] Opened $TERMINAL_APP window attached to tmux session '$TMUX_SESSION'"
else
    echo "[daemon] Tmux session '$TMUX_SESSION' already exists."
fi

# ---------- Main loop ----------

echo "[daemon] Started. Scanning $AWAITING_DIR/ every ${SCAN_INTERVAL}s."
echo "[daemon] Tmux session: $TMUX_SESSION"
echo "[daemon] Max agents: $MAX_AGENTS"
echo "[daemon] Press Ctrl+C to stop."
echo ""

while true; do
    "$SCRIPT_DIR/review-questions.sh" "$PROJECT_ROOT" 2>&1 || true
    sleep "$SCAN_INTERVAL"
done
