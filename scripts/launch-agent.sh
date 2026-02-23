#!/usr/bin/env bash
# launch-agent.sh — Reads prompt file safely and launches claude
# Avoids shell expansion of backticks/special chars in prompt content
#
# Usage: launch-agent.sh <prompt_file> [claude args...]

PROMPT_FILE="$1"; shift
PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80

exec claude --append-system-prompt "$PROMPT_CONTENT" "$@"
