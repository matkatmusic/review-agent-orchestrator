# DetailView Thread Internalization — Refactor Plan

## Context

DetailView and ThreadView currently render the same component (DetailView) with different props, switched by App.tsx based on ViewType.Detail vs ViewType.Thread on the view stack. The user's design (DetailViewRefactor.txt) calls for DetailView to manage thread navigation internally — entering/exiting threads just swaps the header and response chain within the same component instance. This eliminates ViewType.Thread entirely.

## Files to Modify

1. `src/tui/detail.tsx` — Core: add internal thread stack, enterThread/exitThread methods
2. `src/tui/app.tsx` — Remove Thread case, add threadInfo callback, update Header/Footer props
3. `src/tui/views.ts` — Remove ViewType.Thread enum member, map entry, View union variant
4. `src/tui/header.tsx` — Accept threadInfo prop, update getViewLabel/getSubtitle
5. `src/tui/footer.tsx` — Accept inThread prop, remove Thread shortcuts entry, add separate THREAD_SHORTCUTS
6. `src/tui/detail.test.tsx` — Update thread tests to use keypresses instead of props

## Implementation Steps

### Step 1: detail.tsx — Add internal thread stack

Add ThreadFrame type and ThreadInfo export:

```ts
export interface ThreadInfo {
    inThread: boolean;
}

interface ThreadFrame {
    rootResponse: Response | null;
    threadParent: Response | null;
    flatList: FlatNode[];
    containerHeights: number[];
    selectedMessage: number;
    firstVisibleMessage: number;
    initialScrollDone: boolean;
}
```

Note: ThreadInfo does not include inum — App already knows the inum from the
current view. Keep the interface minimal.

Replace `threadParentStack: Response[]` with:
```ts
private threadStack: ThreadFrame[];
private currentThreadParent: Response | null;
```

Initialize both in constructor (empty array, null).

### Step 2: detail.tsx — Add enterThread/exitThread methods

```
enterThread(parentResponse):
  1. Guard: if (!parentResponse.reply) return;  // no replies = nothing to enter
  2. Save current state (flatList, containerHeights, selectedMessage, etc.) as ThreadFrame, push onto threadStack
  3. Call markRepliesSeen(parentResponse) — moved from app.tsx
  4. Set currentThreadParent = parentResponse
  5. Rebuild flatList from parentResponse.reply
  6. Reset scroll state (selectedMessage = last, initialScrollDone = false)
  7. Call onThreadStateChange({ inThread: true })
  // No forceUpdate() here — the parent App's forceUpdate (triggered by
  // onThreadStateChange) will re-render DetailView as a child.

exitThread():
  1. Pop frame from threadStack
  2. If threadStack is now empty AND rootResponse has changed since we entered:
     re-derive flatList/containerHeights from current this.props.rootResponse
     instead of restoring the stale snapshot. Restore only selectedMessage
     (clamped to new list length) and firstVisibleMessage (re-derived).
  3. Otherwise: restore all state from frame (flatList, containerHeights,
     selectedMessage, firstVisibleMessage, etc.)
  4. Set currentThreadParent = frame.threadParent
  5. Re-derive firstVisibleMessage
  6. Call markRepliesSeen(currentThreadParent) if currentThreadParent exists
  7. Call onThreadStateChange(null) if stack empty, or { inThread: true } if still nested
  // No forceUpdate() here — parent propagation handles it.
```

### Step 3: detail.tsx — Update handleKey

Thread enter: Replace `onNavigate({ type: ViewType.Thread, ... })` with `this.enterThread(selectedNode.response)`. The reply guard is inside enterThread (Step 2), so no guard needed here.

Thread exit: Replace `this.props.onBack?.()` with `this.exitThread()`. Check `this.threadStack.length > 0` instead of `this.props.threadParentResponse`.

Escape: If `threadStack.length > 0`, call `exitThread()`. Otherwise call `onBack()`.

### Step 4: detail.tsx — Update render()

- Change `isThread` derivation: `const isThread = this.currentThreadParent !== null;`
- Thread header: Use `this.currentThreadParent` instead of `this.props.threadParentResponse`
- Recompute block: When `threadStack.length === 0 && rootResponse !== this.lastRootResponse`, recompute flatList/containerHeights from props as before. When `threadStack.length > 0 && rootResponse !== this.lastRootResponse`, save the new rootResponse reference (this.lastRootResponse = rootResponse) but do NOT rebuild flatList — the current thread's flatList is independent of the top-level rootResponse. The staleness is handled on exit (Step 2, exitThread point 2).

### Step 5: detail.tsx — Update props

- Remove `threadParentResponse?: Response`
- Remove `onNavigate?: (view: View) => void`
- Add `onThreadStateChange?: (info: ThreadInfo | null) => void`
- Remove imports of `View`, `ViewType` from views.js (no longer referenced)

### Step 6: views.ts — Remove ViewType.Thread

Do this BEFORE modifying header.tsx and footer.tsx to avoid compile errors
from non-exhaustive switch statements.

- Remove `Thread` from ViewType enum (line 8)
- Remove `[ViewType.Thread, "Thread"]` from ViewTypeStringsMap (line 18)
- Remove `| { type: ViewType.Thread; inum: number; rootResponseId: number }` from View union (line 28)

