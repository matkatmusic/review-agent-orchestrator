# Debate Q2: Second-Round Review — Are the D1-D15 Resolutions Sound?

**Date**: 2026-03-02
**Style**: Second-round review (1 round, post-resolution)
**Participants**: Claude (Opus 4.6), Gemini (3 Pro Preview), Codex (GPT-5.3)

---

## Claude (Opus 4.6)

### PRIOR ISSUES — ADEQUATELY RESOLVED?
- **D4 (signal reliability)**: Incomplete — "N seconds" retry unspecified, no max retry count, crashed agent causes infinite retry loop. Needs retry ceiling + escalation to user.
- **D12 (teardown commit)**: Incomplete — no auto-timeout on dirty tree polling. Stuck agent blocks indefinitely. Needs configurable timeout (e.g., 30s) + user alert.
- **D3 (resolve flow)**: Incomplete — no fallback if selected strategy fails at resolve time. Should leave branch intact and alert user rather than risk corrupting unstaged state.
- Remaining 11 resolutions (D1, D2, D5, D6, D7, D8, D10, D11, D13, D14, D15) are clean.

### NEW FAILURE POINTS
- **cancel_and_send assumes C-c reliably interrupts Claude Code.** V1 worked on bash scripts; Claude Code is a complex Node process with tool-call lifecycle. C-c may be swallowed mid-tool-call. Must validate in Phase 5.
- **issue.md is unprotected in the worktree.** Agent has Write(*) permissions. Accidental modification breaks orchestrator's rewrite cycle. CLAUDE.md should instruct "never modify issue.md directly."
- **Phase 3.3 depends on cancel_and_send from Phase 5.** Teardown signal-then-poll can't be tested without tmux module. Forward dependency.
- **Auto re-block transitivity unspecified.** If I-1 blocks I-2 blocks I-3 and I-1 reopens: I-2 re-blocks (direct row), but does scan cycle then re-block I-3? Needs to be explicit and tested.
- **D9 (index.lock) deserves a mitigation.** Worktree-specific index files mitigate `git status`, but `git commit` touches shared refs. Minimum: retry with backoff on lock errors.

### IMPLEMENTATION ORDER
- Phase 3.3 → Phase 5 forward dependency: cancel_and_send needed before it's built.
- cancel_and_send utility should be built once in Phase 5.1, reused by 7.1 and 10.3.

### VERDICT
Design has materially improved. Remaining gaps are implementation details (timeouts, retry limits, phase ordering), not architectural flaws. Highest-risk item: validating cancel_and_send against Claude Code's actual interrupt behavior. Ready for implementation with minor adjustments.

---

## Gemini (3 Pro Preview)

### PRIOR ISSUES — ADEQUATELY RESOLVED?
- **D1, D2, D4, D5, D6, D8, D11, D13, D14, D15**: Adequately resolved. Recursive CTEs and aidi ack are particularly robust.
- **D3 (resolve flow)**: Resolved with caveat — if none of the 4 strategies work without human intervention, resolve flow degrades into a manual merge queue. Timeline risk.
- **D12 (teardown commit)**: Resolved with caveat — introduces severe deadlock risk. Agent hallucinates/loops → orchestrator polls indefinitely → issue state freezes. Needs 60-90s timeout + auto force-kill or "Error/Manual Intervention Required" status.

### NEW FAILURE POINTS
- **D9 (index.lock) is critical and needs a safe-git wrapper.** All git invocations (orchestrator + agent) must retry with exponential backoff on index.lock errors for up to ~10s.
- **Teardown deadlocks.** Strict timeout needed. If tree not clean within 60-90s, force-kill with `git reset --hard` or flag for manual intervention.
- **TUI event loop starvation.** cancel_and_send and git polling involve synchronous shell executions. If done via `execSync`, Ink TUI freezes completely during scan cycles. All shell interactions must be async (`exec`/`spawn` wrapped in Promises).
- **Session recovery crash mid-teardown.** If orchestrator crashes while polling for clean tree, DB says Active but agent may have committed and stopped. On restart, must verify Active issues have running agents; if pane gone but worktree clean, infer interrupted transition and clean up.

