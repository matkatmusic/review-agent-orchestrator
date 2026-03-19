#!/bin/bash
# bootstrap.sh — Fallback script for environments where tasks.json
# runOnFolderOpen doesn't work (VS Code trust prompt not accepted, etc.)
# Usage: bash bootstrap.sh <worktree-name>
set -e
WT_NAME="${1:?Usage: bootstrap.sh <worktree-name>}"
npm install
tmux new-session -A -d -s "${WT_NAME}" 2>/dev/null || true
command -v claude >/dev/null 2>&1 && claude --permission-mode plan || echo "Claude CLI not found"
