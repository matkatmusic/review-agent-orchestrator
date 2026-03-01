# Implementation Tasks — Question Review Orchestrator v2

## Overview

The v1 system used markdown question files in folders (Awaiting/Active/Deferred/Resolved) with XML-like tags for responses, a bash daemon for agent orchestration, and direct file editing as the user interface. It was brittle — dependency tracking via file scanning failed, the XML format was error-prone for agents, and the bash scripts couldn't handle the growing complexity of the pipeline logic.

The v2 redesign replaces all of this with:

- **SQLite database** as the single source of truth for questions, responses, and dependencies. No more question files — all content lives in the DB.
- **TUI (terminal UI)** as the primary user interface, replacing direct file editing. Users browse questions, read agent responses, and reply through an interactive terminal app.
- **TypeScript/Node.js** replaces bash for the daemon, pipeline, and CLI tool. Native JSON/SQL handling, type safety, and testability.
- **`qr-tool` CLI** for agent interaction. Agents call `qr-tool read/respond/create/block-by` instead of editing files. Write commands go through a `.pending/` queue; the daemon is the sole DB writer.
- **SQL dump tracked in git** for portability. The `.db` file is a gitignored runtime artifact rebuilt from `questions.dump.sql` on setup. The dump auto-exports after any scan cycle that changes the DB.
- **Proper dependency management** via a `dependencies` join table with foreign keys, replacing unreliable file-based `blocked_by:` parsing. The daemon enforces a blocked invariant every cycle and auto-unblocks questions when their blockers resolve.

The implementation order is bottom-up: database layer first, then CRUD modules, then pipeline logic, then the CLI tool (which becomes the first usable entry point), then agent management, then the daemon, then the TUI. Each stage builds on the previous one and can be independently tested before moving on. The migration script and integration come last, after the full system works end-to-end.

See `v2.md` for the complete design document, schema, interfaces, and decision log.

---

Each stage produces a working, testable artifact. Do not start a stage until the previous stage's verification passes.

---

## Stage 1: Project Scaffolding

**Goal**: Empty TypeScript project that compiles.

- [x] Create `package.json` with all dependencies (`better-sqlite3`, `commander`, `ink`, `react`, `vitest`, `typescript`)
- [x] Create `tsconfig.json` with JSX support for Ink (+ `sourceMap` and `declarationMap` for TS→JS mapping)
- [x] Create `.gitignore` (`dist/`, `node_modules/`, `.pending/`)
- [x] Create `src/types.ts` with all interfaces (`Question`, `Response`, `Dependency`, `PendingAction`, `Config`, `LockfileData`)
- [x] `npm install && npm run build`

**Verify**: ~~Build succeeds with zero errors. `dist/types.js` exists.~~ PASSED — 138 packages, 0 vulnerabilities, `dist/types.js` + `.js.map` + `.d.ts` + `.d.ts.map` all present.

---

## Stage 2: Database Layer

**Goal**: Can create, migrate, seed, export, and import a SQLite database.

- [x] Create `templates/schema.sql` (full schema: `metadata`, `questions`, `responses`, `dependencies` tables + indexes)
- [x] Create `templates/seed.sql` (getting-started question + `lastQuestionCreated` metadata row)
- [x] Create `src/db.ts` — `DB` class: `open()`, `close()`, `migrate()`, `seed()`, `run()`, `get()`, `all()`, `isDirty()`, `exportDump()`, `importDump()`
- [x] Write tests: `src/__tests__/db.test.ts`
  - Creates DB in temp dir
  - Runs schema migration
  - Seeds data
  - Exports dump → delete DB → import dump → data intact
  - `isDirty()` tracks write operations

**Verify**: ~~`npm test -- db.test` — all pass. Round-trip dump/import preserves all data.~~ PASSED — 10/10 tests pass (67ms). Also covers: migration idempotency, seed idempotency, FK enforcement, throws-when-not-open.

---

## Stage 3: Core CRUD — Questions

**Goal**: Create, read, update, list questions.

