---
id: 001
title: Extract view lookup in run.tsx to a function
status: open
created: 2026-03-20T11:45:00-07:00
branch: tui-rewrite
---

## Idea
Refactor `run.tsx` lines 93-102 to extract the view object lookup into a dedicated function. The function should accept `currentView` as a parameter and return the corresponding view object to display. This replaces the inline logic with a clean, testable function call.

Goal: make the TSX code easier to read, understand, test.  no new functionality.

## Context
Working on the worktree-spawn-util submodule inside the review-agent-orchestrator project. Current session focused on extracting CLI flags to shared constants and adding JSONC usage comments to tasks.json. This TODO is a non-blocking improvement for a different file in the broader project.

## Recent commits
- 2dd81b7 updated package-lock.json
- a299a60 Add automatic Node project setup (npm install + build) for new worktrees
- fa95d7a Add submodule detection and parent repo task injection
- 2873a2e Add conditional cleanup, Logger class, E2E tests, and conversation rename
- f6819e1 flattened file paths

## Uncommitted files
- .vscode/tasks.json
- src/cli/daemon.ts
- src/cli/heartbeat.ts
- src/cli/install-parent-task.ts
- src/cli/pick-repo.ts
- src/daemon-client.ts
- src/cli-flags.ts (new)

## Active plan
.claude/plans/happy-noodling-rainbow.md (JSONC comment injection into parent tasks.json)

## Dependencies
- Locate `run.tsx` in the broader project (not found in worktree-spawn-util itself)
- Understand the view object structure and what `currentView` maps to
