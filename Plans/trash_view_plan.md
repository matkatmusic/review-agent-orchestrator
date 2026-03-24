# Trash View Implementation (Steps 1.5b + 1.5c)

## Context

The TUI rewrite needs a Trash View to display trashed issues and provide restore/delete operations. Step 1.5a (trash hotkey on Home) is done. This plan implements Step 1.5b (Trash View component) and Step 1.5c (footer hotkeys: restore, permanent delete, empty trash). The Trash View will be temporarily set as the default launch screen for debugging.

Three new mock-data issues are needed to populate the view for testing, with specific blocking relationships and trash ages (4d, 5d, 8d).

## Execution Order

### Part 1: Foundational type changes

**1a. Add IssueStatus.Inactive to enum**

File: `src/types.ts`
- Add `Inactive = 6` to IssueStatus enum
- Add `[IssueStatus.Inactive, "Inactive"]` to IssueStatusStringsMap

File: `src/tui/status-color.ts`
- Add `case IssueStatus.Inactive: return 'gray';` to statusToColor

File: `src/tui/footer.tsx`
- Add STATUS_SHORTCUTS entry for Inactive: `[{ key: 'f', label: 'Activate' }, { key: 'e', label: 'Enqueue' }, { key: 'x', label: 'Trash' }, { key: 'q', label: 'Quit' }]`

File: `src/tui/status-utils.ts`
- No changes needed -- getStatus already handles any stored status

**1b. Add ViewType.Trash**

File: `src/tui/views.ts`
- Add `Trash` to ViewType enum (after IssuePicker)
- Add `[ViewType.Trash, "Trash"]` to ViewTypeStringsMap
- Add `| { type: ViewType.Trash }` to View union

File: `src/tui/header.tsx`
- Add `case ViewType.Trash: return 'Trashed issues pending deletion';` to getSubtitle switch

File: `src/tui/footer.tsx`
- Add VIEW_SHORTCUTS entry:
  ```
  [ViewType.Trash]: [
      { key: 'r', label: 'Restore' },
      { key: 'd', label: 'Delete' },
      { key: 'e', label: 'Empty trash' },
      { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Navigate' },
      { key: 'Esc', label: 'Back' },
      { key: 'q', label: 'Quit' },
  ]
  ```
- Add two new confirmation shortcut arrays (exported):
  ```
  CONFIRM_DELETE_SHORTCUTS: [{ key: 'd', label: 'Confirm delete' }, { key: 'Esc', label: 'Cancel' }]
  CONFIRM_EMPTY_SHORTCUTS: [{ key: 'e', label: 'Confirm empty trash' }, { key: 'Esc', label: 'Cancel' }]
  ```

File: `src/tui/footer.test.tsx`
- Add `ViewType.Trash` to `allViews` array (line 24)
- Add `ViewType.Trash` to `nonDetailViews` array (line 257)

File: `src/tui/header.test.tsx`
- Add test: "line 3 shows trash subtitle for Trash view"

### Part 2: Mock data

File: `data/mock-data.default.json`

Add 3 trashed issues (dates based on today = 2026-03-09):

| inum | title | blocked_by | trashed_at | days old |
|------|-------|-----------|------------|----------|
| 9 | trashed_blocked_by_five | [5] | 2026-03-05T00:00:00Z | 4d |
| 10 | trashed_blocks_four | [] | 2026-03-04T00:00:00Z | 5d |
| 11 | trashed_standalone | [] | 2026-03-01T00:00:00Z | 8d |

Also update I-4's `blocked_by` from `[1]` to `[1, 10]` (issue B blocks I-4).

All issues get `status: 5` (Trashed). Created dates in Feb 2026. No new responses needed.

### Part 3: Stub + failing tests (TDD RED)

File: `src/tui/trash-view.tsx` (NEW -- stub)
- Export TrashViewProps interface and TrashView component returning `<Box><Text>STUB</Text></Box>`
- Props: `issues, terminalProps, layoutProps, setFooterShortcuts?, setHeaderSubtitleOverride?, onRestoreIssue?, onPermanentDelete?, onEmptyTrash?`

File: `src/tui/trash-view.test.tsx` (NEW)

Tests to write (all should fail against stub):

Rendering:
- "renders issue titles in the list"
- "renders inum identifiers (I-N format)"
- "renders Days column showing days since trashed" (mock Date.now via vi.spyOn)
- "renders empty state 'Trash is empty.' when no trashed issues"
- "does not show Unread or Status columns"
- "renders column header row with ID, Title, Days"

Cursor navigation:
- "selected row shows caret indicator"
- "initial cursor is on first issue"
- "down arrow moves cursor to next item"
- "up arrow moves cursor to previous item"
- "cursor clamps at boundaries"

### Part 4: Implement trash-view.tsx (TDD GREEN)

File: `src/tui/trash-view.tsx`

Follow HomeView pattern. Column layout:
```
COL = { cursor: 2, id: 5, days: 8 }
titleWidth = columns - cursor - id - days - 4 separators
```

Reuse same local helper pattern as home-view.tsx: center(), SelectionCaret, IssueNum, Title (copied locally -- shared extraction deferred to later refactor).

New local sub-component: `Days` -- renders centered days-ago string.

Days computation: `Math.floor((Date.now() - new Date(trashed_at).getTime()) / 86400000) + 'd'`

useInput for Up/Down arrow cursor navigation.

Empty state: `<Text dimColor>  Trash is empty.</Text>`

### Part 5: use-mock-store callbacks

File: `src/tui/use-mock-store.ts`

