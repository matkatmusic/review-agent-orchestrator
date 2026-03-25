Plans Audit — 2026-03-23 (revised after deep verification)

FULLY IMPLEMENTED (confirmed by code inspection)
==================================================
- STEP_1.5d_PLAN.txt — all 4 schema migration columns present in sql/schema.sql
- Message_threads.excalidraw — diagram only, no code to verify
- Message_threads_excalidraw.txt — diagram reference only, no code to verify

RECLASSIFIED (originally marked "fully implemented", verification found gaps)
==============================================================================
Highlight-Blocking-Issues-plan.md (80%)
  done: COL.info, Header "Info", InfoMarker component, flashingBlockerInums state, UnreadMarker deleted
  gap: hint row renders as header subtitle not dimmed row per plan; 'b' character not rendered in Info column (blocking indicated via title flash instead); blockingFlash/blockedBySelectedFlash props exist on InfoMarker but are unused in render output

Phase1.5_mock_backend_plan.txt (30%)
  done: Step 0 only — mock-store.ts (load/save/reset), mock-data.json, --resetMockData flag
  gap: Steps 1-6 all incomplete — 4 view render cases missing from app.tsx, makeResponseNode not exported, onSend is empty stub, onActivate/onDefer/onResolve are empty callbacks, onGroupChange/onBlockedByChange not wired

Phase1.5_mock_backend_step1.txt (0%)
  done: nothing
  gap: 4 view render cases (NewIssue, AgentStatus, BlockingMap, GroupView) absent from app.tsx switch; handleGlobalKey not called in agent-status.tsx, blocking-map.tsx, or group-view.tsx

v2.1.discussion.md (85%)
  done: single-process architecture, containers table with type+parent_id, issue_containers join table, config.json
  gap: IssueStatus enum has 7 states (Active, InQueue, Blocked, Deferred, Resolved, Trashed, Inactive) vs plan's 5 (Active, Awaiting, Blocked, Deferred, Resolved); "Awaiting" renamed to "InQueue"

PARTIALLY IMPLEMENTED
======================
TUI_REWRITE_PLAN.txt (15%)
  done: Phase 0 scaffolding (79 items), test harness, hotkeys, types
  remaining: Phases 1-3 (481 items) — view completion, feature rollout

keypress_handling.txt + keypress_handling_impl.txt (3-50%)
  done: removed app-level useInput, deleted VIEW_OWNED_KEYS, views accept callbacks
  remaining: views not calling handleGlobalKey, global shortcuts (s/b/g/q) not wired per view, Phase B focus regions deferred

trash_view_plan.md (60%)
  done: trash-view.tsx (292 lines), trash-view.test.tsx (545 lines), ViewType.Trash enum
  remaining: app.tsx render switch missing Trash case, footer shortcuts missing, mock data has no trashed issues

message_threads_plan.md + message_threads.txt + Message_threads_plan_v2.txt (70%)
  done: paragraph-utils.ts + tests, thread-builders.ts, Response/Message types, ResponseContainer threading UI, ResponseChain viewport, footer keybindings, DetailView enterThread/exitThread/resolveThread
  remaining: ViewType.Thread not in enum, app.tsx Thread case missing, quoted_response_id missing from schema, no tests for thread-builders.ts

v2.1.md + v2.1.implementation_order.md (60-75%)
  done: DB layer complete, TUI framework (6 views), mock backend, 5-state lifecycle
  remaining: agent communication channels, worktree management, Phase 2+ agent integration

v2.1.threaded_issue_md_todo.txt (40%)
  done: thread columns in schema, response.create() accepts opts
  remaining: response-tree hydrator, issue.md serializer, atomic writer, aidi --reply-to flag, tmux sendKeys, integration tests

Phase1.6_detail_view_update.txt (15%)
  done: thread footer shortcuts partially cleaned
  remaining: Separator/LabeledSeparator components, tab cycling between fields, Up/Down scrolling in text input + response list, quote tracking, resolved-thread collapse

node_only_plan.md (85%)
  done: daemon.ts, agents.ts, setup.ts, reset.ts all ported to TypeScript
  remaining: delete scripts/ directory (setup.sh, daemon.sh still exist)

NOT IMPLEMENTED
================
ViewBase_migration.txt (0%)
  plan: abstract ViewBase class to consolidate view metadata (subtitles, shortcuts, labels)
  impact: app.tsx has 6 identical callback sets copy-pasted; footer/header have hardcoded switches