- [x] Create `src/questions.ts` — `createQuestion()`, `getQuestion()`, `listByStatus()`, `listAll()`, `updateStatus()`, `getActiveCount()`, `getGroup()`, `isGroupResolved()`
- [x] `createQuestion()` increments `lastQuestionCreated` in metadata, inserts row, returns qnum
- [x] Write tests: `src/__tests__/questions.test.ts`
  - Create question → returned qnum = lastQuestionCreated
  - Create multiple → qnums increment
  - List by status filters correctly
  - Update status transitions
  - Group resolution: all resolved = true, partial = false

**Verify**: ~~`npm test -- questions.test` — all pass.~~ PASSED — 18/18 tests pass (51ms). Also covers: group assignment, null group default, resolved_at set/clear, getActiveCount, getGroup empty, nonexistent qnum.

---

## Stage 4: Core CRUD — Responses

**Goal**: Add and list responses for a question.

- [x] Create `src/responses.ts` — `addResponse()`, `listResponses()`, `getLatestResponse()`, `hasUnreadAgentResponse()`
- [x] `hasUnreadAgentResponse()`: last response is from `agent` and no subsequent `user` response exists (used for TUI `✱` marker)
- [x] Write tests: `src/__tests__/responses.test.ts`
  - Add response → appears in list
  - Responses ordered by `created_at`
  - `hasUnreadAgentResponse()` logic correct
  - Responses tied to correct qnum (FK constraint)

**Verify**: ~~`npm test -- responses.test` — all pass.~~ PASSED — 11/11 tests pass (44ms). Also covers: empty response list, getLatestResponse, FK rejection, unread toggle across agent/user exchanges.

---

## Stage 5: Core CRUD — Dependencies

**Goal**: Blocking relationships with correct resolution logic.

- [x] Create `src/dependencies.ts` — `addBlocker()`, `removeBlocker()`, `isBlocked()`, `getBlockers()`, `getBlocked()`, `blockByGroup()`
- [x] `isBlocked()` checks if ANY blocker has status != `Resolved`
- [x] `blockByGroup()` expands group to individual qnums via query
- [x] Write tests: `src/__tests__/dependencies.test.ts`
  - Add blocker → `isBlocked()` returns true
  - Resolve blocker → `isBlocked()` returns false
  - Multiple blockers: blocked until ALL resolved
  - Self-reference rejected (app-level validation — `INSERT OR IGNORE` suppresses CHECK, so addBlocker validates in code)
  - `blockByGroup()` creates correct dependency rows
  - Group partially resolved → still blocked
  - `getBlockers()`/`getBlocked()` return correct questions

**Verify**: ~~`npm test -- dependencies.test` — all pass.~~ PASSED — 14/14 tests pass (47ms). Also covers: addBlocker idempotency, removeBlocker, empty group blockByGroup, no-dep queries return empty.

---

## Stage 6: Pipeline

**Goal**: Status transition logic works correctly in isolation.

- [x] Create `src/pipeline.ts` — `enforceBlocked()`, `autoUnblock()`, `promoteAwaiting()`, `runPipeline()`
- [x] `enforceBlocked()`: query Awaiting/Active questions, check `isBlocked()`, move to Deferred
- [x] `autoUnblock()`: query Deferred questions WITH dependency entries, check if all resolved, move to Awaiting
- [x] `promoteAwaiting()`: move Awaiting → Active up to `maxAgents - activeCount`
- [x] User-deferred (no dependency entries) must NOT auto-unblock
- [x] Write tests: `src/__tests__/pipeline.test.ts`
  - Blocked Active question → moved to Deferred
  - Blocked Awaiting question → moved to Deferred
  - All blockers resolved → Deferred moves to Awaiting
  - User-deferred question (no deps) stays in Deferred
  - Promote respects MAX_AGENTS capacity
  - Full pipeline runs in correct order (enforce → unblock → promote)

