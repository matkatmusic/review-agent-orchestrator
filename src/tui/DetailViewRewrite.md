# DetailView Rewrite Plan

Supersedes DetailViewRefactor.md. Combines three goals:
1. Simplify message list building (just Response[], no FlatNode/parallel arrays)
2. Decompose into sub-components per DetailViewRefactor.txt
3. Internalize thread navigation (eliminate ViewType.Thread)

## Core Design

DetailView becomes a thin orchestrator that composes three sub-components:

    DetailView (orchestrator)
    ├── IssueHeader         — title, status, group, deps (or thread parent)
    ├── ResponseChain       — scrollable message list with virtual scrolling
    └── InputBox            — text input for composing messages

DetailView owns:
- Thread stack (enter/exit thread)
- Keyboard dispatch (routes keys to the right sub-component)
- Overlay state (group picker, blocked-by picker, blocks picker)

ResponseChain owns:
- The flat Response[] array
- Scroll position (selectedMessage, firstVisibleMessage)
- Height computation and viewport windowing
- "hasNewReplies" is computed per-item by ResponseContainer, not during flattening

## Data Model

The Response linked list stays as-is. The key simplification: the flat array
is just Response[], not FlatNode[]. No parallel arrays.

    // This is all ResponseChain needs:
    messages: Response[]        // flat walk of .response chain
    selectedIndex: number       // which message is selected
    firstVisibleIndex: number   // viewport start (derived from selectedIndex)

Height computation happens lazily inside the viewport calculation, not as a
pre-computed parallel array.

## Files

New files:
- src/tui/issue-header.tsx     — IssueHeader component
- src/tui/response-chain.tsx   — ResponseChain component (virtual scrolling)
- src/tui/input-box.tsx        — InputBox component

Modified files:
- src/tui/detail.tsx           — rewritten as orchestrator
- src/tui/response-container.tsx — compute hasNewReplies from own props
- src/tui/app.tsx              — remove ViewType.Thread, add threadInfo
- src/tui/views.ts             — remove ViewType.Thread
- src/tui/header.tsx           — accept threadInfo prop
- src/tui/footer.tsx           — accept inThread prop
- src/tui/detail.test.tsx      — rewrite for new structure

## Implementation Steps

### Phase 1: Extract sub-components (no behavior change)

#### Step 1.1: Create IssueHeader

Extract the header-building block (current detail.tsx lines 436-469) into its
own component. Pure rendering, no state.

```ts
// src/tui/issue-header.tsx
interface IssueHeaderProps {
    inum: number;
    issue: Issue;
    group: string;
    blockedByStr: string;
    blocksStr: string;
    columns: number;
    focusedField: number | null;
    // Thread mode:
    threadParent: Response | null;  // non-null = show thread header instead
}
```

IssueHeader renders the 5-line issue metadata header in normal mode, or the
thread parent ResponseContainer in thread mode. It reports its line count
via a simple getter or by counting the elements it renders.

The line count is a pure function of the props:
- Thread mode: computeLineCount(threadParent.content.body, columns)
- Normal mode: always 5 (title, status, deps, hint, separator)

#### Step 1.2: Create InputBox

Extract the input area (current detail.tsx lines 506-516) into its own
component.

```ts
// src/tui/input-box.tsx
interface InputBoxProps {
    value: string;
    focused: boolean;
    columns: number;
    inThread: boolean;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
}
```

Renders: separator line, label ("Enter response: >"), TextInput.
Always 3 lines (INPUT_AREA_LINES constant exported from here).

#### Step 1.3: Create ResponseChain

Extract the scrollable message list and all scroll math into its own
component. This is the biggest extraction.

```ts
// src/tui/response-chain.tsx
interface ResponseChainProps {
    rootResponse: Response | null;
    columns: number;
    height: number;                    // available viewport height
    userLastViewedAt: string | null;
    selectedIndex: number;
    onSelectedIndexChange: (index: number) => void;
}
```

ResponseChain:
1. Walks rootResponse.response chain to build a flat Response[] (just
   pointers, no metadata wrapper)
2. Computes heights lazily during viewport derivation:

```ts
function computeHeight(response: Response, columns: number): number {
    return ResponseContainer.computeLineCount(response.content.body, columns);
}
```

3. Derives firstVisibleIndex from selectedIndex + heights (same algorithm as
   current deriveFirstVisible/computeLastVisible, but using on-the-fly height
   computation instead of a parallel array)
4. Renders visible ResponseContainers

The "hasNewReplies" prop for each ResponseContainer is computed inline:

```ts
const hasNew = userLastViewedAt !== null && checkNewReplies(response, userLastViewedAt);
```

This removes FlatNode entirely. checkNewReplies stays as a standalone function
(moved into response-chain.tsx or a shared utils file).

