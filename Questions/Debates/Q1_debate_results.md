# Debate Q1: Is the v2.1 Design & Implementation Plan Sound?

**Date**: 2026-03-02
**Style**: Thorough review (1 round)
**Participants**: Claude (Opus 4.6), Gemini (3 Pro Preview), Codex (GPT-5.3)

---

## Claude (Opus 4.6)

### SOUND DECISIONS
- **Incremental build phases.** TUI-first with mock data (Phase 1) before DB (Phase 2) before agents (Phase 5) is disciplined. Each phase has a usable checkpoint.
- **Commit-to-branch worktree lifecycle.** Clean git semantics, cross-machine portable, no orphaned worktrees or fragile stashes.
- **Two-channel communication with strict separation.** Solves v1 token-waste. issue.md full-rewrite guarantees consistency.
- **SQLite WAL for multi-process writes.** Correct for the concurrency model.
- **User-controlled activation.** Eliminates v1 bug class where agents spawned despite blockers.

### HIDDEN FAILURE POINTS
- **"Agent commits all work" — who runs `git commit`?** Race condition between "kill pane" and "agent finishes commit." The orchestrator running the commit needs to handle dirty state, untracked files, partial work that may not compile.
- **Scan cycle in `useEffect`/`setInterval` will block Ink rendering.** DB reads, WAL writes, dump export, tmux health checks, dependency graph traversal — all synchronously on a 1-2s timer will cause TUI stuttering with 6 active agents.
- **issue.md rewrite race condition.** File rewrites aren't atomic. Agent mid-read could get corrupted context. Needs atomic write (write to temp, rename).
- **Session recovery is underspecified.** Tmux pane IDs change across server restarts. Recovery needs tmux session naming + pane title conventions, not just pane_id matching.
- **No agent health monitoring.** `isPaneAlive` only tells you the tmux pane exists, not that the claude process is responsive.
- **Resolve flow git mechanics are wrong.** `git diff worktree-I<#>..worktree-I<#>` is self-referential. Actual git mechanics of applying worktree branch changes unstaged are non-trivial.
- **aidi is Phase 13 but agents need it in Phase 10.** Dependency inversion.

### IMPLEMENTATION ORDER RISKS
- Phase 13 (aidi) should be Phase 0.5. Agents can't function without it.
- Phase 1 builds 6 views with mock data then Phase 2 rewires all 6. Consider building 2 core views, validate UX, then wire to DB immediately.
- Phase 5 (bare agent spawn) has limited value — merge with Phase 10.
- Phase 12 (install script) is very late for something needed to run the app.

### VERDICT
Design is strong where it matters most. Hidden failure points are concentrated in orchestration mechanics (commit-before-kill race, scan cycle blocking, file rewrite atomicity, aidi dependency inversion). None are architectural — all fixable during implementation if recognized early. Implementation order needs resequencing.

---

## Gemini (3 Pro Preview)

### SOUND DECISIONS
- **Worktree Lifecycle Management.** Using standard Git branches for teardown ensures state is durable, portable, and immune to accidental deletion.
- **Dual Communication Channels.** Elegantly solves v1 token-wastage. Treats the LLM agent like a human worker: ticket is source of truth, tmux is for pairing/debugging.
- **SQLite WAL & Single Process.** Drastically simplifies state management.
- **Per-Worktree Agent Permissions.** Vital security and operational boundary.

### HIDDEN FAILURE POINTS
- **Tmux signal IPC is highly volatile.** If Claude Code is actively generating output, blindly injecting keystrokes via `tmux send-keys` will result in garbled stdin, syntax errors, or ignored commands. No reliable way to know if agent is "ready" to receive keyboard input.
- **Event loop starvation in the TUI.** Synchronous filesystem I/O, SQLite queries, and Git operations in a 1-2s React render loop will cause TUI stutter, dropped keystrokes, unresponsive UI.
- **Git index/lock contention.** Multiple agents in sub-worktrees + orchestrator running git commands every 1-2 seconds risks `.git/index.lock` collisions. Worktrees share the same underlying `.git` directory.
- **"Apply unstaged" resolution is mechanically fragile.** Extracting changes from a branch and applying unstaged is susceptible to conflicts if main branch moved. Standard git merge would be safer.
- **Agent CLI context propagation.** How does `aidi` know which agent is calling? Needs environment variables (e.g., `CURRENT_ISSUE_ID`) injected during tmux spawn.
- **Branch accumulation.** `worktree-I<#>` branches are never explicitly deleted after Resolved. Permanent branch pollution.

### IMPLEMENTATION ORDER RISKS
- **Phase 10 (signal mechanism) is fundamentally misplaced.** Tmux send-keys reliability is the highest technical unknown. If it can't reliably interrupt Claude Code, the entire ticket channel fails. Should be Phase 0 or Phase 1.
- **Phase 7 (agent deletion) before Phase 10 (agent instructions).** Testing teardown on idle dummy shells won't reveal locked files or orphaned child processes from real Claude Code.
- **Phase 1 mock data then Phase 2 DB wiring.** Transition from sync mock data to async SQLite usually requires complete rewrite of component tree. Build vertically instead.

### VERDICT
Core architectural pivot to single-process SQLite WAL managing git worktrees is sound and a massive upgrade over bash. Project severely underestimates difficulty of IPC with black-box CLI tool via tmux send-keys, and risks unresponsive UI with heavy Git/FS operations in render loop. Implementation order must prototype tmux signaling immediately.

---

## Codex (GPT-5.3)

