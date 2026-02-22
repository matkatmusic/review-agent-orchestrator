# Claude Question Review

Automated question review system using Claude Code agents. Spawns persistent Claude agents in tmux panes to process question files — classifying user responses as RESOLVE, RESPOND, or IMPLEMENT and executing autonomously.

## How It Works

1. A background daemon scans `Questions/Awaiting/` every 10 seconds
2. For each question file with a pending user response, it spawns a Claude Code agent in a tmux pane (up to `MAX_AGENTS` concurrent agents)
3. Each agent runs in an isolated git worktree and processes its assigned question file
4. Agents classify the user's response and execute:
   - **RESOLVE** — Marks the file `**RESOLVED**` and moves it to `Questions/Resolved/`
   - **RESPOND** — Appends a `<response_claude>` block to the question file
   - **IMPLEMENT** — Makes codebase changes, commits in worktree, and prompts the user to apply changes to the main tree
5. Agents stay alive after processing — when the user writes a new response, the daemon re-prompts the existing agent instead of spawning a new one
6. When a question is resolved, the daemon cleans up the agent's pane, lockfile, worktree, and branch

## Setup

Add as a git submodule to your project:

```bash
git submodule add <repo-url> .question-review
.question-review/setup.sh
git add -A && git commit -m "Add question review system"
```

`setup.sh` creates:
- `Questions/Awaiting/`, `Questions/Resolved/`, `Questions/Deferred/` directories
- `.vscode/tasks.json` entry to auto-start the daemon when opening the folder in VS Code
- `.claude/settings.json` with agent permissions
- `.question-review-logs/` for permission logging (gitignored)

## Usage

### Creating Questions

Place question files in `Questions/Awaiting/` using this format:

```xml
<question_claude number=42>
    <text>
    Your question here.
    </text>
    <user_response>
        <text>
        Your response or instruction here.
        </text>
    </user_response>
</question_claude>
```

File naming: `Q<number>_short_description.md` (e.g., `Q42_add_logging.md`)

### Starting the Daemon

**VS Code:** Open the project folder. The daemon starts automatically via the VS Code task.

**Manual:**
```bash
.question-review/scripts/review-questions.sh /path/to/project
```

**One-shot scan** (no daemon loop):
```bash
.question-review/scripts/review-questions.sh /path/to/project
```

### Responding to Agents

After an agent responds, it appends an empty `<user_response>` block for you to fill in. Edit the file in your editor, write your response in the `<text>` block, and save. The daemon picks up the change on the next scan cycle (10s) and re-prompts the agent.

### Resolving Questions

Write "resolve this" (or similar) in the `<user_response>` block. The agent will:
1. Add `**RESOLVED**` header
2. Move the file to `Questions/Resolved/`
3. The daemon cleans up the worktree and frees the agent slot

## Resetting for Testing

The submodule includes a generic reset script:

```bash
# Full reset: kill tmux, clean worktrees, update submodule, reinstall settings, scan
.question-review/scripts/reset.sh /path/to/project

# Reset without scanning (e.g., when VS Code daemon handles scanning)
.question-review/scripts/reset.sh --no-scan /path/to/project
```

The reset script:
- Kills the `q-review` tmux session
- Removes all worktree directories, prunes git refs, deletes `worktree-*` branches
- Clears lockfiles
- Updates the submodule to latest
- Reinstalls `.claude/settings.json`
- Moves any resolved questions back to `Questions/Awaiting/`
- Commits the reset state

For project-specific resets (e.g., recreating test question files), create a wrapper script:

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Project-specific setup here (create test files, etc.)

# Delegate to submodule's generic reset
"$PROJECT_ROOT/.question-review/scripts/reset.sh" "$@" "$PROJECT_ROOT"
```

## Configuration

Edit `config.sh` to customize:

| Setting | Default | Description |
|---|---|---|
| `MAX_AGENTS` | 2 | Maximum concurrent tmux panes |
| `TMUX_SESSION` | q-review | Tmux session name |
| `SCAN_INTERVAL` | 10 | Seconds between daemon scans |
| `QUESTIONS_DIR` | Questions | Root questions directory |
| `TERMINAL_APP` | Terminal | macOS terminal app (Terminal or iTerm) |
| `TERMINAL_COLS` | 175 | Terminal window width |
| `TERMINAL_ROWS` | 98 | Terminal window height |

## Architecture

```
your-project/
  .question-review/          # This submodule
    config.sh                # Configuration
    setup.sh                 # One-time project setup
    prompts/
      review-agent.md        # Agent system prompt
    scripts/
      review-questions-daemon.sh  # Background daemon (runs scan loop)
      review-questions.sh         # Single scan pass
      launch-agent.sh             # Agent launcher wrapper
      reset.sh                    # Test reset script
    templates/
      settings.json               # Claude Code permissions template
      agent_question_template.md   # Question file template
      questions_guidelines.md      # Guidelines for writing questions
      tasks.json.snippet           # VS Code task definition
  Questions/
    Awaiting/                # Active questions (agents process these)
    Resolved/                # Completed questions
    Deferred/                # Postponed questions
  .question-review-locks/    # Lockfiles (one per active agent)
  .question-review-logs/     # Permission logs (gitignored)
  .claude/
    settings.json            # Agent permissions (installed by setup.sh)
    worktrees/               # Git worktrees (one per agent, auto-managed)
```

### Key Design Decisions

- **Git worktrees**: Each agent works in an isolated worktree (`--worktree Q<num>`), preventing conflicts between concurrent agents
- **Persistent agents**: Agents stay alive after processing and get re-prompted via `tmux send-keys`, avoiding the overhead of respawning
- **Lockfiles**: Track active agents by pane ID for dedup and re-prompting
- **Auto-compact**: Agents use `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=0.15` to stay alive longer by compacting at 15% remaining context
- **Main tree sync**: Agents apply changes to the main tree via `git diff | git apply` (unstaged) — the user commits when ready

## Submodule Workflow

When making changes to the template:

1. Edit files in the template repo
2. Commit in the template repo
3. In the host project: `git -c protocol.file.allow=always submodule update --remote .question-review`
4. Commit the submodule ref: `git add .question-review && git commit -m "Update submodule"`
5. Delete `.claude/settings.json` and re-run `setup.sh` (if settings template changed)

Or use `reset.sh` which handles steps 3-5 automatically.
