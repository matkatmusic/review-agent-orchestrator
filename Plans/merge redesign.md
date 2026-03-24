# TUI + Daemon Merge Redesign

## Problem

The TUI and daemon are separate processes that must be launched independently. They communicate through the filesystem (`.pending/` JSON files, lockfiles) and a shared SQLite database. This adds operational complexity and introduces stale-state edge cases.

## Core Constraint

Agents are separate processes (Claude Code in tmux panes). They must communicate back to the main app. Everything else flows from that.

## Current Architecture

```
TUI (process 1)  ──reads──►  SQLite DB  ◄──reads──  Daemon (process 2)
                                                        │
                                                        ├── writes status changes
                                                        ├── spawns/kills tmux agents
                                                        └── reads .pending/
                                                              ▲
Agents (process 3..N)  ──writes──►  .pending/ JSON files
                                    (because they can't share DB handle)
```

Three separate processes, filesystem as IPC. The `.pending/` folder exists only because agents can't share the daemon's DB connection.

## Redesign

### Key enabler: SQLite WAL mode

WAL (Write-Ahead Logging) lets multiple processes read and write to the same database concurrently. With that:

```
TUI + Orchestrator (single process)
  │
  ├── React UI (dashboard, detail, create)
  ├── Orchestrator timer (scanCycle every N seconds)
  ├── Direct DB reads/writes
  │
  └── SQLite DB (WAL mode) ◄── direct writes ── qr-tool ◄── Agents (tmux panes)
```

### What changes

| Current | Redesign | Why |
|---------|----------|-----|
| TUI + Daemon = 2 processes | Single process | Daemon loop is just a `useEffect` timer |
| `.pending/` JSON files | Eliminated | Agents write to DB directly via qr-tool (WAL mode) |
| Lockfiles on disk | `agent_sessions` DB table | Single source of truth, queryable, no stale-file cleanup |
| TUI polls DB every 3s | Orchestrator pushes state | scanCycle runs in-process, updates React state directly |
| qr-tool writes to filesystem | qr-tool writes to DB | Same CLI interface for agents, different backend |

### Layers

```
┌─────────────────────────────────────┐
│  TUI (Ink/React)                    │  Entry point. Dashboard, Detail, Create.
│  └── Orchestrator (useEffect timer) │  Runs scanCycle(), updates React state.
├─────────────────────────────────────┤
│  Core Logic (pure)                  │  Pipeline, status machine, agent lifecycle
│  - pipeline.ts                      │  enforce/unblock/promote
│  - agents.ts                        │  spawn/kill/reprompt decisions
│  - questions.ts, responses.ts       │  CRUD
├─────────────────────────────────────┤
│  I/O Adapters                       │  Tmux, Git, filesystem
│  - tmux.ts                          │  pane create/kill/sendKeys/isAlive
│  - git.ts                           │  HEAD, worktrees
├─────────────────────────────────────┤
│  Data (SQLite WAL)                  │  Single source of truth
│  - questions, responses, deps       │  (existing tables)
│  - agent_sessions                   │  (replaces lockfiles)
├─────────────────────────────────────┤
│  Agent CLI (qr-tool)                │  Used by agents in tmux panes
│  - Opens own DB connection          │  WAL mode = safe concurrent writes
│  - Same commands, writes to DB      │  No .pending/ intermediary
└─────────────────────────────────────┘
```

### What stays the same

- Tmux panes for agents (right tool for the job)
- `scanCycle` logic (already a pure function taking config + db)
- qr-tool as the agent-facing CLI (same interface, just writes to DB instead of `.pending/`)
- Config loading, schema migrations
- All pipeline logic (enforce, unblock, promote)

### What gets simpler

- **No process coordination** — one thing to launch, one thing to stop
- **No filesystem IPC** — no `.pending/` folder, no lockfile cleanup, no stale file edge cases
- **Reactive UI** — scanCycle result directly feeds React state, no polling delay
- **Agent sessions are queryable** — "show me all running agents" is a SQL query, not a directory listing + tmux health checks

## Implementation Scope

### Files to modify

| File | Change |
|------|--------|
| `src/db.ts` | Enable WAL mode (`PRAGMA journal_mode=WAL`) on open |
| `src/tui/app.tsx` | Embed orchestrator timer, run `scanCycle` in a `useEffect` |
| `src/qr-tool-commands.ts` | Switch write commands from `writePending()` to direct DB writes |
| `src/qr-tool.ts` | Open DB connection instead of resolving `.pending/` dir |
| `src/agents.ts` | Replace lockfile read/write with `agent_sessions` table queries |
| `src/daemon.ts` | Remove `main()` entry point and interval loop; keep `scanCycle` as an export |
| `templates/schema.sql` | Add `agent_sessions` table (pane_id, qnum, head_commit, created_at) |

### Files to delete

| File | Reason |
|------|--------|
| `src/pending.ts` | No longer needed; agents write to DB directly |

### Files unchanged

| File | Reason |
|------|--------|
| `src/pipeline.ts` | Pure logic, no I/O awareness |
| `src/questions.ts` | Already does direct DB reads/writes |
| `src/responses.ts` | Already does direct DB reads/writes |
| `src/dependencies.ts` | Already does direct DB reads/writes |
| `src/tmux.ts` | I/O adapter, unchanged |
| `src/tui/header.tsx` | Presentation only |
| `src/tui/dashboard.tsx` | Reads from DB (unchanged) |
| `src/tui/detail.tsx` | Reads from DB (unchanged) |
| `src/tui/create.tsx` | Writes to DB (unchanged) |

## `agent_sessions` Table Schema

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
    qnum     INTEGER PRIMARY KEY,
    pane_id  TEXT    NOT NULL,
    head_commit TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

Replaces `.question-review-locks/Q<n>.lock` JSON files. Same data, queryable, no stale-file edge cases.