### IMPLEMENTATION ORDER
- **Phase 3/4 can't be functionally tested until Phase 10.** Phase 3 builds signal-then-poll teardown, Phase 5 spawns bare agents with no instructions, Phase 10 gives commit-on-signal instructions. Bare agents won't respond to teardown signals. Fix: move CLAUDE.md commit-on-signal instructions to Phase 5, or use a mock agent script.
- **Missing git retry wrapper phase.** Must be implemented before Phase 3 (worktree management).
- **Phase 11 (resolve strategies) is too late.** Highest remaining technical risk. Move empirical evaluation to Phase 4-5 using mock worktrees.

### VERDICT
Conditionally ready for implementation. Core state machine is robust. Must implement git index.lock retry wrapper, enforce async shell execution, and add timeout bounds to teardown polling. Address phase mismatches and clear to begin Phase 0.

---

## Codex (GPT-5.3)

### PRIOR ISSUES — ADEQUATELY RESOLVED?
- **Truly resolved (7)**: D2, D7, D8, D11 fully resolved. D6, D13, D14 mostly resolved.
- **Partially/conditionally resolved (6)**:
  - D1: "skip if running" can hide starvation under load
  - D3: lacks acceptance criteria (success rate, conflict coverage, rollback path)
  - D4: ack lacks version/freshness token — stale ack can satisfy retry for old content
  - D5: interrupt-before-rewrite solves race but not crash safety (truncated write if orchestrator dies mid-write)
  - D12: infinite wait on dirty tree without bounded timeout
  - D15: high blast radius — defaultMode: acceptEdits + broad bash permissions
- **Unresolved (1)**: D9 remains critical.
- D10: TODOs are not design closure — needs concrete lifecycle triggers.

### NEW FAILURE POINTS
- **Ack correctness gap.** `aidi ack <inum>` confirms identity, not message freshness. Needs monotonic `issue_revision` or content hash. `ack <inum> <revision>` validates exact match.
- **Non-atomic issue.md rewrites.** Race is solved, durability is not. Orchestrator crash mid-write → truncated file. Use write-to-temp + fsync + rename.
- **BEGIN IMMEDIATE transaction scope risk.** If transitions include orchestration side effects (signals, polling, git), DB write locks held too long → backpressure on aidi.
- **index.lock contention worsened by polling.** Frequent `git status --porcelain` during teardown collides with agent commits/rebases in shared .git internals.
- **Session recovery identity ambiguity.** Pane IDs/titles not robust after restarts. Needs hard identity token (pane env var or session UUID).
- **Direct channel context divergence.** Agents act on tmux-only instructions not in DB/issue.md — undermines reproducibility and makes ack indicators misleading.

### IMPLEMENTATION ORDER
- Move D9 mitigation before Phase 3/4. Lock contention controls needed before teardown/cascade.
- Shift ack/retry plumbing from Phase 2 to Phase 10 (or add test harness in Phase 2). No real agent in Phase 2 to test against.
- Define bounded teardown (max wait + escalation) in Phase 7/10.
- Front-load resolve strategy acceptance rubric before Phase 11 execution — define success metrics first.

### VERDICT
Substantially improved and much closer to implementable, but not fully ready for production-grade execution flow. Remaining blocker: D9 plus three unspecified reliability invariants (ack freshness, atomic file writes, DB transaction boundaries). Tighten those and adjust phase ordering → sound for iterative implementation.

---

## Cross-Model Consensus