Add to MockStoreWithUpdater interface:
- `restoreIssueCallback: (inum: number) => void`
- `permanentDeleteCallback: (inum: number) => void`
- `emptyTrashCallback: () => void`

**restoreIssueCallback(inum):**
- Set `status: IssueStatus.Inactive`, `trashed_at: null`
- Sync detailData, save

**permanentDeleteCallback(inum):**
- Filter issue out of `issues[]`
- Remove inum from all other issues' `blocked_by[]` arrays
- Delete from `detailData`, `unreadInums`
- Save

**emptyTrashCallback():**
- Collect all Trashed inums
- Filter them out of `issues[]`
- Clean their inums from all remaining issues' `blocked_by[]`
- Clean from `detailData`, `unreadInums`
- Save

### Part 6: Footer hotkey tests + implementation (TDD RED then GREEN)

File: `src/tui/trash-view.test.tsx` (append)

Footer shortcuts:
- "calls setFooterShortcuts with Trash view shortcuts on mount"
- "calls setFooterShortcuts with confirm delete shortcuts when 'd' pressed"
- "calls setFooterShortcuts with confirm empty shortcuts when 'e' pressed"
- "restores Trash view shortcuts after Esc cancels"

Restore:
- "'r' calls onRestoreIssue with selected issue inum"
- "'r' after navigating calls with correct inum"
- "'r' on empty list does not crash"

Delete confirmation (two-press, same pattern as HomeView trash):
- "'d' once enters confirm state (does not call onPermanentDelete)"
- "'d' 'd' calls onPermanentDelete with selected inum"
- "'d' then Esc cancels"
- "confirm state highlights selected row red"

Empty trash confirmation:
- "'e' once enters confirm state (does not call onEmptyTrash)"
- "'e' 'e' calls onEmptyTrash"
- "'e' then Esc cancels"

Header subtitle override:
- "sets subtitle override during delete confirmation"
- "sets subtitle override during empty trash confirmation"
- "clears subtitle override after cancellation"

Implementation in trash-view.tsx:
- Two confirmation state machines: `confirmDeleteInum` (number|null) and `confirmEmptyTrash` (boolean)
- useEffect updates setFooterShortcuts and setHeaderSubtitleOverride based on confirmation state
- useInput handler with priority: confirmDelete > confirmEmpty > normal keys

### Part 7: Wire into run.tsx (temporary default)

File: `src/tui/run.tsx`
- Add dynamic import for TrashView
- Change `currentView` from `{ type: ViewType.Home }` to `{ type: ViewType.Trash }`
- Replace HomeView child render with TrashView, passing:
  - `issues={...issues.filter(i => i.status === IssueStatus.Trashed)}`
  - `onRestoreIssue={mockStoreWithUpdater.restoreIssueCallback}`
  - `onPermanentDelete={mockStoreWithUpdater.permanentDeleteCallback}`
  - `onEmptyTrash={mockStoreWithUpdater.emptyTrashCallback}`
- Mark with `// TEMPORARY: revert to Home when Trash debugging is done`

File: `src/tui/run.test.tsx`
- Update tests that check for "Home" header content to expect "Trash" instead
- Mark with `// TEMPORARY` comments

## Files changed summary

| File | Change |
|------|--------|
| `src/types.ts` | Add IssueStatus.Inactive = 6, IssueStatusStringsMap entry |
| `src/tui/status-color.ts` | Add Inactive → 'gray' |
| `src/tui/views.ts` | Add ViewType.Trash, View union, ViewTypeStringsMap |
| `src/tui/header.tsx` | Add Trash case to getSubtitle |
| `src/tui/header.test.tsx` | Add Trash subtitle test |
| `src/tui/footer.tsx` | Add VIEW_SHORTCUTS[Trash], STATUS_SHORTCUTS[Inactive], CONFIRM_DELETE_SHORTCUTS, CONFIRM_EMPTY_SHORTCUTS |
| `src/tui/footer.test.tsx` | Add Trash to allViews + nonDetailViews arrays |
| `data/mock-data.default.json` | Add 3 trashed issues (inum 9,10,11), update I-4 blocked_by |
| `src/tui/trash-view.tsx` | NEW -- Trash View component |
| `src/tui/trash-view.test.tsx` | NEW -- ~25 tests |
| `src/tui/use-mock-store.ts` | Add restoreIssueCallback, permanentDeleteCallback, emptyTrashCallback |
| `src/tui/run.tsx` | Import TrashView, temporarily swap default view to Trash |
| `src/tui/run.test.tsx` | Update expectations for temporary Trash default |

## Key patterns to reuse

- Column rendering helpers from `src/tui/home-view.tsx`: center(), bracketCenter(), SelectionCaret, IssueNum, Title
- Two-press confirmation state machine from `src/tui/home-view.tsx` (confirmTrashInum pattern)
- setFooterShortcuts/setHeaderSubtitleOverride callback pattern from HomeView
- Test helpers from `src/tui/home-view.test.tsx`: makeIssue(), tick(), settle(), cursorLine()
- Mock Date.now via `vi.spyOn(Date, 'now')` for deterministic Days column tests

## Verification

1. `npx vitest run` -- all existing + new tests pass
2. `npm run build` -- TypeScript compiles clean
3. `node dist/tui/run.js --resetMockData` -- visual smoke test:
   - Trash view shows as default screen
   - 3 trashed issues visible with correct Days values (4d, 5d, 8d)
   - Up/Down navigation works
   - 'r' restores an issue (disappears from list)
   - 'd' 'd' permanently deletes an issue
   - 'e' 'e' empties all trash
   - 'q' quits