**Verify**: ~~`npm test -- pipeline.test` — all pass.~~ PASSED — 16/16 tests pass (50ms). Also covers: unblocked stays Active, no-op returns empty, promote order by qnum, unblocked+promoted in same run.

---

## Stage 7: Pending Queue

**Goal**: Agents can write actions to `.pending/`; daemon processes them into the DB.

- [x] Create `src/pending.ts` — `writePending()`, `processPendingQueue()`
- [x] Pending file format: JSON, one action per file, filename = `<timestamp>-<random>.json`
- [x] Actions: `respond`, `block-by`, `block-by-group`, `add-to-group`, `create`
- [x] `processPendingQueue()`: read all files, apply each to DB, delete processed files
- [x] Write tests: `src/__tests__/pending.test.ts`
  - Write pending → file created in `.pending/`
  - Process queue → action applied to DB, file deleted
  - Multiple pending files processed in timestamp order
  - Invalid action file → logged and skipped (not crash)

**Verify**: ~~`npm test -- pending.test` — all pass.~~ PASSED — 10/10 tests pass (66ms). Also covers: all 5 action types individually, nonexistent dir returns 0, empty dir returns 0.

---

## Stage 8: Config

**Goal**: Load configuration from `config.sh`, environment, or defaults.

- [x] Create `src/config.ts` — `loadConfig()`, `resolveProjectRoot()`
- [x] Config sources (priority): env vars > `config.local.sh` > `config.sh` > defaults
- [x] `resolveProjectRoot()`: derive from tool's own location (walk up to find `Questions/` dir)
- [x] Validate: required paths exist, `maxAgents` > 0, etc.
- [x] Write tests: `src/__tests__/config.test.ts`
  - Defaults applied when no config file
  - Env vars override config file
  - Project root resolution from submodule location

**Verify**: ~~`npm test -- config.test` — all pass.~~ PASSED — 15/15 tests pass (13ms). Also covers: shell config parsing (quotes, comments, var refs skipped), maxAgents validation, codeRoot relative/absolute/empty, invalid int fallback.

---

## Stage 9: CLI Tool (`qr-tool`)

**Goal**: Fully working CLI for agents and users. First usable entry point.

- [x] Create `src/qr-tool.ts` using `commander` (split into `qr-tool.ts` entry point + `qr-tool-commands.ts` testable handlers)
- [x] Read commands (hit DB directly):
  - `read <qnum>` — print question + full response history, formatted
  - `list [--status <s>] [--group <g>]` — tabular question list
  - `info <qnum>` — question details + blockers/blocked
  - `status` — summary counts by status
- [x] Write commands (write to `.pending/`):
  - `respond <qnum> <body>` — submit agent/user response
  - `create <title> <description> [--group <name>]` — new question
  - `block-by <blocked> <blocker>` — add dependency
  - `block-by-group <blocked> <group>` — block by group
  - `add-to-group <qnum> <group>` — set group
- [x] Add shebang + make executable: `#!/usr/bin/env node`
- [x] Integration test: `src/__tests__/qr-tool.test.ts`
  - Create question via CLI → exists in DB after pending processed
  - Read question → output includes title and responses
  - Block-by → dependency exists after pending processed
  - List with filters → correct output

**Verify**: ~~`npm test -- qr-tool.test` — all pass.~~ PASSED — 17/17 tests pass (56ms). Covers all read commands (read, list, info, status), all write commands via pending queue integration, error cases, and output format.

---

## Stage 10: Tmux Integration

**Goal**: Can spawn, kill, and communicate with tmux panes programmatically.

- [x] Create `src/tmux.ts` — `hasSession()`, `createSession()`, `splitWindow()`, `killPane()`, `sendKeys()`, `capturePaneTail()`, `listPanes()` (also added `isPaneAlive()`, `killSession()`, `isTmuxAvailable()`)
- [x] All functions shell out to `tmux` CLI (via `child_process.execSync`)
- [x] Error handling: tmux not installed, session doesn't exist, pane already dead
- [x] Write tests: `src/__tests__/tmux.test.ts` (integration — requires tmux, auto-skipped if unavailable)
  - Create session → exists
  - Split window → pane ID returned
  - Send keys → captured in pane output
  - Kill pane → no longer listed
  - Graceful error when session doesn't exist