### SOUND DECISIONS
- **Normalized SQLite model** directly encodes the state machine v1 tried to infer from text. Eliminates parsing drift and "false unblocked" behavior.
- **Session recovery** acknowledges crash reality with deterministic recovery contract.
- **Five-state model with user-gated activation.** Intentionally limiting autonomous actions in high-risk git operations.
- **Commit-to-branch** is auditable, portable, and fits git workflows.
- **Two-channel communication** reduces prompt bloat and preserves clean decision log.

### HIDDEN FAILURE POINTS
- **Event-loop contention risk.** Ink rendering, scan loop, tmux orchestration, git operations, and DB work all share one Node process. One slow sync path delays everything.
- **scanCycle concurrency/idempotency not specified.** Overlapping cycles can race on same issue (double-spawn, detect unblocked while tearing down). Needs single-flight locking and DB transaction guards.
- **SQLite WAL incomplete for this workload.** Without `busy_timeout`, retry/backoff, transaction granularity, and schema constraints for illegal transitions, you will hit `SQLITE_BUSY`.
- **Dual truth planes.** DB canonical for orchestration but `issue.md` canonical for agent. Torn reads during rewrite, stale perception if non-response state changed, silent divergence if write fails but DB succeeds.
- **Signal reliability is weak.** No acknowledgement protocol, no sequence numbers, no replay mechanism. Lost signals create "I already told the agent" illusions.
- **Dependency graph edge cases.** No cycle detection, no transitive dependency evaluation, no behavior for reopened/deferred/deleted blockers. Exactly where v1-style logic bugs reappear.
- **Resolve path is high-risk.** Unstaged apply into potentially dirty workspace can silently blend unrelated edits.
- **Deferred permissions are a security gap.** Until strict defaults exist, spawned agents may have broader access than intended.

### IMPLEMENTATION ORDER RISKS
- **Phase 5 (agent spawning) without Phase 10 (instructions).** Five phases with agents running without behavioral guardrails.
- **Session recovery with incomplete lifecycle semantics.** Recovery before deletion policy, commit/rebase, and resolve mechanics can create orphaned panes in inconsistent states.
- **TUI-first static shell risk.** UI assumptions may harden before transition semantics are transactionally enforced.
- **aidi CLI is Phase 13.** Critical integration and permissions testing pushed to the end where schema changes are most expensive.
- **Block cascade before commit/rebase hardening.** Can produce destructive worktree/branch churn.

### VERDICT
Directionally strong: data model, recovery mindset, and explicit status machine are materially better than v1. Main weakness is not concept but operational rigor: scan-loop concurrency, delivery guarantees, dependency graph correctness, and git safety semantics are under-specified. Promising but not production-safe yet without explicit invariants, transactional guards, and reliability protocols.

---

## Cross-Model Consensus

### Unanimous Agreement (all 3 models flagged)
1. **Event loop / scan cycle blocking** — synchronous DB+git+tmux operations in a 1-2s Ink render loop will cause TUI stutter
2. **aidi CLI is built too late** (Phase 13) despite agents needing it by Phase 10
3. **Resolve flow git mechanics are fragile** — applying changes unstaged is error-prone
4. **Tmux signal delivery is unreliable** — no ack protocol, agent may not be ready to receive
5. **Commit-to-branch lifecycle is sound** — universal praise
6. **Two-channel communication is well-designed** — universal praise
7. **Five-state model with user-gated activation is correct** — universal praise

### Raised by 2 of 3 models
8. **issue.md rewrite race condition / torn reads** (Claude + Codex)
9. **Dependency graph edge cases** (not cycle detection, reopened blockers) (Claude + Codex)
10. **Phase 5 bare agent spawn has limited value** without instructions (Claude + Codex)
11. **Phase 1 mock data → Phase 2 DB wiring is double work** (Claude + Gemini)

### Unique concerns (1 model only)
12. **Git index.lock contention** across shared .git directory (Gemini)
13. **Branch accumulation** — resolved branches never cleaned up (Gemini)
14. **aidi doesn't know which agent is calling** — needs env var injection (Gemini)
15. **Who runs git commit on teardown?** Race between kill pane and commit (Claude)
16. **scanCycle needs single-flight locking** to prevent overlapping cycles (Codex)
17. **SQLite needs busy_timeout configuration** (Codex)
18. **Deferred permissions are a security gap** (Codex)

---

## Recommended Actions (prioritized)

### Must fix before implementation
1. **Move aidi to Phase 0.4-0.5** — build alongside the CRUD layer
2. **Define the commit-before-teardown contract** — who commits, what if agent is mid-operation, timeout policy
3. **Specify atomic file writes** — write-to-temp + rename for issue.md rewrites
4. **Add busy_timeout + single-flight scan lock** — prevent SQLITE_BUSY and overlapping cycles
5. **Prototype tmux signal reliability** early (Phase 1 or sooner) — this is the highest technical risk

### Should address in design
6. **Add dependency cycle detection** to scanCycle
7. **Define behavior when blocker is reopened/deferred** after dependent was unblocked
8. **Specify resolved branch cleanup policy**
9. **Inject CURRENT_ISSUE_ID env var** on agent spawn for aidi context
10. **Consider async/worker-thread for scan cycle** to avoid event loop blocking

### Can defer to implementation
11. Merge Phase 5 + Phase 10 (or accept Phase 5 as tmux-only smoke test)
12. Build core views vertically (Dashboard + Detail → DB) instead of all 6 views → all DB
13. Agent health monitoring beyond `isPaneAlive`
