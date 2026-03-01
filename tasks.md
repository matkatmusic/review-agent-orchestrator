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

- [ ] Create `templates/schema.sql` (full schema: `metadata`, `questions`, `responses`, `dependencies` tables + indexes)
- [ ] Create `templates/seed.sql` (getting-started question + `lastQuestionCreated` metadata row)
- [ ] Create `src/db.ts` — `DB` class: `open()`, `close()`, `migrate()`, `seed()`, `run()`, `get()`, `all()`, `isDirty()`, `exportDump()`, `importDump()`
- [ ] Write tests: `src/__tests__/db.test.ts`
  - Creates DB in temp dir
  - Runs schema migration
  - Seeds data
  - Exports dump → delete DB → import dump → data intact
  - `isDirty()` tracks write operations

**Verify**: `npm test -- db.test` — all pass. Round-trip dump/import preserves all data.

---

## Stage 3: Core CRUD — Questions

**Goal**: Create, read, update, list questions.

- [ ] Create `src/questions.ts` — `createQuestion()`, `getQuestion()`, `listByStatus()`, `listAll()`, `updateStatus()`, `getActiveCount()`, `getGroup()`, `isGroupResolved()`
- [ ] `createQuestion()` increments `lastQuestionCreated` in metadata, inserts row, returns qnum
- [ ] Write tests: `src/__tests__/questions.test.ts`
  - Create question → returned qnum = lastQuestionCreated
  - Create multiple → qnums increment
  - List by status filters correctly
  - Update status transitions
  - Group resolution: all resolved = true, partial = false

**Verify**: `npm test -- questions.test` — all pass.

---

## Stage 4: Core CRUD — Responses

**Goal**: Add and list responses for a question.

- [ ] Create `src/responses.ts` — `addResponse()`, `listResponses()`, `getLatestResponse()`, `hasUnreadAgentResponse()`
- [ ] `hasUnreadAgentResponse()`: last response is from `agent` and no subsequent `user` response exists (used for TUI `✱` marker)
- [ ] Write tests: `src/__tests__/responses.test.ts`
  - Add response → appears in list
  - Responses ordered by `created_at`
  - `hasUnreadAgentResponse()` logic correct
  - Responses tied to correct qnum (FK constraint)

**Verify**: `npm test -- responses.test` — all pass.

---

## Stage 5: Core CRUD — Dependencies

**Goal**: Blocking relationships with correct resolution logic.

- [ ] Create `src/dependencies.ts` — `addBlocker()`, `removeBlocker()`, `isBlocked()`, `getBlockers()`, `getBlocked()`, `blockByGroup()`
- [ ] `isBlocked()` checks if ANY blocker has status != `Resolved`
- [ ] `blockByGroup()` expands group to individual qnums via query
- [ ] Write tests: `src/__tests__/dependencies.test.ts`
  - Add blocker → `isBlocked()` returns true
  - Resolve blocker → `isBlocked()` returns false
  - Multiple blockers: blocked until ALL resolved
  - Self-reference rejected (CHECK constraint)
  - `blockByGroup()` creates correct dependency rows
  - Group partially resolved → still blocked
  - `getBlockers()`/`getBlocked()` return correct questions

**Verify**: `npm test -- dependencies.test` — all pass.

---

## Stage 6: Pipeline

**Goal**: Status transition logic works correctly in isolation.

- [ ] Create `src/pipeline.ts` — `enforceBlocked()`, `autoUnblock()`, `promoteAwaiting()`, `runPipeline()`
- [ ] `enforceBlocked()`: query Awaiting/Active questions, check `isBlocked()`, move to Deferred
- [ ] `autoUnblock()`: query Deferred questions WITH dependency entries, check if all resolved, move to Awaiting
- [ ] `promoteAwaiting()`: move Awaiting → Active up to `maxAgents - activeCount`
- [ ] User-deferred (no dependency entries) must NOT auto-unblock
- [ ] Write tests: `src/__tests__/pipeline.test.ts`
  - Blocked Active question → moved to Deferred
  - Blocked Awaiting question → moved to Deferred
  - All blockers resolved → Deferred moves to Awaiting
  - User-deferred question (no deps) stays in Deferred
  - Promote respects MAX_AGENTS capacity
  - Full pipeline runs in correct order (enforce → unblock → promote)

