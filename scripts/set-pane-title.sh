#!/usr/bin/env bash
# set-pane-title.sh — PostToolUse hook that prefixes pane title with Q number
# Claude Code sets pane titles like "git commit" or "Question Processing".
# This hook prepends the Q number so it reads "Q4 - git commit".

[ -n "$TMUX_PANE" ] || exit 0

BRANCH=$(git branch --show-current 2>/dev/null) || exit 0
Q_NUM=${BRANCH#worktree-}
[ -z "$Q_NUM" ] && exit 0

CURRENT=$(tmux display-message -p -t "$TMUX_PANE" '#{pane_title}' 2>/dev/null) || exit 0

# Strip existing Q prefix to avoid "Q4 - Q4 - ..."
CURRENT="${CURRENT#"$Q_NUM - "}"

tmux select-pane -t "$TMUX_PANE" -T "$Q_NUM - $CURRENT" 2>/dev/null
exit 0
