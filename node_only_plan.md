# Migrate All Shell Scripts to Node/TypeScript

## Context

The project has a complete TypeScript core (daemon.ts, agents.ts, tmux.ts, qr-tool.ts, TUI) but still wraps it in shell scripts for the daemon loop, agent launching, setup, and reset. The goal is to eliminate all shell scripts so the Node app is the single tool for everything.

## What stays, what goes

| Script | Status | Action |
|--------|--------|--------|
| `scripts/daemon.sh` | Loop wrapper for daemon.ts | **Delete** — move loop into daemon.ts |
| `scripts/launch-agent.sh` | Claude CLI launcher (nvm, env, prompt) | **Delete** — inline into agents.ts |
| `setup.sh` | Project initialization | **Delete** — port to `qr-tool setup` |
| `scripts/reset.sh` | Project reset | **Delete** — port to `qr-tool reset` |
| `scripts/review-questions.sh` | v1 scanner (616 lines) | **Delete** — fully replaced by daemon.ts |
| `scripts/review-questions-daemon.sh` | v1 daemon entry | **Delete** — fully replaced by daemon.ts |
| `scripts/followup.sh` | v1 reopen question | **Delete** — TUI handles this |
| `scripts/set-pane-title.sh` | Obsolete hook | **Delete** |
| `config.sh` | Config data (variable assignments) | **Keep** — parsed by config.ts as a data file |
| `config.local.sh` | Config overrides (gitignored) | **Keep** |

After: `scripts/` directory is deleted entirely.

---

## Stage 1: Daemon loop — move into daemon.ts

**Problem**: daemon.sh provides the scan loop (`while true; sleep $INTERVAL; done`) and auto-rebuild. daemon.ts currently runs one cycle and exits.

