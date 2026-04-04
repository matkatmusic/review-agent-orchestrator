---
id: 006
title: Define status transition rules and align footer hotkeys
status: open
created: 2026-04-03T22:55:39-0500
branch: confirm_modal
---

## Idea
Define a formal state machine for issue statuses — which statuses can transition to which other statuses. Then make the footer row's hotkeys for each status only show transitions that are valid from that status. Currently STATUS_SHORTCUTS in footer.tsx is manually maintained and may not match the actual allowed transitions in the hotkey handlers (home-view.tsx).

## Context
Building the TUI for the Review Agent Orchestrator. The Home view shows status-dependent footer shortcuts (e.g., Active shows [d] Defer, [r] Resolve; Deferred shows [e] Enqueue, [r] Resolve). These are currently defined as static arrays in footer.tsx (STATUS_SHORTCUTS) without a formal transition map. The hotkey handlers in home-view.tsx independently decide which transitions are valid. These two sources of truth should be unified.

## Recent commits
33d452a Add generalized ConfirmModal view, 4-row footer with Hotkeys separator
be9dd0b updated with code changes
7f7fc33 updated submodule
7f83370 updated with code changes
a206b6e added worktree convo from deleted worktree

## Uncommitted files
 M Prompts.txt
 M data/mock-data.json
 M src/tui/app-shell.tsx
 M src/tui/confirm-modal.tsx
 M src/tui/header.tsx
 M src/tui/home-view.test.tsx
 M src/tui/home-view.tsx
 M src/tui/run.tsx
 M src/tui/trash-view.test.tsx
 M src/tui/trash-view.tsx
 M src/tui/views.ts
?? Todos/005_agent-capacity-swap-modal.md

## Active plan
None

## Dependencies
- Should be done before adding new status transitions or hotkeys
- Related to footer.tsx STATUS_SHORTCUTS and home-view.tsx hotkey handlers
- May interact with TODO 005 (agent capacity swap modal) since activation is a status transition
