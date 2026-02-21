#!/usr/bin/env bash
# config.sh — Configuration for the Question Review system
# Sourced by review-questions-daemon.sh and review-questions.sh

# Maximum concurrent tmux panes (IMPLEMENT agents)
MAX_AGENTS=4

# Tmux session name for agent panes
TMUX_SESSION="q-review"

# Questions directory structure (relative to project root)
QUESTIONS_DIR="Questions"
AWAITING_DIR="$QUESTIONS_DIR/Awaiting"
RESOLVED_DIR="$QUESTIONS_DIR/Resolved"
DEFERRED_DIR="$QUESTIONS_DIR/Deferred"

# Scan interval in seconds (used by daemon)
SCAN_INTERVAL=30
