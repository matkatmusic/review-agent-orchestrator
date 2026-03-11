# Rename 'Unread' column to 'Info' + Add Hint Row + 'b' Flash

All changes in `src/tui/home-view.tsx` and `src/tui/home-view.test.tsx`.

## Coding style (TUI_REWRITE_REQUIREMENTS.txt)

Conform to coding styles defined in the AP-0xx clauses in TUI_REWRITE_REQUIREMENTS.txt

---
When selecting an issue that blocks other issues, make all non-blocked issues' title text dim and Do not flash the blocked issue; just show 'Blocks ->' before the blocked issue's title.

## Phase 1 — RED: Write failing tests

Add to `home-view.test.tsx`:

### Test A: header shows 'Info' column (not 'Unread')
- Render HomeView, strip ANSI, check header row contains 'Info'
- (Existing tests implicitly depend on 'Unread' — none assert it explicitly)

### Test B: hint row with legend text
- Render HomeView, strip ANSI, check output contains the legend string:
  `'*' unread  'b' blocking  'i' needs input`

### Test C: 'b' indicator appears for issues that block others
- Use `MOCK_ISSUES_WITH_BLOCKERS` (already exists in test file)
- I-1 blocks I-3 and I-4 (appears in their blocked_by), so I-1's row should contain 'b'
- I-2 blocks I-5, so I-2's row should contain 'b'
- I-8 (Resolved) blocks nothing — no 'b'

### Test D: 'b' flashes when I-6 (blocked) is selected
- Navigate cursor to I-6 (has `blocked_by: [3, 5]`)
- After selection, I-3 and I-5 rows should show the 'b' flash
- Verify via the `flashingBlockerInums` effect: on initial flash tick, 'b' visible; confirm I-1 row does NOT flash its 'b'

### Test E: 'b' flash stops when cursor leaves blocked issue
- Navigate to I-6 (flash starts on I-3, I-5)
- Navigate away (down to I-7)
- I-3 and I-5 rows should no longer flash 'b'

---

## Phase 2 — GREEN: Implement features

### 2a: Rename column
- `COL.unread` → `COL.info`
- Header: `'Unread'` → `'Info'`
- Update titleWidth calc and comment

### 2b: Add hint row
- After header `<Box>`, add dimmed row: `Info: '*' unread  'b' blocking  'i' needs input`

### 2c: Rename UnreadMarker → InfoMarker
- Props: `{ unread: boolean; blocking: boolean; blockingFlash: boolean; needsInput: boolean; }`
- Display 3 fixed positions: `*` | `b` | `i` (space if inactive)
- `b` when `blockingFlash=true`: alternate visible/hidden via flash timer
- `b` when `blocking=true, blockingFlash=false`: steady display

### 2d: Compute blockingInums
- Before return, build `blockingInums: Set<number>` — issues whose inum appears in another issue's `blocked_by` and are not Resolved

### 2e: Auto-flash on selection
- When cursor moves to an issue with unresolved blockers, auto-populate `flashingBlockerInums`
- When cursor moves to an issue without unresolved blockers, clear `flashingBlockerInums`
- The `blockingFlash` prop = `flashingBlockerInums.has(issue.inum) && flashOn`

### 2f: Update issue row rendering
- Replace `<UnreadMarker>` with `<InfoMarker>` passing new props

---

## Phase 3 — REFACTOR

Remove dead code: delete the old `UnreadMarkerProps` interface and `UnreadMarker` function after `InfoMarker` replaces them. Verify no other file imports `UnreadMarker`.

---

## Manual testing checklist

Run `npm run build && node dist/tui/run.js` and verify:

1. **Header column**: the column that used to say "Unread" now says "Info"
2. **Hint row**: a dimmed legend row appears below the header: `Info: '*' unread  'b' blocking  'i' needs input`
3. **'*' indicator**: issues I-3 and I-6 (unread) still show `*` in the Info column
4. **'b' indicator (steady)**: issues I-1 and I-2 show a steady `b` in the Info column (they block other issues)
5. **'b' flash on selection**: arrow down to I-6 (Blocked) — the `b` on I-3 and I-5 should start flashing (blinking on/off at ~500ms)
6. **Flash stops on leave**: arrow down from I-6 to I-7 — the `b` flash on I-3 and I-5 stops
7. **Title arrows still work**: while on I-6, press 'e' or 'b' — the `>title<` arrow flash on blocker rows still works alongside the `b` flash
8. **Non-blocker rows clean**: issues with no blocking relationship (e.g. I-7, I-8) show no `b` in the Info column