**Verify**: ~~`npm test -- tmux.test` — all pass (skip in CI if no tmux).~~ PASSED — 11/11 tests pass (604ms). Also covers: isPaneAlive, listPanes empty, capturePaneTail on dead pane, killPane safe on dead pane.

---

## Stage 11: Agent Lifecycle

**Goal**: Spawn agents for Active questions, re-prompt on new responses, manage lockfiles.

- [x] Create `src/agents.ts` — `spawnAgent()`, `repromptAgent()`, `isAgentRunning()`, `cleanupStaleLocks()`, `createLockfile()`, `removeLockfile()` (also added `readLockfile()`, `listLockfiles()`, `killAgent()`, `buildInitialPrompt()`, `buildClaudeCommand()`, `sendInitialPrompt()`)
- [x] `spawnAgent()`: create worktree, write lockfile, spawn claude in tmux pane with initial message
- [x] `repromptAgent()`: send "NEW USER RESPONSE" message to existing pane via `sendKeys()`
- [x] `isAgentRunning()`: check lockfile exists AND pane still alive
- [x] `cleanupStaleLocks()`: remove lockfiles where pane is dead
- [x] Lockfile format: JSON `{ paneId, qnum, headCommit }`
- [x] Lockfile location: `<projectRoot>/.question-review-locks/Q<num>.lock`
- [x] Write tests: `src/__tests__/agents.test.ts`
  - Lockfile creation/removal
  - Stale lockfile detection (pane ID doesn't exist)
  - Spawn builds correct claude CLI command

**Verify**: ~~`npm test -- agents.test` — all pass.~~ PASSED — 32/32 tests pass (2270ms). Also covers: readLockfile, listLockfiles, malformed lockfile handling, buildInitialPrompt (with/without codeRoot), buildClaudeCommand (--add-dir variants), killAgent, tmux integration (spawn session creation/reuse, reprompt with pane output verification, sendInitialPrompt, cleanupStaleLocks preserving live agents).

---

## Stage 12: Daemon

**Goal**: Full scan cycle runs end-to-end. The system works without a TUI.

- [x] Create `src/daemon.ts` — `scanCycle()`, `main()` (also added `detectNewCommits()`, `ScanResult` interface)
- [x] Scan cycle: pending queue → pipeline → spawn/re-prompt → cleanup → export dump if dirty
- [x] `main()`: single invocation (called by `daemon.sh` in a loop)
- [x] Create `scripts/daemon.sh` — thin bash wrapper with sleep loop
- [x] Logging: `[review] <message>` format to stderr
- [x] Detect new commits on main branch → send rebase signal to agents
- [x] Write tests: `src/__tests__/daemon.test.ts`
  - Full cycle with seeded DB: pending processed, pipeline runs, dump exported
  - No-op cycle: dump NOT re-exported
  - Dirty tracking: response added → dump exported

**Verify**: ~~`npm test -- daemon.test` — all pass.~~ PASSED — 13/13 tests pass (1686ms). Also covers: blocked Active → Deferred with agent kill, unblock+promote in same cycle, maxAgents limit, stale lockfile cleanup, multiple pending actions in order, second no-op cycle skips dump, spawn failure resilience, detectNewCommits safety with stale/missing lockfiles.

---

## Stage 13: TUI — Dashboard

**Goal**: Navigable question list with status filtering.

- [x] Create `src/tui/app.tsx` — root component, screen router (routes: dashboard, detail placeholder, create placeholder)
- [x] Create `src/tui/dashboard.tsx` — question list with status tabs, `✱` new-response markers
- [x] Keyboard: arrow keys navigate, Tab/Shift+Tab switches status filter, Enter opens detail, `n` new, `d` defer, `r` resolve, `a` activate, `R` refresh, `q` quit
- [x] Reads DB directly (read-only for display; status actions write directly)
- [x] Status bar: counts per status, total count, unread count in header

**Verify**: Build compiles clean. Interactive behavior deferred to Stage 13b (programmatic tests via `ink-testing-library`).

---

## Stage 13b: TUI — Dashboard Tests

**Goal**: Programmatic tests for the dashboard component using `ink-testing-library`. Proves rendering, navigation, filtering, and keyboard actions all work without manual interaction.

- [x] Install `ink-testing-library` as a dev dependency
- [x] Write tests: `src/__tests__/dashboard.test.tsx`
  - **Rendering**
    - Empty DB → shows "No questions in this view."
    - Seeded DB → shows question rows with Q-number, title, status
    - Header shows total question count
    - Status tabs show correct counts per status
    - `✱` marker appears on questions with unread agent responses
    - `✱` marker does NOT appear when latest response is from user
    - Group name shown in brackets for grouped questions
    - Long titles are truncated with `...`
  - **Cursor navigation**
    - Down arrow moves cursor indicator (`▸`) to next row
    - Up arrow moves cursor up; stops at top (does not wrap)
    - Down arrow stops at bottom (does not wrap)
    - Cursor clamps when list shrinks (e.g., after status change removes current item)
  - **Tab filtering**
    - Tab cycles through status tabs: All → Active → Awaiting → Deferred → Resolved → All
    - Shift+Tab cycles backwards
    - Filtering to a status shows only questions with that status
    - Filtering resets cursor to 0
    - "All" tab shows all questions
    - Tab to a status with no questions shows "No questions in this view."
  - **Status change actions**
    - `d` on Awaiting question → DB status changes to Deferred, re-renders with updated status
    - `d` on already-Deferred question → no-op (status unchanged)
    - `d` on Resolved question → no-op
    - `r` on Active question → DB status changes to Resolved
    - `r` on already-Resolved question → no-op
    - `a` on Deferred question → DB status changes to Awaiting
    - `a` on Active question → no-op (only works on Deferred/Resolved)
  - **Callbacks**
    - Enter → `onOpenDetail` called with the qnum of the selected question
    - Enter on empty list → `onOpenDetail` NOT called
    - `n` → `onNewQuestion` called

**Verify**: ~~`npm test -- dashboard.test` — all pass.~~ PASSED — 28/28 tests pass (253ms). All 195 tests across 12 files pass. Tests use `ink-testing-library` v4 with async `tick()` delays to allow React `useEffect` to register `useInput` listeners before simulating stdin. Covers: 8 rendering tests, 4 cursor navigation tests, 6 tab filtering tests, 7 status change action tests, 3 callback tests.

---

## Stage 14: TUI — Question Detail

**Goal**: View conversation history and submit responses.

- [x] Create `src/tui/detail.tsx` — response history, input box, header with dependencies
- [x] Response bubbles: agent (magenta) vs user (green) visually distinct, timestamps shown
- [x] Input: text input at bottom via `ink-text-input`, Enter sends (writes to DB directly — TUI is a trusted writer, not via pending queue)
- [x] Keyboard: `i`/Enter to enter input mode, Esc back to dashboard (or exit input mode), `d` defer, `r` resolve, `a` activate
- [x] Header shows Q-number, title, status, group, blocked-by/blocks dependencies
- [x] Unread `✱` marker on latest agent response; disappears after user responds
- [x] Updated `src/tui/app.tsx` to wire detail screen (replaces placeholder)
- [x] Write tests: `src/__tests__/detail.test.tsx` — 26 tests covering rendering, navigation, input mode, status actions, refresh
- [ ] Shell out to `$EDITOR` for long responses (optional, future enhancement)

**Verify**: ~~Open question in TUI → see full conversation. Type response → appears in DB. Agent response shows `✱` until user responds.~~ PASSED — 26/26 tests pass (211ms). All 221 tests across 13 files pass. Tests use `ink-testing-library` with async tick for useEffect timing. Covers: 12 rendering tests (header, status, description, group, dependencies, responses, unread marker, not-found), 1 navigation test (Esc back), 6 input mode tests (enter/exit, type+submit, empty submit no-op, Esc clear/cancel), 6 status action tests (d/r/a with guards, input mode isolation), 1 refresh test (conversation update after submit).

---

## Stage 14b: TUI — Detail Tests

**Goal**: Comprehensive programmatic tests for the detail component using `ink-testing-library`. Ensures all rendering, keyboard modes, status actions, and response submission work correctly. Supplements the initial 26 tests from Stage 14 with additional edge-case and gap coverage.

- [ ] Expand tests in `src/__tests__/detail.test.tsx`
  - **Rendering**
    - Question title and Q-number displayed in header
    - Status displayed with correct label (Active, Awaiting, Deferred, Resolved)
    - Description text shown below header
    - Group name shown when present; omitted when null
    - Blocked-by shows blocker Q-numbers (e.g., `Q1, Q3`); shows `(none)` when empty
    - Blocks shows downstream Q-numbers; shows `(none)` when empty
    - Multiple blockers displayed as comma-separated list
    - `No responses yet.` shown when no responses exist
    - Response bubbles show author label: `Agent` for agent, `You` for user
    - Response body text displayed in each bubble
    - Responses rendered in chronological order (oldest first)
    - Multi-response conversation shows all responses (3+ messages)
    - `✱` marker appears on latest response when it's from agent
    - `✱` marker does NOT appear when latest response is from user
    - `✱` marker only appears on the LAST response, not on earlier agent responses
    - Not-found screen shown for invalid qnum with "not found" text
    - Status bar shows command-mode hints when not in input mode
  - **Input mode transitions**
    - `i` enters input mode — status bar changes to show `[Enter] Send  [Esc] Cancel`
    - Enter key also enters input mode
    - Esc with empty input exits input mode immediately — status bar reverts to command hints
    - Esc with non-empty input clears the text but stays in input mode
    - Esc again (now empty) exits input mode
    - Submitting a response exits input mode (returns to command mode)
  - **Response submission**
    - Typing text + Enter adds a `user` response to DB with correct body
    - Response appears in conversation view after submit
    - Response shows `You` label after submit
    - Empty submit (Enter with no text) does NOT add a response to DB
    - Whitespace-only submit does NOT add a response to DB
    - `✱` marker disappears after user submits a response to an agent message
  - **Status change actions (command mode)**
    - `d` on Awaiting question → DB status changes to Deferred, header re-renders
    - `d` on Active question → DB status changes to Deferred
    - `d` on already-Deferred question → no-op (status unchanged)
    - `d` on Resolved question → no-op (status unchanged)
    - `r` on Active question → DB status changes to Resolved, header re-renders
    - `r` on Awaiting question → DB status changes to Resolved
    - `r` on already-Resolved question → no-op (status unchanged)
    - `a` on Deferred question → DB status changes to Awaiting, header re-renders
    - `a` on Resolved question → DB status changes to Awaiting
    - `a` on Active question → no-op (only works on Deferred/Resolved)
    - `a` on Awaiting question → no-op (only works on Deferred/Resolved)
  - **Input mode isolation**
    - `d`, `r`, `a` keys are captured as text input, NOT as status actions, when in input mode
    - Esc in input mode does NOT call onBack
  - **Navigation**
    - Esc in command mode calls `onBack`
    - Esc on not-found screen calls `onBack`

**Verify**: `npm test -- detail.test` — all pass.

---

## Stage 15: TUI — New Question

**Goal**: Create questions from the TUI.

- [ ] Create `src/tui/create.tsx` — form with title, description, optional group, optional blocked-by
- [ ] Writes to DB directly (TUI is trusted)
- [ ] After creation: navigate to the new question's detail view

**Verify**: Create question in TUI → `qr-tool list` shows it. Blocked-by field creates dependency rows.

---

## Stage 15b: Debate Verification of design

**Goal**: Fix any design flaws caught by /octo:debate result

- [ ] run /octo:debate on the final design, prompting to check for hidden bugs, failed/invalid tests, missing functionality, or other issues.  invoke gemini and codex correctly.  use claude's backend-architect agent to help design the debate.
- [ ] present debate findings for review. 
- [ ] request user's decisions for remaining issues in design that were flagged by debate panel.
- [ ] implement design changes based on debate findings and user decisions.
- [ ] run the octo:debate test again.  if it passes, update tasks.md and commit the changes.  if not, repeat previous steps until it passes, prompting the end user for input when necessary.

---

## Stage 16: V1 Migration Script

**Goal**: Import all 152 existing question files into the database.

- [ ] Create `src/scripts/migrate-v1.ts`
- [ ] Parse `Q####_*.md` filenames → extract qnum, title
- [ ] Parse XML-like tags: `<question_*>`, `<user_response>`, `<response_*>` → response rows
- [ ] Map folder to status: `Awaiting/` → Awaiting, `Deferred/` → Deferred, `Resolved/` → Resolved
- [ ] Parse `blocked_by:` lines → dependency rows (map Q numbers to qnums)
- [ ] Extract description from first `<text>` block (~200 chars)
- [ ] Set `lastQuestionCreated` = max(qnum)
- [ ] Export dump after import
- [ ] Write tests: `src/__tests__/migrate.test.ts`
  - Parse sample question file → correct question + responses
  - Handle multi-response conversations
  - Handle `blocked_by:` lines
  - Handle `**RESOLVED**` header in Resolved files

**Verify**: `npm run migrate -- <path-to-Questions>` → `qr-tool status` shows correct counts matching folder counts (7 Resolved, 3 Awaiting, 142 Deferred). `qr-tool read 1` shows full conversation from Q0001.

---

## Stage 17: Setup & Integration

**Goal**: Fresh clone → working system in one command.

- [ ] Update `setup.sh`:
  - Check for `node`, `npm`
  - `cd review-agent-orchestrator && npm install && npm run build`
  - Create `Questions/` dir if missing
  - Import dump: `sqlite3 Questions/questions.db < Questions/questions.dump.sql` (if dump exists)
  - Otherwise: create from schema + seed
  - Create `.question-review-locks/` dir
- [ ] Create `Questions/.gitignore` — ignore `questions.db`, `questions.db-journal`, `questions.db-wal`
- [ ] Update agent prompt (`prompts/review-agent.md`):
  - Replace file-editing instructions with `qr-tool` commands
  - Document: `qr-tool read`, `qr-tool respond`, `qr-tool create`, `qr-tool block-by`
  - Remove all XML tag formatting rules
  - Remove `blocked_by:` file references
  - Remove pane title references
- [ ] Update `scripts/launch-agent.sh` to pass qnum (not filename) to agent
- [ ] Update `scripts/followup.sh` for new re-prompt format

**Verify**:
1. Delete `Questions/questions.db`
2. Run `./setup.sh` → DB rebuilt from dump
3. `npm run tui` → all questions present
4. `bash scripts/daemon.sh <project_root>` → daemon runs, agents spawn for Active questions
5. Agent runs `qr-tool read <qnum>` successfully in its pane

---

## Stage 18: Cleanup

**Goal**: Remove v1 artifacts, finalize git tracking.

- [ ] Archive old question files: `mv Questions/Awaiting Questions/archive/Awaiting` (etc.), or delete if migration verified
- [ ] Remove `scripts/review-questions.sh` (replaced by TypeScript daemon)
- [ ] Remove `Questions/questions_guidelines.md` (format rules no longer apply — TUI handles formatting)
- [ ] Remove `templates/agent_question_template.md`, `templates/user_question_template.md` (no more question files)
- [ ] Commit `Questions/questions.dump.sql` to git
- [ ] Verify `.gitignore` excludes: `dist/`, `node_modules/`, `questions.db`, `questions.db-*`
- [ ] Run full test suite: `npm test`

**Verify**: `git status` clean. Fresh clone + `setup.sh` → full working system. All tests pass.
