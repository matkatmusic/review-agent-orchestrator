#!/usr/bin/env bash
set -euo pipefail

# setup.sh — Initialize Question Review structure in host project
# Run once after adding claude-question-review as a submodule.
#
# Usage: .question-review/setup.sh
#   or:  path/to/submodule/setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Find the project root (the repo that contains this submodule)
PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-superproject-working-tree 2>/dev/null)" || true
if [[ -z "$PROJECT_ROOT" ]]; then
    # Not a submodule — maybe running standalone. Use the git root.
    PROJECT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
fi

# Determine the submodule path relative to project root (macOS-compatible)
SUBMODULE_ABS="$(cd "$SCRIPT_DIR" && pwd)"
SUBMODULE_REL="${SUBMODULE_ABS#"$PROJECT_ROOT"/}"

log() {
    echo "[setup] $*"
}

# ---------- Step 1: Create Questions folder structure ----------

log "Creating Questions folder structure..."
mkdir -p "$PROJECT_ROOT/$AWAITING_DIR"
mkdir -p "$PROJECT_ROOT/$RESOLVED_DIR"
mkdir -p "$PROJECT_ROOT/$DEFERRED_DIR"
touch "$PROJECT_ROOT/$RESOLVED_DIR/.gitkeep"
touch "$PROJECT_ROOT/$DEFERRED_DIR/.gitkeep"
log "  Created: $AWAITING_DIR/, $RESOLVED_DIR/, $DEFERRED_DIR/ (with .gitkeep)"

# ---------- Step 2: Copy template files ----------

log "Copying template files..."
cp -n "$SCRIPT_DIR/templates/agent_question_template.md" "$PROJECT_ROOT/$QUESTIONS_DIR/" 2>/dev/null || true
cp -n "$SCRIPT_DIR/templates/questions_guidelines.md" "$PROJECT_ROOT/$QUESTIONS_DIR/" 2>/dev/null || true
log "  Copied: agent_question_template.md, questions_guidelines.md"

# ---------- Step 3: Merge tasks.json ----------

VSCODE_DIR="$PROJECT_ROOT/.vscode"
TASKS_FILE="$VSCODE_DIR/tasks.json"

log "Configuring VS Code tasks..."
mkdir -p "$VSCODE_DIR"

# Read the snippet and replace ${SUBMODULE_PATH} with actual relative path
SNIPPET=$(sed "s|\${SUBMODULE_PATH}|$SUBMODULE_REL|g" "$SCRIPT_DIR/templates/tasks.json.snippet")

if [[ ! -f "$TASKS_FILE" ]]; then
    # Create new tasks.json with the snippet
    cat > "$TASKS_FILE" << TASKSEOF
{
  "version": "2.0.0",
  "tasks": [
    $SNIPPET
  ]
}
TASKSEOF
    log "  Created: .vscode/tasks.json"
else
    # Check if the daemon task already exists
    if grep -q "Question Review Daemon" "$TASKS_FILE" 2>/dev/null; then
        log "  tasks.json already contains Question Review Daemon — skipping"
    else
        log "  WARNING: .vscode/tasks.json already exists."
        log "  Add this task manually to the 'tasks' array:"
        echo ""
        echo "$SNIPPET"
        echo ""
        log "  Snippet also saved to: $VSCODE_DIR/question-review-task.json.snippet"
        echo "$SNIPPET" > "$VSCODE_DIR/question-review-task.json.snippet"
    fi
fi

# ---------- Step 4: Install .claude/settings.json ----------

CLAUDE_DIR="$PROJECT_ROOT/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

log "Configuring Claude Code permissions..."
mkdir -p "$CLAUDE_DIR"

if [[ ! -f "$SETTINGS_FILE" ]]; then
    cp "$SCRIPT_DIR/templates/settings.json" "$SETTINGS_FILE"
    log "  Created: .claude/settings.json (agent permissions)"
else
    log "  .claude/settings.json already exists — skipping"
    log "  Ensure it includes permissions for: Bash(git *), Bash(ls *), Bash(mv *), Bash(echo *)"
fi

# ---------- Step 5: Make scripts executable ----------

chmod +x "$SCRIPT_DIR/scripts/review-questions-daemon.sh"
chmod +x "$SCRIPT_DIR/scripts/review-questions.sh"
chmod +x "$SCRIPT_DIR/scripts/launch-agent.sh"
log "  Made scripts executable"

# ---------- Done ----------

echo ""
log "Setup complete!"
log ""
log "  Questions folder: $PROJECT_ROOT/$QUESTIONS_DIR/"
log "  Daemon script:    $SUBMODULE_REL/scripts/review-questions-daemon.sh"
log "  VS Code task:     'Question Review Daemon' (runs on folder open)"
log ""
log "  Open this project in VS Code — the daemon will start automatically."
log "  Create question files in $AWAITING_DIR/ to test."