**Verify**: `npm test -- pipeline.test` — all pass.

---

## Stage 7: Pending Queue

**Goal**: Agents can write actions to `.pending/`; daemon processes them into the DB.

- [ ] Create `src/pending.ts` — `writePending()`, `processPendingQueue()`
- [ ] Pending file format: JSON, one action per file, filename = `<timestamp>-<random>.json`
- [ ] Actions: `respond`, `block-by`, `block-by-group`, `add-to-group`, `create`
- [ ] `processPendingQueue()`: read all files, apply each to DB, delete processed files
- [ ] Write tests: `src/__tests__/pending.test.ts`
  - Write pending → file created in `.pending/`
  - Process queue → action applied to DB, file deleted
  - Multiple pending files processed in timestamp order
  - Invalid action file → logged and skipped (not crash)

**Verify**: `npm test -- pending.test` — all pass.

---

## Stage 8: Config

**Goal**: Load configuration from `config.sh`, environment, or defaults.

- [ ] Create `src/config.ts` — `loadConfig()`, `resolveProjectRoot()`
- [ ] Config sources (priority): env vars > `config.local.sh` > `config.sh` > defaults
- [ ] `resolveProjectRoot()`: derive from tool's own location (walk up to find `Questions/` dir)
- [ ] Validate: required paths exist, `maxAgents` > 0, etc.
- [ ] Write tests: `src/__tests__/config.test.ts`
  - Defaults applied when no config file
  - Env vars override config file
  - Project root resolution from submodule location

**Verify**: `npm test -- config.test` — all pass.

---

## Stage 9: CLI Tool (`qr-tool`)

**Goal**: Fully working CLI for agents and users. First usable entry point.

- [ ] Create `src/qr-tool.ts` using `commander`
- [ ] Read commands (hit DB directly):
  - `read <qnum>` — print question + full response history, formatted
  - `list [--status <s>] [--group <g>]` — tabular question list
  - `info <qnum>` — question details + blockers/blocked
  - `status` — summary counts by status
- [ ] Write commands (write to `.pending/`):
  - `respond <qnum> <body>` — submit agent/user response
  - `create <title> <description> [--group <name>]` — new question
  - `block-by <blocked> <blocker>` — add dependency
  - `block-by-group <blocked> <group>` — block by group
  - `add-to-group <qnum> <group>` — set group
- [ ] Add shebang + make executable: `#!/usr/bin/env node`
- [ ] Integration test: `src/__tests__/qr-tool.test.ts`
  - Create question via CLI → exists in DB after pending processed
  - Read question → output includes title and responses
  - Block-by → dependency exists after pending processed
  - List with filters → correct output

**Verify**: `npm test -- qr-tool.test` — all pass. Manual test: `node dist/qr-tool.js create "test" "test description"` produces pending file.

---

## Stage 10: Tmux Integration

**Goal**: Can spawn, kill, and communicate with tmux panes programmatically.

- [ ] Create `src/tmux.ts` — `hasSession()`, `createSession()`, `splitWindow()`, `killPane()`, `sendKeys()`, `capturePaneTail()`, `listPanes()`
- [ ] All functions shell out to `tmux` CLI (via `child_process.execSync`)
- [ ] Error handling: tmux not installed, session doesn't exist, pane already dead
- [ ] Write tests: `src/__tests__/tmux.test.ts` (integration — requires tmux)
  - Create session → exists
  - Split window → pane ID returned
  - Send keys → captured in pane output
  - Kill pane → no longer listed
  - Graceful error when session doesn't exist

**Verify**: `npm test -- tmux.test` — all pass (skip in CI if no tmux).