### Unanimous (all 3 models flagged)
1. **Teardown polling needs a bounded timeout + escalation.** "Dirty → wait" has no ceiling. Stuck agent blocks indefinitely. All three demand a configurable timeout (30-90s) with user notification or force-kill.
2. **D9 (index.lock contention) needs active mitigation, not just acknowledgment.** Retry with exponential backoff on lock errors. Must be in place before Phase 3.
3. **cancel_and_send behavior against Claude Code is unvalidated.** V1 worked on bash; Claude Code's interrupt behavior during tool calls is unknown. Must validate early (Phase 5).
4. **Phase 3 teardown can't be fully tested until agents have commit-on-signal behavior (Phase 10).** Forward dependency: either move CLAUDE.md instructions earlier or use mock agent scripts.

### Raised by 2 of 3 models
5. **D3 resolve strategy needs acceptance criteria + fallback path** (Claude + Codex). If selected strategy fails at resolve time, leave branch intact and alert user.
6. **Ack needs version/freshness token, not just inum** (Claude + Codex). Stale ack could satisfy retry for outdated content. Monotonic revision or content hash.
7. **issue.md writes need crash safety** (Codex + implicitly Gemini via session recovery). Write-to-temp + fsync + rename for durability.
8. **cancel_and_send should be built in Phase 5.1 and reused by Phases 7.1 and 10.3** (Claude + Gemini).
9. **BEGIN IMMEDIATE scope must exclude external calls** (Codex + Gemini). Transaction should cover only the DB state change; signals/polling happen outside the transaction.
10. **Auto re-block can forcibly re-block active dependents** — behavior surprise (Claude + Codex flagged).

### Unique concerns (1 model only)
11. **issue.md unprotected from agent writes** — CLAUDE.md should instruct "never modify issue.md" (Claude)
12. **Session recovery needs hard identity token (env var/UUID)** — pane IDs not robust after restarts (Codex)
13. **Crash mid-teardown recovery** — Active with no pane + clean worktree → infer interrupted transition (Gemini)
14. **TUI event loop starvation from synchronous shell calls** — all shell interactions must be async (Gemini)
15. **Direct channel creates context divergence** — undermines reproducibility and ack indicators (Codex)
16. **D10 TODOs are not design closure** — needs concrete lifecycle triggers (Codex)
17. **D15 permissions have high blast radius by design** (Codex)
18. **Phase 11 resolve evaluation is too late** — move to Phase 4-5 with mock worktrees (Gemini)

---

## Recommended Actions (prioritized)

### Must address before implementation
1. **Add bounded teardown timeout** — configurable (e.g., 60s), escalate to user TUI notification, force-kill escape hatch becomes auto-triggered at timeout
2. **Implement git retry-with-backoff wrapper** — catch index.lock errors, exponential backoff up to ~10s, used by both orchestrator and agent git calls. Build in Phase 3 or earlier.
3. **Validate cancel_and_send against Claude Code** — explicit Phase 5 acceptance criterion: send C-c during active tool call, verify agent stops and pane shows expected idle state

### Should address in design
4. **Add ack freshness token** — monotonic `issue_revision` counter or content hash; `aidi ack <inum> <revision>`; orchestrator validates exact match
5. **Use atomic file writes for issue.md** — write-to-temp + fsync + rename, protects against orchestrator crash mid-write
6. **Scope BEGIN IMMEDIATE narrowly** — DB state change only; signals, polling, git calls happen outside the transaction
7. **Resolve Phase 3 → Phase 5 forward dependency** — build cancel_and_send in Phase 5.1, stub or mock in Phase 3.3 tests
8. **Add "never modify issue.md" instruction to CLAUDE.md**
9. **Define D3 resolve strategy acceptance criteria** — success metrics before empirical evaluation, explicit fallback (leave branch intact) if selected strategy fails

### Can defer to implementation
10. Auto re-block transitivity — verify scan cycle handles transitive chains naturally via iterative re-evaluation
11. Session recovery hard identity token (env var injected at pane creation)
12. Crash mid-teardown recovery logic (Active + no pane + clean tree → transition to Awaiting)
13. Move Phase 11 resolve evaluation earlier (Phase 4-5 with mock worktrees)
14. D10 concrete branch lifecycle triggers
