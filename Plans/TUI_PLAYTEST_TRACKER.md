# TUI Playtest — Issue Tracker

Working document. User plays with the TUI, reports what they want to do, I cross-reference AUDIT.md, identify prerequisites, and document the work needed.

---

## Issue 1: Navigate to Trash view from Home — DONE

**What the user wants:** View trashed issues. Issues can be trashed from Home (x key works), but there's no way to navigate to the Trash view to see them.

**Why:** User was experimenting with Home screen navigation. Trashing an issue works, but the trashed issue disappears with no way to find it again.

**AUDIT.md reference:** Item #1 (Trash View Integration)

**Implementation:**
- Added 't' hotkey to handleGlobalKey in global-keys.tsx
- Added [t] Trash view to all STATUS_SHORTCUTS entries in footer.tsx
- Trash render case was already wired in run.tsx

---

## Issue 2: Esc double-fires in Trash view when modal is open — BUG

**What the user wants:** Pressing Esc while a confirmation modal is shown (delete, empty trash) should dismiss the modal only, not also navigate back to Home.

**Why:** After enabling Trash navigation (Issue 1), Esc was needed for both modal dismiss and view back-navigation. Ink's useInput broadcasts to all handlers — TrashView's internal Esc handler dismisses the modal while handleGlobalKey in run.tsx simultaneously calls goBack.

**AUDIT.md reference:** Item #2 (Global Key Wiring) — the broader problem of global keys conflicting with view-internal keys.

**Prerequisites:**
1. A mechanism for views to signal "I consumed this key, don't let global handler act on it." Ink has no built-in key consumption, so this needs a shared state flag (e.g., `modalOpen` state) or a ref that the global handler checks before acting.

**Specific implementation items:**
- Option A: TrashView exposes a `modalOpen` boolean (via callback or ref) that run.tsx checks before forwarding Esc to handleGlobalKey
- Option B: Add an `onBack` prop to TrashView; TrashView calls it on Esc only when no modal is open. Re-suppress Trash in run.tsx's global handler.
- Option B is more consistent with how DetailView works (Detail has onBack and handles its own Esc internally)

---

## Issue 3: Delete modal lacks issue context — ENHANCEMENT

**What the user wants:** The "Really delete I-10?" modal should show the issue's title and details so the user knows what they're deleting. Currently the modal is a small centered box with just the inum and no other context.

**Current state** (captured from verify-impls tmux session):
```
─────────────── Review Agent Orchestrator - Trash ───────────────
Unread: 2
Trashed issues pending deletion



                  ┌──────────────────────────────────┐
                  │                                  │
                  │       Really delete I-10?        │
                  │                                  │
                  │ [d] Confirm delete  [Esc] Cancel │
                  │                                  │
                  └──────────────────────────────────┘
```

**Why:** User was testing permanent delete from the Trash view. The modal says "Really delete I-10?" but gives no indication of what I-10 is. Dangerous action with insufficient context.

**Proposed design:** Modal in the top 1/3 of the screen with the confirmation prompt and shortcuts. Bottom 2/3 shows the issue (title, description, status, response preview) so the user can verify before confirming.

**AUDIT.md reference:** Not in AUDIT.md — new UX enhancement for Trash view.

**Prerequisites:**
1. Issue data is already available in TrashView (issues prop contains full Issue objects)
2. Need a way to render issue detail preview below the modal

**Specific implementation items:**
- Redesign delete modal layout: top 1/3 confirmation, bottom 2/3 issue preview
- Include issue title in the modal text (e.g., "Really delete I-10: <title>?")
- Render issue body/responses below the modal for full context
- File: `src/tui/trash-view.tsx`

---

## Issue 4: Enqueue hotkey ('e') doesn't work for deferred issues — BUG

**What the user wants:** Select a deferred issue on the Home screen, press 'e' to enqueue it. Nothing happens.

**Why:** User was testing status transitions from the Home screen. The footer shows `[e] Enqueue` for deferred issues but pressing 'e' has no effect.

**AUDIT.md reference:** Item #11 (Mock Backend Wiring) — status mutation callbacks.

**Investigation notes:**
- The 'e' handler exists in home-view.tsx (line 400-412) and the logic looks correct: Deferred → InQueue via `onStatusHotkeyPressed`
- `onStatusHotkeyPressed` is wired to `mockStoreWithUpdater.updateIssueStatusCallback` in run.tsx
- 'e' is NOT in handleGlobalKey, so no interception conflict
- Possible causes to investigate:
  - The selected issue's status might not match what the tab label suggests (stale cursor after status change?)
  - `hasUnresolvedBlockers` might be returning true, causing flashBlockers instead of enqueue
  - The issue list filtering (issues with status !== Trashed) might be causing cursor index mismatch

**Specific implementation items:**
- Reproduce and debug: add `process.stderr.write` logging in the 'e' handler (line 355 has a commented-out debug line)
- Check if `hasUnresolvedBlockers` is incorrectly blocking the transition
- Verify cursor index matches the visible issue after tab filtering

---

## Issue 5: Show response count per issue on Home screen — DESIGN TBD

**What the user wants:** Some indication of how many responses an issue has, visible from the Home screen. User opened I-4 expecting content but found no responses — would have been obvious from the Home list if a count were shown.

**Why:** User navigated to I-4 (payload_encryption_flow) and found it empty. The mock data has zero responses for that issue. If a response count were visible on Home, the user would have known before navigating.

**User uncertainty:** Not sure this should be implemented. The Detail view splits large agent messages into selectable paragraphs (via `splitAgentMessage` / `is_continuation`). It's unclear whether continuations should count as separate responses or be collapsed into one when displaying a count. This ambiguity needs resolving before implementation.

**Next step:** Invoke `/grill-me` to resolve the design question: "What constitutes a countable response?" Options include:
- Count all Response nodes (including continuations) — matches what the user sees in Detail
- Count only non-continuation nodes (`is_continuation === false`) — matches logical messages
- Count only top-level responses (exclude replies in threads)
- Show two numbers (e.g., "3 messages, 12 paragraphs")

**AUDIT.md reference:** Not in AUDIT.md — new feature proposal.

**Prerequisites:**
1. Resolve counting semantics via /grill-me
2. Response data would need to be accessible from Home screen (currently only loaded per-issue in detailData)

**Specific implementation items:** Deferred until design is resolved.

---

## Issue 6: (awaiting user input)

---

## Template

**What the user wants:** [description]

**Why:** [context — what they were doing when they noticed the gap]

**AUDIT.md reference:** [item number and current status]

**Prerequisites:** [what must be done first]

**Specific implementation items:** [concrete tasks]
