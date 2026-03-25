---
id: 004
title: Auto-invoke skills on session start
status: open
created: 2026-03-25T09:40:00-0700
branch: tui-rewrite
---

## Idea
Investigate whether SessionStart hooks (or similar mechanism) can automatically invoke skills like /context-mode when a Claude Code session loads. Goal: eliminate manual skill invocation at the start of every session.

## Context
Working on review-agent-orchestrator TUI. Related to TODO 003 (hook matchers for context injection). This TODO focuses specifically on skill auto-invocation rather than context injection. The /context-mode skill is the primary target for auto-loading.

## Recent commits
- c24dea8 you can now navigate to the Trash view, added playtest tracker
- 6f24cec wire all view render cases, global key navigation, and onSend
- b90f694 [claude] added entering detail view for an issue from home screen
- accc7da Audited all plans, installed Matt Popock Skills repo
- 1ee8c08 installed the Worktree: Pick Repo tool from the submodule

## Uncommitted files
- .worktrees/ (untracked)
- Todos/003_hooks-session-context-injection.md (untracked)

## Active plan
None

## Dependencies
- TODO 003 findings (hook matcher investigation)
- Understanding of whether skills can be triggered programmatically vs only via user input