Selection state (selectedIndex) is owned by the parent (DetailView) because
the parent needs it for enterThread (to know which message was selected).
ResponseChain receives it as a prop and calls onSelectedIndexChange when
up/down arrows are pressed.

#### Step 1.4: Update DetailView to compose sub-components

DetailView's render() becomes:

```tsx
render() {
    const headerLineCount = this.currentThreadParent
        ? ResponseContainer.computeLineCount(this.currentThreadParent.content.body, columns)
        : 5;  // fixed: title + status + deps + hint + separator

    const chainHeight = Math.max(1,
        rows - HEADER_LINES - headerLineCount - INPUT_AREA_LINES);

    return (
        <Box flexDirection="column">
            <DetailInputBridge onKey={this.handleKey} />
            <IssueHeader
                inum={inum}
                issue={issue}
                group={group}
                blockedByStr={blockedByStr}
                blocksStr={blocksStr}
                columns={columns}
                focusedField={this.focusedField}
                threadParent={this.currentThreadParent}
            />
            <ResponseChain
                rootResponse={this.currentRootResponse}
                columns={columns}
                height={chainHeight}
                userLastViewedAt={userLastViewedAt}
                selectedIndex={this.selectedMessage}
                onSelectedIndexChange={(i) => {
                    this.selectedMessage = i;
                    this.forceUpdate();
                }}
            />
            <InputBox
                value={this.inputValue}
                focused={this.focusedField === null}
                columns={columns}
                inThread={this.currentThreadParent !== null}
                onChange={this.handleInputChange}
                onSubmit={this.handleInputSubmit}
            />
        </Box>
    );
}
```

The overlay rendering stays in DetailView (it replaces the entire content
area). The overlays are already self-contained components (GroupPicker,
IssueListPicker).

Verify: npx tsc --noEmit && npx vitest run. No behavior change yet.

### Phase 2: Internalize thread navigation

#### Step 2.1: Add thread stack to DetailView

The stack is just `Response[]` — each entry is
the thread parent (the message whose replies you drilled into). Everything
else is derivable from the Response graph pointers.

```ts
export interface ThreadInfo {
    inThread: boolean;
}

// Instance properties:
private threadStack: Response[];   // stack of thread parents
```

Derived state (computed, not stored):
- currentThreadParent: `threadStack.length > 0 ? threadStack[threadStack.length - 1] : null`
- currentRootResponse: `threadStack.length > 0 ? threadStack[threadStack.length - 1].reply : props.rootResponse`

Constructor sets threadStack = [].

#### Step 2.2: enterThread / exitThread

```
enterThread(parentResponse: Response):
  1. if (!parentResponse.reply) return;
  2. markRepliesSeen(parentResponse)
  3. Push parentResponse onto threadStack
  4. selectedMessage = countChain(parentResponse.reply) - 1  // select last
  5. onThreadStateChange?.({ inThread: true })
  // parent forceUpdate propagates down, no local forceUpdate needed

exitThread():
  1. popped = threadStack.pop()
  2. Determine the restored chain:
     - if threadStack is empty: chain = props.rootResponse
     - else: chain = threadStack[threadStack.length - 1].reply
  3. Find popped in the restored chain (walk chain, find index)
     - if found: selectedMessage = that index
     - if not found (data changed): selectedMessage = chainLength - 1
  4. markRepliesSeen on the new threadStack top if it exists
  5. onThreadStateChange?.(threadStack.length > 0 ? { inThread: true } : null)
```

Why this works:
- stack.top() IS the thread parent (for header display)
- stack.top().reply IS the root of the displayed chain
- The popped parent IS the message to re-select on exit
- responding_to/replying_to pointers let you navigate the graph
  without saving snapshots

#### Step 2.3: Update handleKey

- Escape: if threadStack.length > 0, exitThread(). else onBack().
- Ctrl+Right / Ctrl+Alt+>: get selected Response from the current chain,
  call enterThread(selectedResponse).
- Ctrl+Left / Ctrl+Alt+<: if threadStack.length > 0, exitThread().
- Remove onNavigate calls entirely.

#### Step 2.4: Update render() for thread state

- Compute currentRootResponse and currentThreadParent from threadStack
  (see Step 2.1 derived state)
- Pass currentRootResponse to ResponseChain
- Pass currentThreadParent to IssueHeader
- When props.rootResponse changes and threadStack is empty,
  selectedMessage adjusts automatically (ResponseChain gets new props).
  When threadStack is not empty, no action needed — the thread's
  Response objects are still valid. On exit, we use fresh
  props.rootResponse (Step 2.2 point 2).

#### Step 2.5: Update props

- Remove threadParentResponse
- Remove onNavigate
- Add onThreadStateChange?: (info: ThreadInfo | null) => void

### Phase 3: Wire up App, Header, Footer

#### Step 3.1: views.ts — Remove ViewType.Thread

- Remove Thread from enum
- Remove from ViewTypeStringsMap
- Remove from View union type

