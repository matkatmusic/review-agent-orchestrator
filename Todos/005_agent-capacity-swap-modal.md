---
id: 005
title: Agent capacity swap modal on issue activation
status: open
created: 2026-04-03T20:54:25-0700
branch: confirm_modal
---

## Idea
When activating an issue (pressing 'f'), if all agent slots are full, show a ConfirmModal-style picker that lists currently active issues. The user selects which active issue to deactivate (status changes to 'In Queue'), freeing a slot for the newly activated issue.

## Context
Building out the TUI for the Review Agent Orchestrator. Currently working on the ConfirmModal system — a generalized confirmation view that takes over the screen with a split layout (confirm box + preview). This TODO extends that pattern to support a selection-based modal for agent capacity management.

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

## Active plan
None

## Dependencies
- ConfirmModal system must be finalized (current branch work)
- May need a new modal variant or extension of ConfirmModal that supports list selection instead of just hotkey confirmation