**Changes**:
- `src/daemon.ts` — rewrite `main()` to: open DB once, run `scanCycle()` on a `setInterval`, handle SIGINT/SIGTERM for graceful shutdown
- `src/daemon.ts` — add `ensureAutocompact()` (ported from launch-agent.sh's jq patching): read `~/.claude.json`, set `autoCompactEnabled: true`, write back. Runs once at daemon startup, not per-agent (eliminates race condition).
- Drop auto-rebuild — users run `npm run dev` (tsc --watch) during development

**Key detail** — current `main()` (line 234):
```typescript
// Current: opens DB, runs one cycle, closes DB, exits
export function main(projectRoot?: string): void {
    // ...
    db.open(); db.migrate(); db.seed();
    scanCycle(config, db);
    db.close();
}
```
Becomes:
```typescript
// New: opens DB once, loops forever
export function main(projectRoot?: string): void {
    // ...
    db.open(); db.migrate(); db.seed();
    ensureAutocompact();
    scanCycle(config, db);  // first cycle immediately
    setInterval(() => scanCycle(config, db), config.scanInterval * 1000);
    process.on('SIGINT', () => { db.close(); process.exit(0); });
}
```

**Tests**: `scanCycle()` tests are unaffected (called directly with a test DB). Add a test for `ensureAutocompact()` with a temp file.

**Verify**: `node dist/daemon.js /path/to/project` runs continuously, scans every 10s, Ctrl+C exits cleanly.

---

## Stage 2: Inline launch-agent.sh into agents.ts

**Problem**: `buildClaudeCommand()` (agents.ts:90) shells out to `bash launch-agent.sh` which sources nvm, sets env vars, reads prompt file, and execs claude.

**What launch-agent.sh does**:
1. Sources `~/.nvm/nvm.sh` to get `claude`/`node` on PATH
2. Sets `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95`
3. Reads prompt file with `cat` (avoids backtick expansion)
4. Execs `claude --append-system-prompt "$CONTENT" -p "$INITIAL" [args...]`

**Solution**: Build a compound shell command in `buildClaudeCommand()` that does all of this inline. The nvm problem is solved by injecting `process.env.PATH` from the daemon (which has nvm loaded) into the tmux pane's command.

**Current** (agents.ts:90-111):
```typescript
const parts = [
    `bash ${esc(launchScript)}`,
    esc(promptFile),
    esc(initialPromptFile ?? ''),
    '--worktree',
    `--add-dir ${esc(mainTree)}`,
];
```

**New**:
```typescript
const parts: string[] = [
    `export PATH=${esc(process.env.PATH ?? '')}`,
    'export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95',
];
const claudeArgs = [
    'exec claude',
    `--append-system-prompt "$(cat ${esc(promptFile)})"`,
    '--worktree',
    `--add-dir ${esc(mainTree)}`,
];
if (initialPromptFile) {
    claudeArgs.push(`-p "$(cat ${esc(initialPromptFile)})"`);
}
parts.push(claudeArgs.join(' '));
return parts.join('; ');
```

**Why this works**: `sendKeys()` (tmux.ts:64) sends the command string literally via `tmux send-keys -l`. The pane's bash receives and executes it, expanding `$(cat ...)` at that point. The prompt content (14KB) never flows through sendKeys — only the ~300-char command does.

**Test updates** (agents.test.ts): Change assertions from `expect(cmd).toContain('launch-agent.sh')` to `expect(cmd).toContain('exec claude')` and `expect(cmd).toContain('export PATH=')`.

**Verify**: Spawn an agent, confirm `claude` runs in the tmux pane. Check `which node` works in the pane.

---

## Stage 3: Port setup.sh to `qr-tool setup`

**New file**: `src/setup.ts`

Ports all 6 steps from setup.sh:
1. Create `Questions/{Awaiting,Resolved,Deferred}/` with `.gitkeep` files — `mkdirSync({ recursive: true })`
2. Copy template md files (no-clobber) — `copyFileSync` with `existsSync` guard
3. Create/merge `.vscode/tasks.json` — read snippet, substitute `${SUBMODULE_PATH}`, write JSON
4. Create `.question-review-logs/` + add to `.gitignore` — `mkdirSync` + append
5. Install `.claude/settings.json` from template — `copyFileSync`
6. Initialize DB (schema + seed, import from dump if available) — reuse `DB.open/migrate/seed`

Step 6 is new (setup.sh didn't do this — daemon.ts did). Consolidating it into setup ensures the DB exists before the first daemon run.

**Register**: Add `setup` command to `src/qr-tool.ts`:
```typescript
program.command('setup').argument('[project-root]').action(...)
```

**Update**: `templates/tasks.json.snippet` — change command from `review-questions-daemon.sh` to `node dist/daemon.js ${workspaceFolder}`:
```json
{
  "label": "Question Review Daemon",
  "type": "shell",
  "command": "node ${workspaceFolder}/${SUBMODULE_PATH}/dist/daemon.js ${workspaceFolder}",
  "runOptions": { "runOn": "folderOpen" },
  "isBackground": true,
  "problemMatcher": []
}
```

**New test**: `src/__tests__/setup.test.ts` — verify each step against a temp directory.

**Verify**: `node dist/qr-tool.js setup /tmp/test-project` creates full structure. Compare with `setup.sh` output.

---

## Stage 4: Port reset.sh to `qr-tool reset`

**New file**: `src/reset.ts`

Ports all steps from reset.sh using existing TypeScript utilities:
1. Kill tmux session — `killSession()` from tmux.ts
2. Remove worktrees — `readdirSync` + `execSync('git worktree remove ...')`
3. Prune git refs + delete `worktree-*` branches — `execSync('git branch -D ...')`
4. Clear lockfiles — `readdirSync` + `unlinkSync`
5. Update submodule — `execSync('git submodule update --remote ...')`
6. Reinstall settings — call `runSetup()` from setup.ts
7. Move resolved questions back to Awaiting — `renameSync` (v1 compat, may be no-op in v2)
8. Commit reset state — `execSync('git add -A && git commit ...')`

**Register**: Add `reset` command to `src/qr-tool.ts` with `--no-scan` option.

**New test**: `src/__tests__/reset.test.ts` — verify lockfile clearing, tmux kill (mocked).

**Verify**: `node dist/qr-tool.js reset /path/to/project` performs all steps.

---

## Stage 5: Delete shell scripts + update references

**Delete all**:
- `scripts/daemon.sh`
- `scripts/review-questions-daemon.sh`
- `scripts/review-questions.sh`
- `scripts/launch-agent.sh`
- `scripts/followup.sh`
- `scripts/reset.sh`
- `scripts/set-pane-title.sh`
- `setup.sh`
- Remove the empty `scripts/` directory

**Update references** in source comments:
- `src/daemon.ts` — remove "Called by daemon.sh" comment
- `src/agents.ts` — remove all `launch-agent.sh` references in comments

**Verify**: `grep -r '\.sh' src/ templates/ README.md` only finds `config.sh`/`config.local.sh` references. `npm test` passes.

---

## Stage 6: Update README.md

Update to reflect the all-Node architecture:
- Quick Start: `qr-tool setup` instead of `./setup.sh`
- Daemon: `node dist/daemon.js` instead of `scripts/daemon.sh`
- Reset: `qr-tool reset` instead of `scripts/reset.sh`
- Architecture tree: remove `scripts/`, add `src/setup.ts`, `src/reset.ts`
- Remove "Submodule Workflow" section's reference to `setup.sh`

---

## File manifest

| Action | File |
|--------|------|
| **Modify** | `src/daemon.ts` — add loop + ensureAutocompact |
| **Modify** | `src/agents.ts` — rewrite buildClaudeCommand |
| **Modify** | `src/qr-tool.ts` — add setup/reset commands |
| **Modify** | `src/__tests__/agents.test.ts` — update command assertions |
| **Modify** | `src/__tests__/daemon.test.ts` — add ensureAutocompact test |
| **Modify** | `templates/tasks.json.snippet` — point to node daemon |
| **Modify** | `README.md` — update for all-Node |
| **Create** | `src/setup.ts` |
| **Create** | `src/reset.ts` |
| **Create** | `src/__tests__/setup.test.ts` |
| **Create** | `src/__tests__/reset.test.ts` |
| **Delete** | `setup.sh`, `scripts/` (entire directory) |

## Verification

1. `npm run build` — compiles cleanly
2. `npm test` — all tests pass (existing + new)
3. `node dist/daemon.js /path/to/project` — runs continuously, spawns agents
4. `node dist/qr-tool.js setup /tmp/test` — creates full project structure
5. `node dist/qr-tool.js reset /path/to/project` — kills agents, cleans state
6. `grep -rn '\.sh' src/` — no shell script references (except config.sh data file)
7. Manual: launch daemon, verify agent spawns correctly in tmux with claude running