#### Step 3.2: header.tsx — Accept threadInfo

- Add threadInfo?: ThreadInfo | null to HeaderProps
- getViewLabel: if threadInfo?.inThread && Detail, return "I-N Thread"
- getSubtitle: if threadInfo?.inThread && Detail, return "Thread on I-N"
- Remove ViewType.Thread cases

#### Step 3.3: footer.tsx — Accept inThread

- Add inThread?: boolean to FooterProps
- Add THREAD_SHORTCUTS constant
- Remove ViewType.Thread from VIEW_SHORTCUTS
- Use: shortcuts = inThread ? THREAD_SHORTCUTS : VIEW_SHORTCUTS[viewType]

#### Step 3.4: app.tsx — Wire threadInfo

- Add threadInfo instance property (null)
- Add handleThreadStateChange handler (sets threadInfo, forceUpdate)
- Remove ViewType.Thread render case entirely (lines 157-184)
- Remove markRepliesSeen from navigateToView (lines 80-87)
- Update DetailView render: remove onNavigate, add onThreadStateChange
- Pass threadInfo to Header, inThread to Footer
- Remove imports of findResponseById, markRepliesSeen

### Phase 4: ResponseContainer — self-compute hasNewReplies

#### Step 4.1: Move hasNewReplies computation into ResponseContainer

Add userLastViewedAt to ResponseContainerProps:

```ts
export interface ResponseContainerProps {
    response: Response;
    columns: number;
    selected: boolean;
    userLastViewedAt: string | null;  // replaces hasNewReplies boolean
}
```

ResponseContainer computes hasNewReplies internally:

```ts
const hasNewReplies = this.props.userLastViewedAt !== null
    && checkNewReplies(this.props.response, this.props.userLastViewedAt);
```

Move checkNewReplies into response-container.tsx (or a shared util).

This eliminates the need for ResponseChain to compute badge state at all.
ResponseChain just passes userLastViewedAt through to each ResponseContainer.

### Phase 5: Tests

#### Step 5.1: ResponseChain unit tests (new file)

- Renders correct number of visible messages for given height
- Up/down arrow calls onSelectedIndexChange
- Scrolls viewport when selection moves out of view
- Empty rootResponse renders nothing

#### Step 5.2: IssueHeader unit tests (new file)

- Renders issue metadata in normal mode
- Renders thread parent in thread mode
- Focused field highlighting

#### Step 5.3: Update detail.test.tsx

Create test fixtures with reply chains:
```ts
const REPLY_MESSAGES = [
    { id: 100, author: AuthorType.Agent, body: 'Reply 1', ... },
    { id: 101, author: AuthorType.User, body: 'Reply 2', ... },
];
// Attach to message id=2
```

Test cases:
- Ctrl+Right on message with replies enters thread
- Ctrl+Right on message without replies does nothing
- Escape in thread exits to issue view
- Escape at top level calls onBack
- onThreadStateChange receives { inThread: true } on enter, null on exit
- Nested thread: Ctrl+Right twice, Escape twice
- Data freshness: enter thread, re-render with new rootResponse, exit,
  verify main view shows updated data
- Overlay still works (Tab, Enter opens picker)

#### Step 5.4: Clean up

- Remove FlatNode interface (no longer used)
- Remove flattenChain (replaced by ResponseChain's internal walk)
- Remove findResponseById export (no longer used by app.tsx)
- Make markRepliesSeen private to detail.tsx (or move into response-chain)
- Remove unused imports from detail.tsx (View, ViewType)

## Execution Order

Phase 1 (extract, no behavior change):
  1.1 IssueHeader → 1.2 InputBox → 1.3 ResponseChain → 1.4 compose in DetailView
  Verify: tsc + vitest after each step

Phase 2 (thread internalization):
  2.1 thread stack → 2.2 enter/exit → 2.3 handleKey → 2.4 render → 2.5 props
  Verify: tsc + vitest

Phase 3 (wire up):
  3.1 views.ts → 3.2 header → 3.3 footer → 3.4 app
  Verify: tsc + vitest

Phase 4 (hasNewReplies):
  4.1 ResponseContainer self-computes
  Verify: tsc + vitest

Phase 5 (tests):
  5.1 ResponseChain tests → 5.2 IssueHeader tests → 5.3 detail tests → 5.4 cleanup
  Verify: vitest

## What This Eliminates

- FlatNode interface
- flattenChain function
- containerHeights parallel array
- Render-phase mutations (lines 322-347, 443-447, 420/439)
- ViewType.Thread enum member and View union variant
- ViewType.Thread render case in app.tsx (lines 157-184)
- findResponseById export (app.tsx no longer needs it)
- markRepliesSeen export (stays internal)
- DetailInputBridge wrapper (can move useInput into ResponseChain if converting
  to function component, but this is optional and not part of this plan)
- threadParentStack hack and render-phase restore logic
- The 185-line render() method in DetailView
