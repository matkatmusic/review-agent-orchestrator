#!/usr/bin/env bash
# config.sh — Configuration for the Question Review system
# Sourced by review-questions-daemon.sh and review-questions.sh

# Maximum concurrent tmux panes (IMPLEMENT agents)
MAX_AGENTS=2

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
# Options: "Terminal" (macOS default), "iTerm" (iTerm2)
TERMINAL_APP="Terminal"

# Terminal window size (columns x rows)
TERMINAL_COLS=175
TERMINAL_ROWS=98

# Agent prompt file (relative to submodule root)
AGENT_PROMPT="prompts/review-agent.md"
