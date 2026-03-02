#!/usr/bin/env bash
# launch-agent.sh — Reads prompt file safely and launches claude
# Avoids shell expansion of backticks/special chars in prompt content
#
# Usage: launch-agent.sh <system_prompt_file> <initial_prompt_file> [claude args...]
#   system_prompt_file  — appended to claude's system prompt via --append-system-prompt
#   initial_prompt_file — sent as the first user message via -p (can be empty string to skip)

PROMPT_FILE="$1"; shift
INITIAL_PROMPT_FILE="$1"; shift
PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

# Ensure nvm-managed node is available to the agent (gemini, codex CLIs need it).
# Agent shells may not source ~/.zshrc where nvm is initialized.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95

# Ensure auto-compact is enabled for agents (user may have it disabled globally).
# Directly patch ~/.claude.json instead of running 'claude config set' which
# launches an interactive session.
if command -v jq &>/dev/null && [[ -f ~/.claude.json ]]; then
    jq '.autoCompactEnabled = true' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
fi

# Build the command with optional initial prompt (-p flag)
if [[ -n "$INITIAL_PROMPT_FILE" && -f "$INITIAL_PROMPT_FILE" ]]; then
    INITIAL_CONTENT="$(cat "$INITIAL_PROMPT_FILE")"
    exec claude --append-system-prompt "$PROMPT_CONTENT" -p "$INITIAL_CONTENT" "$@"
else
    exec claude --append-system-prompt "$PROMPT_CONTENT" "$@"
fi