merge redesign.md (0%)
  plan: SQLite WAL mode for dual TUI+daemon writes, shared DB access, event polling
  status: architectural redesign not started

REFERENCE ONLY (no action needed)
===================================
- TUI_REWRITE_REQUIREMENTS.txt — functional spec (AP-001+), use for validation
- Roadmap.txt — documents current state + known failures
- message_threads_plan.txt — 51-byte stub, superseded by message_threads_plan.md


VERIFICATION CHECKLISTS
=========================
Pass/fail checks for each plan. Run from repo root.
[x] = confirmed passing, [ ] = confirmed failing or unverified

Highlight-Blocking-Issues-plan.md
  [x] COL.info defined — grep "info:" src/tui/home-view.tsx
  [x] Header renders "Info" — grep "HeaderColumns.Info" src/tui/home-view.tsx
  [ ] Dimmed hint row with legend — grep "'\\*' unread" src/tui/home-view.tsx (FAILS: text exists but as header subtitle, not dimmed row)
  [x] InfoMarker component — grep "function InfoMarker" src/tui/home-view.tsx
  [ ] InfoMarker renders 'b' — inspect InfoMarker render body for 'b' output (FAILS: props exist but 'b' not rendered)
  [x] InfoMarker renders '*' — inspect InfoMarker for unread '*' output
  [x] InfoMarker renders 'i' — inspect InfoMarker for needsInput 'i' output
  [x] flashingBlockerInums state — grep "flashingBlockerInums" src/tui/home-view.tsx
  [x] UnreadMarker fully removed — grep -r "UnreadMarker" src/tui/ returns 0
  [x] Test A: header shows Info — grep "Info" src/tui/home-view.test.tsx
  [x] Test B: hint/legend text — grep "unread.*needs input" src/tui/home-view.test.tsx
  [ ] Test C: 'b' indicator for blockers — (no test asserts 'b' character in Info column)
  [ ] Test D: 'b' flash on blocked selection — (no test for flash-on-selection)
  [ ] Test E: flash stops on cursor leave — (no test for flash-stop)

Phase1.5_mock_backend_plan.txt
  [x] mock-store.ts exists — ls src/tui/mock-store.ts
  [x] loadMockData exported — grep "export function loadMockData" src/tui/mock-store.ts
  [x] saveMockData exported — grep "export function saveMockData" src/tui/mock-store.ts
  [x] resetMockData exported — grep "export function resetMockData" src/tui/mock-store.ts
  [x] --resetMockData flag — grep "resetMockData" src/tui/run.tsx
  [x] mock-data.json exists — ls data/mock-data.json
  [ ] NewIssue render case — grep "ViewType.NewIssue" in app.tsx switch (FAILS: absent)
  [ ] AgentStatus render case — grep "ViewType.AgentStatus" in app.tsx switch (FAILS: absent)
  [ ] BlockingMap render case — grep "ViewType.BlockingMap" in app.tsx switch (FAILS: absent)
  [ ] GroupView render case — grep "ViewType.GroupView" in app.tsx switch (FAILS: absent)
  [ ] makeResponseNode exported — grep "export.*makeResponseNode" src/tui/thread-builders.ts (FAILS: internal only)
  [ ] onSend appends to chain — inspect detail.tsx handleInputSubmit (FAILS: calls props.onSend which is empty stub in app.tsx)
  [ ] onSend persists to JSON — grep "saveMockData" src/tui/detail.tsx (FAILS: no reference)
  [ ] onActivate mutates status — grep "IssueStatus" near "onActivate" in app.tsx (FAILS: empty callback)
  [ ] onDefer mutates status — (FAILS: empty callback)
  [ ] onResolve mutates status — (FAILS: empty callback)
  [ ] onGroupChange wired — grep "onGroupChange" in app.tsx render (FAILS: not passed)
  [ ] onBlockedByChange wired — grep "onBlockedByChange" in app.tsx render (FAILS: not passed)