---

## Stage 11: Agent Lifecycle

**Goal**: Spawn agents for Active questions, re-prompt on new responses, manage lockfiles.

- [ ] Create `src/agents.ts` — `spawnAgent()`, `repromptAgent()`, `isAgentRunning()`, `cleanupStaleLocks()`, `createLockfile()`, `removeLockfile()`
- [ ] `spawnAgent()`: create worktree, write lockfile, spawn claude in tmux pane with initial message
- [ ] `repromptAgent()`: send "NEW USER RESPONSE" message to existing pane via `sendKeys()`
- [ ] `isAgentRunning()`: check lockfile exists AND pane still alive
- [ ] `cleanupStaleLocks()`: remove lockfiles where pane is dead
- [ ] Lockfile format: JSON `{ paneId, qnum, headCommit }`
- [ ] Lockfile location: `<projectRoot>/.question-review-locks/Q<num>.lock`
- [ ] Write tests: `src/__tests__/agents.test.ts`
  - Lockfile creation/removal
  - Stale lockfile detection (pane ID doesn't exist)
  - Spawn builds correct claude CLI command

**Verify**: `npm test -- agents.test` — all pass.

---

## Stage 12: Daemon

**Goal**: Full scan cycle runs end-to-end. The system works without a TUI.

- [ ] Create `src/daemon.ts` — `scanCycle()`, `main()`
- [ ] Scan cycle: pending queue → pipeline → spawn/re-prompt → cleanup → export dump if dirty
- [ ] `main()`: single invocation (called by `daemon.sh` in a loop)
- [ ] Create `scripts/daemon.sh` — thin bash wrapper with sleep loop
- [ ] Logging: `[review] <message>` format to stderr
- [ ] Detect new commits on main branch → send rebase signal to agents
- [ ] Write tests: `src/__tests__/daemon.test.ts`
  - Full cycle with seeded DB: pending processed, pipeline runs, dump exported
  - No-op cycle: dump NOT re-exported
  - Dirty tracking: response added → dump exported

**Verify**: `npm test -- daemon.test` — all pass. Manual test: `node dist/daemon.js <project_root>` runs one cycle, creates/updates `questions.dump.sql`.

---

## Stage 13: TUI — Dashboard

**Goal**: Navigable question list with status filtering.

- [ ] Create `src/tui/app.tsx` — root component, screen router
- [ ] Create `src/tui/dashboard.tsx` — question list with status tabs, `✱` new-response markers
- [ ] Keyboard: arrow keys navigate, Tab switches status filter, Enter opens detail, `n` new, `d` defer, `r` resolve, `q` quit
- [ ] Reads DB directly (read-only for display)
- [ ] Status bar: counts per status

**Verify**: `npm run tui` — dashboard renders, questions listed, keyboard navigation works, status filtering works.

---

## Stage 14: TUI — Question Detail

**Goal**: View conversation history and submit responses.

- [ ] Create `src/tui/detail.tsx` — scrollable response history, input box
- [ ] Response bubbles: agent vs user visually distinct, timestamps shown
- [ ] Input: text input at bottom, Enter sends (writes to DB directly — TUI is a trusted writer, not via pending queue)
- [ ] Keyboard: Esc back to dashboard, `d` defer, `r` resolve
- [ ] Shell out to `$EDITOR` for long responses (optional, future enhancement)

**Verify**: Open question in TUI → see full conversation. Type response → appears in DB (`qr-tool read <qnum>` confirms). Agent response shows `✱` until user responds.

---

## Stage 15: TUI — New Question

**Goal**: Create questions from the TUI.

- [ ] Create `src/tui/create.tsx` — form with title, description, optional group, optional blocked-by
- [ ] Writes to DB directly (TUI is trusted)
- [ ] After creation: navigate to the new question's detail view

**Verify**: Create question in TUI → `qr-tool list` shows it. Blocked-by field creates dependency rows.

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
