#!/usr/bin/env bash
# launch-agent.sh — Reads prompt file safely and launches claude
# Avoids shell expansion of backticks/special chars in prompt content
#
# Usage: launch-agent.sh <prompt_file> [claude args...]

PROMPT_FILE="$1"; shift
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

exec claude --append-system-prompt "$PROMPT_CONTENT" "$@"
