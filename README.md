# Claude Question Review

A SQLite-backed work queue where Claude agents are the workers and the user is the reviewer. Questions live in a database, agents spawn in tmux panes, and everything is driven by a background daemon.

## How It Works

1. A background daemon runs `scanCycle` every 10 seconds
2. It processes the `.pending/` queue — agents and TUI write JSON action files here, the daemon applies them to SQLite
3. The pipeline runs: enforce blocked questions → auto-unblock when blockers resolve → promote Awaiting → Active (up to `MAX_AGENTS`)
4. For each Active question, the daemon spawns a Claude Code agent in a tmux pane (or re-prompts an existing one when there's a new user response)
5. Agents stay alive after processing — the daemon re-prompts via `tmux send-keys` instead of respawning
6. When a question is resolved, the daemon kills the agent pane, cleans the worktree, and removes the lockfile
7. The DB is exported to `questions.dump.sql` after every mutation for git portability

## Quick Start

Add as a git submodule to your project:

```bash
git submodule add <repo-url> .question-review
cd .question-review && npm install && npm run build
./setup.sh
```

`setup.sh` creates:
- `Questions/Awaiting/`, `Questions/Resolved/`, `Questions/Deferred/` directories
- `.vscode/tasks.json` entry to auto-start the daemon
- `.claude/settings.json` with agent permissions
- `.question-review-logs/` for permission logging (gitignored)

## Usage

### Daemon

```bash
# v2 daemon (TypeScript scan loop with auto-rebuild)
.question-review/scripts/daemon.sh /path/to/project

# Legacy v1 daemon (bash-based, still functional)
.question-review/scripts/review-questions-daemon.sh
```

`daemon.sh` auto-rebuilds `dist/` when source files change, then loops `node dist/daemon.js` every `SCAN_INTERVAL` seconds.

### TUI

```bash
node dist/tui/app.js /path/to/project
```

**Dashboard keys:**

| Key | Action |
|-----|--------|
| `Enter` | Open question detail |
| `n` | New question |
| `d` | Defer selected question |
| `a` | Activate (Awaiting→Active) or requeue (Deferred/Resolved→Awaiting) |
| `r` | Refresh |
| `x` | Delete question |
| `Tab` / `Shift+Tab` | Cycle status filter |
| `q` | Quit |

**Detail keys:**

| Key | Action |
|-----|--------|
| `i` / `Enter` | Open reply input |
| `d` | Defer |
| `a` | Activate / requeue |
| `r` | Resolve |
| `Esc` | Back to dashboard (or cancel input) |

### CLI (`qr-tool`)

```bash
node dist/qr-tool.js <command>
```

**Read commands** (query SQLite directly):

| Command | Description |
|---------|-------------|
| `read <qnum>` | Show question + full response history |
| `list [-s status] [-g group]` | List questions with optional filters |
| `info <qnum>` | Show question details + dependencies |
| `status` | Summary counts by status |

**Write commands** (write to `.pending/` queue for daemon to apply):

| Command | Description |
|---------|-------------|
| `respond <qnum> <body>` | Submit an agent response |
| `user-respond <qnum> <body>` | Submit a user response |
| `create <title> <description> [-g group]` | Create a new question |
| `block-by <blocked> <blocker>` | Add a dependency |
| `block-by-group <blocked> <group>` | Block by all questions in a group |
| `add-to-group <qnum> <group>` | Add question to a group |

## Configuration

Edit `config.sh` to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_AGENTS` | 6 | Maximum concurrent tmux panes |
| `TMUX_SESSION` | q-review | Tmux session name |
| `SCAN_INTERVAL` | 10 | Seconds between daemon scans |
| `QUESTIONS_DIR` | Questions | Root questions directory |
| `TERMINAL_APP` | Antigravity | macOS terminal app (Terminal, iTerm, Antigravity) |
| `TERMINAL_COLS` | 175 | Terminal window width |
| `TERMINAL_ROWS` | 98 | Terminal window height |
| `AGENT_PROMPT` | prompts/review-agent.md | Agent system prompt file |
| `CODE_ROOT` | *(empty)* | Code repo path when it differs from project root |

Create `config.local.sh` for project-specific overrides (gitignored). Environment variables (`MAX_AGENTS`, `SCAN_INTERVAL`, etc.) override both files.

## Architecture

```
your-project/
  .question-review/              # This submodule
    config.sh                    # Configuration
    config.local.sh              # Local overrides (gitignored)
    setup.sh                     # One-time project setup
    prompts/
      review-agent.md            # Agent system prompt
    scripts/
      daemon.sh                  # v2 daemon loop (auto-rebuild + TS scan)
      review-questions-daemon.sh # v1 daemon loop (bash scan)
      review-questions.sh        # v1 single scan pass (bash)
      launch-agent.sh            # Agent launcher wrapper
      reset.sh                   # Reset script
      followup.sh                # Followup helper
    src/                         # TypeScript source
      daemon.ts                  # Scan cycle: pending → pipeline → agents → cleanup
      db.ts                      # SQLite wrapper (better-sqlite3)
      config.ts                  # Config loader (config.sh → config.local.sh → env)
      qr-tool.ts                 # CLI entry point (commander)
      qr-tool-commands.ts        # CLI command implementations
      pipeline.ts                # Status pipeline (enforce → unblock → promote)
      pending.ts                 # .pending/ queue processor
      questions.ts               # Question CRUD
      responses.ts               # Response CRUD + reprompt tracking
      dependencies.ts            # Dependency graph queries
      agents.ts                  # Agent spawn/reprompt/kill + lockfile mgmt
      tmux.ts                    # Tmux pane operations
      types.ts                   # Shared types
      tui/
        app.tsx                  # TUI entry point (Ink/React)
        dashboard.tsx            # Question list with status tabs
        detail.tsx               # Question detail + conversation view
        create.tsx               # New question form
        header.tsx               # Persistent header bar
        status-actions.ts        # Valid actions per status
        status-color.ts          # Status → color mapping
    templates/
      schema.sql                 # SQLite schema (auto-migrated)
      seed.sql                   # Initial seed data
      settings.json              # Claude Code permissions template
      agent_question_template.md # Question file template
      user_question_template.md  # User question template
      questions_guidelines.md    # Guidelines for writing questions
      tasks.json.snippet         # VS Code task definition
    dist/                        # Compiled JS (generated by tsc)
  Questions/
    Awaiting/                    # Pending questions
    Resolved/                    # Completed questions
    Deferred/                    # Postponed questions
  questions.db                   # SQLite database (single source of truth)
  questions.dump.sql             # SQL dump exported to git
  .pending/                      # JSON action queue (agents → daemon → DB)
  .question-review-locks/        # Lockfiles (one per active agent)
  .question-review-logs/         # Permission logs (gitignored)
```

### Data Flow

```
User ──→ TUI / CLI ──→ .pending/ ──→ Daemon ──→ SQLite DB
                                        │
                                        ├──→ Pipeline (enforce → unblock → promote)
                                        ├──→ Spawn/reprompt agents in tmux panes
                                        └──→ Export questions.dump.sql
```

## Database

SQLite is the single source of truth. The schema (`templates/schema.sql`) has three tables:

| Table | Purpose |
|-------|---------|
| `questions` | qnum, title, description, group, status, timestamps, last_responder |
| `responses` | Full conversation history (id, qnum, author, body, created_at) |
| `dependencies` | Directed graph of blocker → blocked relationships |

**Status values:**

| Status | Meaning |
|--------|---------|
| `Awaiting` | Queued, waiting for an agent slot |
| `Active` | Agent is running (or will be spawned) |
| `Deferred` | Auto-deferred because a blocker is unresolved |
| `User_Deferred` | Manually deferred by the user |
| `Resolved` | Done |

A `metadata` table stores counters (e.g., `lastQuestionCreated` for auto-incrementing qnums).

## Key Design Decisions

- **SQLite single source of truth** — the DB is the canonical state, not the filesystem. The v1 system used XML question files as state; v2 moved everything to SQLite for atomicity and queryability.
- **`.pending/` queue** — agents and the TUI never write to the DB directly. They drop JSON files into `.pending/`, and the daemon processes them on the next scan cycle. This avoids SQLite write contention between concurrent processes.
- **Persistent agents** — agents stay alive after processing and get re-prompted via `tmux send-keys`, avoiding the overhead of respawning Claude Code sessions.
- **Git worktrees per agent** — each agent works in an isolated worktree, preventing file conflicts between concurrent agents.
- **`questions.dump.sql`** — the daemon exports a SQL dump after every DB mutation. This file is committed to git, making the question state portable across machines without shipping the binary `.db` file.
- **Status pipeline** — the daemon runs enforce → unblock → promote every cycle: questions blocked by unresolved dependencies are forced to Deferred, questions whose blockers are all Resolved are unblocked, and Awaiting questions are promoted to Active up to `MAX_AGENTS`.

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode (tsc --watch)
npm test               # Run tests (vitest)
npm run test:watch     # Watch mode tests
```

## Resetting

```bash
# Full reset: kill tmux, clean worktrees/locks, update submodule, reinstall settings, scan
.question-review/scripts/reset.sh /path/to/project

# Reset without scanning (e.g., when VS Code daemon handles scanning)
.question-review/scripts/reset.sh --no-scan /path/to/project
```

## Submodule Workflow

When making changes to the submodule:

1. Edit files in the submodule repo
2. Commit in the submodule repo
3. In the host project: `git -c protocol.file.allow=always submodule update --remote .question-review`
4. Commit the submodule ref: `git add .question-review && git commit -m "Update submodule"`
5. Delete `.claude/settings.json` and re-run `setup.sh` (if settings template changed)

Or use `reset.sh` which handles steps 3-5 automatically.
