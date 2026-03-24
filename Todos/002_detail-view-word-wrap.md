---
id: 002
title: Detail View response word-wrapping
status: open
created: 2026-03-20T12:00:00-05:00
branch: tui-rewrite
---

## Idea
When words in a response extend past the right edge of the response container and are wrapped to the next line, the word is split at the container boundary. Instead, rendered responses in the Detail View should use word-wrapping so that long words wrap to the next line as a whole unit rather than being split mid-word.

## Context
Working on the TUI rewrite (tui-rewrite branch). Just wired up Home-to-Detail navigation in run.tsx so the Detail View is now reachable. This is a visual/UX issue in how response text is rendered inside ResponseContainer in the Detail View.

## Recent commits
- 4dc06fe updated WTSU submodule
- da88c86 added a dummy task
- 5be942c deleted old worktree spawning tasks
- 8f6ef2a Merge branch 'spawn-worktree-node-app' into tui-rewrite
- 268be2a Merge branch 'remove-old-worktree-app-approach' into spawn-worktree-node-app

## Uncommitted files
- .vscode/tasks.json
- TODO.md
- src/tui/home-view.tsx
- src/tui/run.tsx

## Active plan
None

## Dependencies
Likely involves src/tui/response-container.tsx and possibly src/tui/paragraph-utils.ts (which already has text-wrapping utilities). Check whether Ink's Text component or Box component has a word-wrap mode, or whether paragraph-utils needs to handle word-boundary wrapping.