Phase1.5_mock_backend_step1.txt
  [ ] NewIssue render case — (FAILS: absent from app.tsx)
  [ ] AgentStatus render case — (FAILS: absent)
  [ ] BlockingMap render case — (FAILS: absent)
  [ ] GroupView render case — (FAILS: absent)
  [ ] handleGlobalKey in agent-status.tsx — grep "handleGlobalKey" src/tui/agent-status.tsx (FAILS: not imported)
  [ ] handleGlobalKey in blocking-map.tsx — grep "handleGlobalKey" src/tui/blocking-map.tsx (FAILS: not imported)
  [ ] handleGlobalKey in group-view.tsx — grep "handleGlobalKey" src/tui/group-view.tsx (FAILS: not imported)
  [ ] 5 navigation tests pass — npx vitest run src/tui/app.test.tsx (FAILS: views don't render)

STEP_1.5d_PLAN.txt
  [x] responding_to_id column — grep "responding_to_id" sql/schema.sql
  [x] replying_to_id column — grep "replying_to_id" sql/schema.sql
  [x] is_continuation column — grep "is_continuation" sql/schema.sql
  [x] thread_resolved_at column — grep "thread_resolved_at" sql/schema.sql

v2.1.discussion.md
  [x] IssueStatus enum exists — grep "enum IssueStatus" src/types.ts
  [x] containers table — grep "CREATE TABLE.*containers" sql/schema.sql
  [x] issue_containers join — grep "CREATE TABLE.*issue_containers" sql/schema.sql
  [x] config.json exists — ls config.json
  [ ] IssueStatus matches plan — plan: 5 states (Awaiting); code: 7 states (InQueue, +Trashed, +Inactive)

keypress_handling.txt + keypress_handling_impl.txt
  [x] app-level useInput removed — grep "useInput" src/tui/app.tsx returns 0
  [x] VIEW_OWNED_KEYS deleted — grep "VIEW_OWNED_KEYS" src/tui/ returns 0
  [x] views accept onNavigate/onBack/onQuit props — grep "onBack" src/tui/detail.tsx
  [ ] views call handleGlobalKey — grep "handleGlobalKey" src/tui/home-view.tsx (FAILS: only old-home-view.tsx has it)
  [ ] global shortcuts s/b/g/q work from all views — (FAILS: not wired)

trash_view_plan.md
  [x] trash-view.tsx exists — ls src/tui/trash-view.tsx
  [x] trash-view.test.tsx exists — ls src/tui/trash-view.test.tsx
  [x] ViewType.Trash in enum — grep "Trash" src/tui/views.ts
  [ ] Trash case in app.tsx switch — grep "ViewType.Trash" in app.tsx render (FAILS: absent)
  [ ] Footer shortcuts for Trash — grep "Trash" src/tui/footer.tsx (FAILS: no entry)
  [ ] Mock data has trashed issues — grep "trashed_at" data/mock-data.json for non-null values (FAILS: all null)

message_threads_plan.md
  [x] paragraph-utils.ts exists — ls src/tui/paragraph-utils.ts
  [x] paragraph-utils.test.ts exists — ls src/tui/paragraph-utils.test.ts
  [x] thread-builders.ts exists — ls src/tui/thread-builders.ts
  [x] Response/Message types — grep "interface Response" src/types.ts
  [x] enterThread in detail.tsx — grep "enterThread" src/tui/detail.tsx
  [x] exitThread in detail.tsx — grep "exitThread" src/tui/detail.tsx
  [x] resolveThread in detail.tsx — grep "resolveThread" src/tui/detail.tsx
  [ ] ViewType.Thread in enum — grep "Thread" src/tui/views.ts (FAILS: absent)
  [ ] quoted_response_id in schema — grep "quoted_response_id" sql/schema.sql (FAILS: absent)
  [ ] thread-builders tests — ls src/tui/thread-builders.test.ts (FAILS: no file)

v2.1.md + v2.1.implementation_order.md
  [x] DB layer: database.ts — ls src/db/database.ts
  [x] DB layer: issues.ts — ls src/db/issues.ts
  [x] DB layer: responses.ts — ls src/db/responses.ts
  [x] DB layer: containers.ts — ls src/db/containers.ts
  [x] 6 view components exist — ls src/tui/{home-view,detail,newissue,agent-status,blocking-map,group-view}.tsx
  [x] mock-store.ts — ls src/tui/mock-store.ts
  [ ] agent communication — (NOT STARTED)
  [ ] worktree management — (NOT STARTED)

v2.1.threaded_issue_md_todo.txt
  [x] thread columns in schema — grep "responding_to_id" sql/schema.sql
  [ ] response-tree hydrator — ls src/db/response-tree.ts (FAILS: no file)
  [ ] issue.md serializer — ls src/serializer/issue-md.ts (FAILS: no directory)
  [ ] atomic writer — ls src/serializer/atomic-write.ts (FAILS: no directory)
  [ ] aidi --reply-to — grep "reply-to" src/cli/aidi.ts (FAILS: no flag)

Phase1.6_detail_view_update.txt
  [ ] Separator component — grep "Separator" src/tui/ for component (FAILS: no file)
  [ ] Tab cycling — grep "cycleFocus\|tabCycle" src/tui/detail.tsx (partial — cycleFocus exists but not fully wired)
  [ ] Quote tracking — grep "quoted" src/tui/detail.tsx (FAILS)
  [ ] Resolved-thread collapse — grep "collapse" src/tui/detail.tsx (FAILS)

node_only_plan.md
  [x] daemon.ts — ls src/daemon.ts
  [x] agents.ts — ls src/agents.ts
  [x] setup.ts — ls src/setup.ts
  [x] reset.ts — ls src/reset.ts
  [ ] scripts/ deleted — ls scripts/ (FAILS: directory still exists)

ViewBase_migration.txt
  [ ] view-base.tsx exists — ls src/tui/view-base.tsx (FAILS: no file)

merge redesign.md
  [ ] WAL mode configured — grep "WAL\|wal" src/db/ (FAILS: not implemented)


UNIMPLEMENTED FEATURES — CONCRETE TASK LIST
=============================================

1. TRASH VIEW INTEGRATION
   - Add ViewType.Trash case to app.tsx render switch
   - Add VIEW_SHORTCUTS[ViewType.Trash] to footer.tsx
   - Add trashed issues to mock data for testing
   Files: src/tui/app.tsx, src/tui/footer.tsx, data/mock-data.json

2. GLOBAL KEY WIRING
   - Wire handleGlobalKey into each view's useInput handler
   - Ensure s/b/g/q/n shortcuts work from every view
   Files: src/tui/home-view.tsx, detail.tsx, newissue.tsx, agent-status.tsx, blocking-map.tsx, group-view.tsx

3. VIEWBASE MIGRATION
   - Create abstract ViewBase class (subtitles, shortcuts, labels)
   - Refactor 6 views to extend ViewBase
   - Remove hardcoded switches from header.tsx and footer.tsx
   - Eliminate callback duplication in app.tsx
   Files: new src/tui/view-base.tsx, then all view files

4. THREAD BUILDERS TESTS
   - Write tests for buildResponseChain, buildReplyChain, splitAgentMessage, buildMixedChain
   File: new src/tui/thread-builders.test.ts

5. RESPONSE SERIALIZATION PIPELINE
   - Build response-tree hydrator (src/db/response-tree.ts)
   - Build issue.md serializer (src/serializer/issue-md.ts)
   - Build atomic writer (src/serializer/atomic-write.ts)
   - Add quoted_response_id column to schema.sql

6. AIDI THREADING
   - Add --reply-to flag to aidi CLI
   - Wire response creation with thread params
   File: src/cli/aidi.ts

7. DETAIL VIEW POLISH (Phase1.6)
   - Separator/LabeledSeparator utility components
   - Tab cycling between input, header, response list, footer
   - Up/Down scrolling in text input + response list
   - Quote tracking and resolved-thread collapse

8. SHELL SCRIPT CLEANUP
   - Delete scripts/ directory (setup.sh, daemon.sh)
   - Verify no remaining references to shell scripts

9. MERGE REDESIGN (architectural)
   - SQLite WAL mode for concurrent TUI+daemon access
   - Event polling mechanism
   - Shared DB write protocol

10. AGENT INTEGRATION (Phase 2+)
    - Daemon scan cycle wiring to TUI
    - Agent prompt/signal delivery
    - Worktree management
    - Per-worktree CLAUDE.md generation

11. MOCK BACKEND WIRING (Phase1.5 Steps 1-6)
    - Add 4 view render cases to app.tsx (NewIssue, AgentStatus, BlockingMap, GroupView)
    - Export makeResponseNode from thread-builders.ts
    - Wire onSend to append responses + save to JSON
    - Wire onActivate/onDefer/onResolve to mutate issue status
    - Wire onGroupChange/onGroupCreate
    - Wire onBlockedByChange/onBlocksChange
    Files: src/tui/app.tsx, src/tui/thread-builders.ts, src/tui/detail.tsx

12. INFO COLUMN COMPLETION (Highlight-Blocking)
    - Render 'b' character in InfoMarker for blocking issues (currently props exist but aren't rendered)
    - Add dimmed hint row or verify header subtitle approach is intentional
    - Add tests C/D/E for 'b' indicator, flash-on-selection, flash-stop
    Files: src/tui/home-view.tsx, src/tui/home-view.test.tsx