### Step 7: header.tsx — Accept threadInfo

Add `threadInfo?: ThreadInfo | null` to HeaderProps (import ThreadInfo from detail.js).

Update `getViewLabel(view, threadInfo)`:
- If `threadInfo?.inThread && view.type === ViewType.Detail`: return `I-${view.inum} Thread`
- Remove the `ViewType.Thread` check (line 22)

Update `getSubtitle(view, threadInfo)`:
- In `ViewType.Detail` case: if `threadInfo?.inThread`, return `Thread on I-${view.inum}`
- Remove `case ViewType.Thread:` (lines 40-41)

Pass `threadInfo` through the component to both functions.

### Step 8: footer.tsx — Accept inThread

Add `readonly inThread?: boolean` to FooterProps.

Extract thread shortcuts to a separate constant:
```ts
const THREAD_SHORTCUTS: readonly Shortcut[] = [
    { key: 'Enter', label: 'Send' },
    { key: '↑↓',   label: 'Scroll' },
    { key: 'C-▸',  label: 'Sub-thread' },
    { key: 'Esc',  label: 'Exit thread' },
];
```

Remove `[ViewType.Thread]` entry from VIEW_SHORTCUTS (lines 60-65).

Update FooterComponent: `const shortcuts = inThread ? THREAD_SHORTCUTS : VIEW_SHORTCUTS[viewType];`

### Step 9: app.tsx — Wire it up

Add instance variable: `threadInfo: ThreadInfo | null = null;`

Add handler:
```ts
handleThreadStateChange = (info: ThreadInfo | null) => {
    this.threadInfo = info;
    this.forceUpdate();
};
```

Remove entire ViewType.Thread render case (lines 157-184).

Remove markRepliesSeen logic from navigateToView (lines 81-87).

Update DetailView render in ViewType.Detail case:
- Remove `onNavigate` prop
- Add `onThreadStateChange={this.handleThreadStateChange}`

Update Header render: add `threadInfo={this.threadInfo}`.

Update Footer render: add `inThread={this.threadInfo !== null}`.

Remove imports: `findResponseById`, `markRepliesSeen` from detail.js.

### Step 10: detail.test.tsx — Update thread tests

**Fixture setup**: The existing TEST_ROOT uses buildResponseChain which creates
a flat .response chain with no .reply nodes. Create a new fixture that attaches
replies to one of the response nodes using buildReplyChain. Example:

```ts
const REPLY_MESSAGES = [
    { id: 100, author: AuthorType.Agent, type: ResponseType.Analysis, body: 'Reply 1', timestamp: '...' },
    { id: 101, author: AuthorType.User, type: ResponseType.Comment, body: 'Reply 2', timestamp: '...' },
];
// Attach reply chain to message id=2 in TEST_ROOT
const TEST_ROOT_WITH_REPLIES = cloneResponseChain(TEST_ROOT);
attachReplies(TEST_ROOT_WITH_REPLIES, 2, buildReplyChain(REPLY_MESSAGES));
```

The two existing thread tests (lines 279-291) pass `threadParentResponse` as a prop, which no longer exists. Rewrite them to:
1. Render DetailView with TEST_ROOT_WITH_REPLIES as rootResponse
2. Navigate selection to the message that has replies (id=2)
3. Press Ctrl+Right to enter the thread
4. Assert reply content is visible

Add tests for:
- **No-reply guard**: Press Ctrl+Right on a message with no replies. Assert nothing happens — no crash, no empty thread view, no onThreadStateChange callback fired.
- **exitThread on Escape**: Enter thread, press Escape, assert issue view restored with correct selected message.
- **onThreadStateChange values**: Assert callback receives `{ inThread: true }` on enter, `null` on exit when stack is empty, `{ inThread: true }` when exiting sub-thread back to parent thread.
- **Nested thread**: Ctrl+Right twice (into sub-thread), Escape twice (back to issue view).
- **Data freshness on exit**: Enter thread, re-render with new rootResponse prop (simulating new messages), exit thread, assert main view shows updated data (not stale snapshot).

### Step 11: Clean up exports from detail.tsx

- `markRepliesSeen`: now internal-only, remove from exports (line 523)
- `findResponseById`: no longer used by app.tsx. Keep export only if tests import it directly; otherwise remove.

## Execution Order

1. Steps 1-5 together (detail.tsx changes)
2. Step 6 (views.ts — remove ViewType.Thread FIRST to avoid compile errors)
3. Steps 7-8 (header/footer)
4. Step 9 (app.tsx)
5. Steps 10-11 (tests/cleanup)

Run `npx tsc --noEmit` and `npx vitest run` after completing each group.

## Verification

1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass
3. `node dist/tui/run.js` — TUI launches, navigate to I-1:
   - Select a message with replies, press Ctrl+Right — thread opens, parent message shown at top
   - Select a message without replies, press Ctrl+Right — nothing happens
   - Press Escape — returns to issue detail, same message selected
   - Header shows "Thread" label when in thread, "Detail" when not
   - Footer shows thread shortcuts when in thread, detail shortcuts when not
   - Nested threads work (Ctrl+Right on a reply that has sub-replies)
   - "[# new replies]" badge disappears after entering and exiting a thread
   - New messages that arrive while in a thread are visible after exiting
