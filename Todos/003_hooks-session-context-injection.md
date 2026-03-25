---
id: 003
title: Investigate hook matchers for session context injection
status: open
created: 2026-03-25T09:35:00-0700
branch: tui-rewrite
---

## Idea
Investigate which hook matchers can inject specific context when launching a Claude Code session. Goal: configure worktree agents to receive targeted initial context via the hooks system.
Reference: https://code.claude.com/docs/en/hooks-guide#re-inject-context-after-compaction

## Context
Building a review-agent-orchestrator TUI that spawns worktree agents. Need to understand how hooks (PreToolUse, PostToolUse, Notification, SessionStart, etc.) can inject context so spawned agents start with the right information rather than discovering it from scratch.

## Recent commits
- c24dea8 you can now navigate to the Trash view, added playtest tracker
- 6f24cec wire all view render cases, global key navigation, and onSend
- b90f694 [claude] added entering detail view for an issue from home screen
- accc7da Audited all plans, installed Matt Popock Skills repo
- 1ee8c08 installed the Worktree: Pick Repo tool from the submodule

## Uncommitted files
- .worktrees/ (untracked)

## Active plan
None

## Dependencies
- Understanding of Claude Code hooks system and matcher syntax
- Knowledge of which hook events fire during agent/worktree session startup
