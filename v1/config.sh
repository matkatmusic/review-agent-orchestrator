#!/usr/bin/env bash
# config.sh — Configuration for the Question Review system
# Sourced by review-questions-daemon.sh and review-questions.sh

# Maximum concurrent tmux panes (IMPLEMENT agents)
MAX_AGENTS=6

# Tmux session name for agent panes
TMUX_SESSION="q-review"

# Questions directory structure (relative to project root)
QUESTIONS_DIR="Questions"
AWAITING_DIR="$QUESTIONS_DIR/Awaiting"
RESOLVED_DIR="$QUESTIONS_DIR/Resolved"
DEFERRED_DIR="$QUESTIONS_DIR/Deferred"

# Scan interval in seconds (used by daemon)
SCAN_INTERVAL=10

# Terminal app to open for the tmux session
# Options: "Antigravity" (VS Code), "Terminal" (macOS default), "iTerm" (iTerm2)
TERMINAL_APP="Antigravity"

# Terminal window size (columns x rows)
TERMINAL_COLS=175
TERMINAL_ROWS=98

# Agent prompt file (relative to submodule root)
AGENT_PROMPT="prompts/review-agent.md"

# Code root (optional) — absolute or relative to PROJECT_ROOT.
# When set, worktrees are created in this repo instead of PROJECT_ROOT.
# Use when the code being edited lives in a submodule or separate repo from
# the Questions directory. Leave empty to use PROJECT_ROOT (default).
# Can be overridden per-project via config.local.sh (gitignored).
CODE_ROOT=""

# Source project-local overrides if present (e.g., CODE_ROOT for this project)
SCRIPT_DIR_CONFIG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR_CONFIG/config.local.sh" ]]; then
    source "$SCRIPT_DIR_CONFIG/config.local.sh"
fi
