# Threaded Message Replies — Implementation Plan

NOTE: Copy this file to message_threads_plan.txt after plan approval.

## Context

The Detail View currently shows a flat list of Response objects for each issue. The goal is to add threaded reply support: agent messages are split into paragraphs, and users can reply to individual paragraphs (or any message), creating nested discussion threads. The spec is in message_threads.txt, the flowchart in Message_threads.excalidraw, and design review in Debates/message_threads_debate_synthesis.txt.

## Resolved Design Decisions

1. Paragraphs = separate bordered containers, each individually selectable
2. Button text replaces bottom border (no height change)
3. Para 1 = full header; para 2+ = plain top border, unless has replies (show [# replies])
4. Seen tracking via timestamp comparison against user_last_viewed_at
5. Flat list selection (up/down through all items: user messages + paragraphs)
6. ViewType.Thread on viewStack; Detail View IS a Thread View
7. Ctrl+Alt+> enters/creates thread; Ctrl+Alt+< exits thread (fallback: Ctrl+Right/Left if terminal doesn't support the combo)
8. Enter always appends Response to end of current chain
9. Context-sensitive footer (different keybindings at root vs nested thread)
10. Use spec types directly (Message + Response) — breaking change
11. Data-time paragraph splitting (paragraphs stored as separate Response nodes)
12. First paragraph = full metadata; continuations marked with is_continuation flag
13. Linked-list data structure (.response/.reply/.responding_to/.replying_to)

## Blast Radius

Files that import/use the current Response type:
- src/types.ts — definition
- src/db/responses.ts — queries return Response
- src/tui/detail.tsx — renders Response[]
- src/tui/detail.test.tsx — test fixtures use Response
- src/tui/response-container.tsx — renders one Response
- src/tui/mock-data.ts — creates Response objects
- src/cli/aidi.ts — accesses .author, .type, .body, .created_at directly (strings from DB, not enums)

Files that need new ViewType.Thread support:
- src/tui/views.ts — enum + View union
- src/tui/header.tsx — getSubtitle/getViewLabel (exhaustive switch with assertNever)
- src/tui/footer.tsx — VIEW_SHORTCUTS record
- src/tui/app.tsx — render switch


## Implementation Phases

### PHASE 1: Foundation Types (sequential — everything depends on this)

**Task 1A: New types in src/types.ts**

Add Message interface and replace the Response interface:

```ts
export interface Message {
    author: AuthorType;
    type: ResponseType;
    body: string;
    timestamp: string;        // ISO 8601 (was created_at)
    seen: string | null;      // ISO 8601 or null
}

export interface Response {
    id: number;
    content: Message;
    responding_to: Response | null;   // previous in chain (back pointer, up)
    response: Response | null;        // next in chain (forward pointer, down)
    replying_to: Response | null;     // parent thread (back pointer, left)
    reply: Response | null;           // first reply (forward pointer, right)
    is_continuation: boolean;         // true = paragraph 2+ of same message
}
```

Keep the old Response temporarily as `ResponseRow` for DB hydration:

```ts
export interface ResponseRow {
    id: number;
    inum: number;
    author: string;           // 'user' | 'agent' as stored in SQLite
    type: string;             // 'analysis' etc as stored in SQLite
    body: string;
    created_at: string;
    responding_to_id: number | null;  // future DB column
    replying_to_id: number | null;    // future DB column
    is_continuation: number;          // 0 or 1 in SQLite
}
```

Note: The existing Response interface drops `inum` (navigational context, not intrinsic to the message) and `created_at` (moved to `content.timestamp`).

**Task 1B: New utility — src/tui/paragraph-utils.ts**

```ts
export function splitIntoParagraphs(body: string): string[]
```

Algorithm:
- Split on blank lines
- Track code fence state (lines matching /^\s*```/)
- Never split inside code fences
- Filter empty paragraphs
- Return array of paragraph strings

**Task 1C: New utility — src/tui/thread-builders.ts**

Builder functions for constructing linked-list mock data:

```ts
// Helper to create a Message
export function msg(author, type, body, timestamp, seen?): Message

// Build a .response chain from an array of Messages. Returns { root, nodes[] }.
export function buildResponseChain(messages: Message[]): { root: Response; nodes: Response[] }

// Attach a reply chain to a parent node. Sets parent.reply, links via .response.
export function buildReplyChain(parent: Response, replies: Message[]): Response[]

// Split an agent message body into paragraphs, return Message[] with is_continuation marking.
export function splitAgentMessage(body: string, meta: { type, timestamp, seen }): Message[]
```

The id counter is module-level (let nextId = 1) so all nodes get unique ids.
buildResponseChain returns both root and nodes[] array so callers can index directly
(e.g., `nodes[3]`) instead of chasing pointers.

**Task 1D: ViewType.Thread in src/tui/views.ts**

```ts
export enum ViewType {
    Dashboard, Detail, NewIssue, AgentStatus, BlockingMap, GroupView,
    Thread,  // NEW
}

// Add to ViewTypeStringsMap:
[ViewType.Thread, "Thread"],

// Add to View union:
| { type: ViewType.Thread; inum: number; rootResponseId: number }
```


### PHASE 2: Parallel component work (3 independent subagents)

**Task 2A: ResponseContainer rewrite (src/tui/response-container.tsx)**

Subagent scope: Only this file. No dependencies on other Phase 2 tasks.

New props:
```ts
export interface ResponseContainerProps {
    response: Response;          // new Response type (access via .content)
    columns: number;
    selected: boolean;
    isParagraphContinuation: boolean;  // NEW
    replyCount: number;                // NEW
    hasNewReplies: boolean;            // NEW
}
```

Rendering changes:
- Top border when NOT continuation: `┌─ Author - Type - timestamp ───┐` (existing, access via response.content.*)
- Top border when continuation AND replyCount=0: `┌────────────────────────────┐` (plain dashes)
- Top border when continuation AND replyCount>0: `┌──── [3 replies] ──────────┐` (hasNewReplies? red bold : color)
- Header for non-continuation: `[# replies]` or `[# new replies]` right-aligned in header (per spec lines 62-67)
- Body lines: unchanged structure, access via response.content.body
- Bottom border when selected AND replyCount=0: `└──── add threaded reply ───┘`
- Bottom border when selected AND replyCount>0: `└──── view replies (N) ─────┘`
- Bottom border when NOT selected: `└────────────────────────────┘` (existing)

computeLineCount: unchanged formula (1 + bodyLines + 1 + 1). Button text replaces bottom border, not an extra line. Continuation vs full header both produce 1 top-border line.


**Task 2B: Header + Footer + Views updates**

Subagent scope: views.ts (already done in 1D), header.tsx, footer.tsx. No dependencies on 2A or 2C.

header.tsx:
- getViewLabel: add `if (view.type === ViewType.Thread) return \`I-${view.inum} Thread\`;`
- getSubtitle: add `case ViewType.Thread: return \`Thread on I-${view.inum}\`;`

footer.tsx:
- Add to VIEW_SHORTCUTS:
```ts
[ViewType.Thread]: [
    { key: 'Enter', label: 'Send' },
    { key: '↑↓',   label: 'Scroll' },
    { key: 'C-▸',  label: 'Sub-thread' },
    { key: 'Esc',  label: 'Exit thread' },
],
```
- Update Detail entry to add thread shortcut:
```ts
{ key: 'C-▸', label: 'Thread' },  // add after ↑↓ Scroll
```


**Task 2C: Mock data (src/tui/mock-data.ts)**

Subagent scope: This file + imports from thread-builders.ts and paragraph-utils.ts.

Changes:
- Import Message, Response from types.ts
- Import buildResponseChain, buildReplyChain, msg, splitAgentMessage from thread-builders.ts
- Change DetailMockData.responses type from IssueResponse[] to Response (the linked-list root)
- Build I-1 mock data as a rich threaded conversation (details below)
- Update I-2 through I-8 with simple chains (most have 0-2 responses, no threads)
- Set I-1's user_last_viewed_at to "2026-01-01T12:00:00Z" for new-reply testing

I-1 mock data structure (from Excalidraw + all scenarios):

Main chain (vertical, .response):
```
A1: Agent Analysis, para 1/3: "I worked on the server-derived field migration..."
A2: Agent Analysis, para 2/3: "I identified three categories..."  [has reply thread]
A3: Agent Analysis, para 3/3: "The computed fields can be migrated..."
B:  User: "great, now work on the dual-write logic..."
C:  Agent Implementation: "I completed work on the dual-write logic..."
D:  User: "can you change the sync interval..."  [has reply thread]
E1: Agent Implementation, para 1/2: "I have implemented the change..."  [has reply thread with NEW replies]
E2: Agent Implementation, para 2/2: "Here are the files modified..."
```

Reply threads (horizontal, .reply):
```
A2.reply → R1 (user): "one minor tweak..." → R2 (agent): "Tweak implemented." → R3 (user): "great, add a comment..."
  (3 levels deep — tests nested thread, tests Excalidraw structure)

D.reply → R4 (agent): "Updated sync interval..." → R5 (user, NEW): "that's fine for now..."
  (tests user message with reply thread, tests new/unseen replies)

E1.reply → R6 (user, NEW): "looks good, but add config..." → R7 (agent, NEW): "Added config.yaml."
  (tests all-new thread on paragraph)
```

Scenarios covered:
- (a) Multi-paragraph agent with replies on one paragraph: A1-A3, replies on A2
- (b) Nested thread: R1→R2→R3
- (c) New unseen replies: R5, R6, R7 (timestamps after 12:00:00Z)
- (d) User message with reply thread: D with R4→R5
- (e) Excalidraw flowchart: full vertical chain with horizontal branches


### PHASE 3: Integration wiring (sequential — depends on Phase 2)

**Task 3A: DetailView rewrite (src/tui/detail.tsx)**

Core changes:
- Props: change `responses: IssueResponse[]` to `rootResponse: Response | null`. Add `threadDepth: number` (0 = issue root).
- New helper: `flattenChain(root: Response | null, userLastViewedAt: string | null): FlatNode[]`
  - Walks .response pointers from root
  - For each node: computes isParagraphContinuation (is_continuation flag), replyCount (walk .reply chain and count), hasNewReplies (any reply.content.timestamp > userLastViewedAt)
  - Returns flat array for rendering
- Constructor: build flatList from rootResponse, compute containerHeights
- Selection: selectedMessage indexes into flatList (flat selection, decision 5)
- Key handling additions:
  - Ctrl+Alt+> (or Ctrl+Right fallback): if selected node exists, call `onNavigate({ type: ViewType.Thread, inum, rootResponseId: selectedNode.response.id })`
  - Ctrl+Alt+< (or Ctrl+Left fallback): if threadDepth > 0, call `onBack()`
- Render: pass new props to ResponseContainer (isParagraphContinuation, replyCount, hasNewReplies)
- Issue header: when threadDepth > 0, show compact thread header (2 lines instead of 5):
  ```
  Thread on: "Should we keep the dual-write active for a..."
  ─────────────────────────────────────────────────────
  ```
- Text input label: "Enter message: >" at root, "Add a reply: >" in thread

**Task 3B: App.tsx wiring**

- Add ViewType.Thread case in render switch:
  - Look up MOCK_DETAIL_DATA[view.inum]
  - Find the root Response by id (walk the thread root's linked list)
  - Compute threadDepth from viewStack (count Thread entries)
  - Render DetailView with rootResponse and threadDepth
- onBack for Thread: goBackToPreviousView() (already works via viewStack)

**Task 3C: DB layer updates (src/db/responses.ts)**

- Rename current queries to return ResponseRow instead of Response
- Add ResponseRow → Response hydration function (for future use)
- Add responding_to_id, replying_to_id, is_continuation columns to schema
- This is LOW PRIORITY since the TUI currently runs on mock data only

**Task 3D: CLI + test updates**

- src/cli/aidi.ts: uses flat DB fields (.author, .body, etc.) — switch to ResponseRow for CLI context, or update field access
- src/tui/detail.test.tsx: update makeResponse helper and TEST_RESPONSES to use new Response shape
- src/db/responses.test.ts: update to use ResponseRow type

**Task 3E: paragraph-utils.test.ts**

Write tests for splitIntoParagraphs:
- Single paragraph (no blank lines)
- Two paragraphs separated by blank line
- Code fence with blank line inside (not split)
- Code fence with language tag
- Mixed prose + code blocks
- Empty/whitespace-only body


## Subagent Work Distribution

Phase 1 runs as a single subagent (or 2 in parallel: 1A+1D together, 1B+1C together).

Phase 2 runs as 3 parallel subagents:
- Subagent A: Task 2A (ResponseContainer)
- Subagent B: Task 2B (Header + Footer)
- Subagent C: Task 2C (Mock data)

Phase 3 runs as 2-3 subagents:
- Subagent A: Task 3A + 3B (DetailView + App wiring — tightly coupled)
- Subagent B: Task 3D (CLI + test fixture updates)
- Subagent C (optional): Task 3C (DB schema — can be deferred)


## Key Binding Detection Note

Ctrl+Alt+> requires key.ctrl=true, key.meta=true (Alt maps to meta in terminals), and the input character ">" (which is Shift+. on most keyboards). Many terminal emulators cannot reliably pass this 4-modifier combo.

Fallback: Ctrl+Right (key.ctrl && key.rightArrow) and Ctrl+Left. Detection code should try Ctrl+Alt+> first, fall back to Ctrl+Right:

```ts
const enterThread = (key.ctrl && key.meta && (_input === '>' || _input === '.'))
    || (key.ctrl && key.rightArrow);
const exitThread = (key.ctrl && key.meta && (_input === '<' || _input === ','))
    || (key.ctrl && key.leftArrow);
```

## FlatNode Helper Type

Used internally by DetailView to represent the flattened response chain:

```ts
interface FlatNode {
    response: Response;
    isParagraphContinuation: boolean;
    replyCount: number;
    hasNewReplies: boolean;
}
```

Built by walking .response pointers from the root. For each node, replyCount is computed by walking the .reply chain (counting .response hops). hasNewReplies checks if any reply's content.timestamp > userLastViewedAt.


## Verification

1. `npx tsc --noEmit` — clean build after each phase
2. `npx vitest run` — all existing tests pass (after fixture updates in 3D)
3. `node dist/tui/run.js` — TUI launches
4. Detail View renders I-1 with paragraph-split agent messages
5. Paragraph 1 shows full header; paragraphs 2+ show plain border
6. Paragraphs with replies show [# replies] in top border
7. Selected message shows button text in bottom border
8. Ctrl+Right on a message with replies pushes Thread view onto stack
9. Thread view shows the parent message + reply chain
10. Esc in thread view pops back to parent
11. Ctrl+Right in thread view on a reply with sub-replies pushes nested thread
12. "New replies" indicator appears in red for replies after user_last_viewed_at
13. Up/down navigates flat list of paragraphs + user messages
14. Enter in text input appends to current chain
15. Footer shows context-appropriate keybindings
