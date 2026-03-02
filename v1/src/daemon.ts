import { DB } from './db.js';
import type { Config } from './types.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { processPendingQueue } from './pending.js';
import { runPipeline } from './pipeline.js';
import { listByStatus, getQuestion } from './questions.js';
import { needsReprompt, markReprompted } from './responses.js';
import {
    isAgentRunning,
    spawnAgent,
    repromptAgent,
    killAgent,
    cleanupStaleLocks,
    readLockfile,
    listLockfiles,
    createLockfile,
} from './agents.js';
import { sendKeys, isPaneAlive } from './tmux.js';
import { loadConfig } from './config.js';

function log(msg: string): void {
    process.stderr.write(`[review] ${msg}\n`);
}

/**
 * Get the current HEAD commit hash from a git repo.
 */
function getHeadCommit(cwd: string): string {
    try {
        return execSync('git rev-parse HEAD', {
            cwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Detect new commits on the active branch and send rebase signals to agents.
 * Compares the current HEAD against each agent's stored headCommit.
 */
export function detectNewCommits(config: Config): void {
    const currentHead = getHeadCommit(config.projectRoot);
    if (currentHead === 'unknown') return;

    const locks = listLockfiles(config);
    for (const lock of locks) {
        if (lock.headCommit !== currentHead && lock.headCommit !== 'unknown') {
            if (!isPaneAlive(lock.paneId, config.tmuxSession)) continue;

            const message = [
                'The main repo has new commits.',
                `Your worktree branch should be rebased.`,
                `Run: git rebase ${currentHead}`,
            ].join(' ');

            try {
                sendKeys(lock.paneId, message);
                // Update lockfile so we don't re-send next cycle
                createLockfile(config, { ...lock, headCommit: currentHead });
                log(`Sent rebase signal to Q${lock.qnum} (${lock.headCommit.slice(0, 7)} → ${currentHead.slice(0, 7)})`);
            } catch {
                // pane may have died between check and send — ignore
            }
        }
    }
}

export interface ScanResult {
    pendingProcessed: number;
    enforced: number[];
    unblocked: number[];
    promoted: number[];
    spawned: number[];
    reprompted: number[];
    killedByEnforce: number[];
    killedOrphans: number[];
    staleCleaned: number[];
    dumpExported: boolean;
}

/**
 * Run one full scan cycle.
 * This is the core daemon loop body — called once per iteration.
 */
export function scanCycle(config: Config, db: DB): ScanResult {
    const pendingDir = join(config.projectRoot, '.pending');
    const dumpPath = join(config.projectRoot, 'questions.dump.sql');

    const result: ScanResult = {
        pendingProcessed: 0,
        enforced: [],
        unblocked: [],
        promoted: [],
        spawned: [],
        reprompted: [],
        killedByEnforce: [],
        killedOrphans: [],
        staleCleaned: [],
        dumpExported: false,
    };

    // 1. Process pending queue (.pending/ → DB writes)
    try {
        result.pendingProcessed = processPendingQueue(db, pendingDir);
        if (result.pendingProcessed > 0) {
            log(`Processed ${result.pendingProcessed} pending action(s)`);
        }
    } catch (err) {
        log(`Pending queue error: ${err}`);
    }

    // 2. Run pipeline: enforce blocked → auto-unblock → promote awaiting
    try {
        const pipeline = runPipeline(db, config.maxAgents);
        result.enforced = pipeline.enforced;
        result.unblocked = pipeline.unblocked;
        result.promoted = pipeline.promoted;

        // Kill agents for questions that were enforced to Deferred
        for (const qnum of result.enforced) {
            if (isAgentRunning(config, qnum)) {
                killAgent(config, qnum);
                result.killedByEnforce.push(qnum);
                log(`Killed agent for Q${qnum} (blocked → Deferred)`);
            }
        }

        // Kill orphaned agents whose questions are no longer Active (e.g. user
        // manually deferred, resolved, or deleted via TUI while agent was running)
        const locks = listLockfiles(config);
        for (const lock of locks) {
            if (result.killedByEnforce.includes(lock.qnum)) continue;
            const q = getQuestion(db, lock.qnum);
            if (!q || q.status !== 'Active') {
                killAgent(config, lock.qnum);
                result.killedOrphans.push(lock.qnum);
                log(`Killed orphaned agent for Q${lock.qnum} (${q ? `status: ${q.status}` : 'deleted'})`);
            }
        }

        if (result.unblocked.length > 0) {
            log(`Unblocked: ${result.unblocked.map(q => `Q${q}`).join(', ')}`);
        }
        if (result.promoted.length > 0) {
            log(`Promoted: ${result.promoted.map(q => `Q${q}`).join(', ')}`);
        }
    } catch (err) {
        log(`Pipeline error: ${err}`);
    }

    // 3. Spawn/re-prompt agents for Active questions
    try {
        const active = listByStatus(db, 'Active');
        for (const q of active) {
            try {
                if (isAgentRunning(config, q.qnum)) {
                    // Agent is alive — check if there's a new user response to deliver
                    if (!needsReprompt(db, q.qnum)) {
                        continue;
                    }
                    // There's a user response the agent hasn't seen yet — re-prompt
                    const sent = repromptAgent(config, q.qnum);
                    if (sent) {
                        markReprompted(db, q.qnum);
                        result.reprompted.push(q.qnum);
                        log(`Re-prompted agent for Q${q.qnum}`);
                    } else {
                        // Pane died — spawn a new agent (prompt passed via file, no sendKeys race)
                        const question = getQuestion(db, q.qnum);
                        if (question) {
                            spawnAgent(config, q.qnum, question.title, question.description);
                            result.spawned.push(q.qnum);
                            log(`Spawned agent pane: Q${q.qnum} — ${question.title}`);
                        }
                    }
                } else {
                    // No agent running — spawn one (prompt passed via file, no sendKeys race)
                    const question = getQuestion(db, q.qnum);
                    if (question) {
                        spawnAgent(config, q.qnum, question.title, question.description);
                        result.spawned.push(q.qnum);
                        log(`Spawned agent pane: Q${q.qnum} — ${question.title}`);
                    }
                }
            } catch (err) {
                log(`Failed to manage agent for Q${q.qnum}: ${err}`);
            }
        }
    } catch (err) {
        log(`Agent management error: ${err}`);
    }

    // 4. Detect new commits and send rebase signals
    try {
        detectNewCommits(config);
    } catch (err) {
        log(`Commit detection error: ${err}`);
    }

    // 5. Cleanup stale lockfiles
    try {
        result.staleCleaned = cleanupStaleLocks(config);
        if (result.staleCleaned.length > 0) {
            log(`Cleaned stale locks: ${result.staleCleaned.map(q => `Q${q}`).join(', ')}`);
        }
    } catch (err) {
        log(`Stale lock cleanup error: ${err}`);
    }

    // 6. Export dump if DB was modified
    if (db.isDirty()) {
        try {
            db.exportDump(dumpPath);
            db.resetDirty();
            result.dumpExported = true;
            log(`Exported dump: ${dumpPath}`);
        } catch (err) {
            log(`Failed to export dump: ${err}`);
        }
    }

    return result;
}

/**
 * Ensure autoCompactEnabled is set in ~/.claude.json (or a custom path for testing).
 * Agents need this to avoid running out of context window.
 */
export function ensureAutocompact(configPath?: string): void {
    const claudeJson = configPath ?? join(homedir(), '.claude.json');
    try {
        let data: Record<string, unknown> = {};
        if (existsSync(claudeJson)) {
            data = JSON.parse(readFileSync(claudeJson, 'utf-8'));
        }
        if (data.autoCompactEnabled !== true) {
            data.autoCompactEnabled = true;
            writeFileSync(claudeJson, JSON.stringify(data, null, 2));
            log('Enabled autoCompactEnabled in ~/.claude.json');
        }
    } catch (err) {
        log(`Warning: could not update ~/.claude.json: ${err}`);
    }
}

/**
 * Main entry point — runs continuously, scanning on an interval.
 */
export function main(projectRoot?: string): void {
    const config = loadConfig(projectRoot);
    const dbPath = join(config.projectRoot, 'questions.db');
    // Derive submodule root from this file's location (works from both src/ and dist/)
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const submoduleRoot = dirname(thisDir);
    const schemaPath = join(submoduleRoot, 'templates', 'schema.sql');
    const seedPath = join(submoduleRoot, 'templates', 'seed.sql');

    const db = new DB(dbPath);
    db.open();
    db.migrate(schemaPath);
    db.seed(seedPath);

    ensureAutocompact();

    log(`Daemon started — project root: ${config.projectRoot}`);
    log(`Scan interval: ${config.scanInterval}s`);

    // First cycle immediately
    try {
        scanCycle(config, db);
    } catch (err) {
        log(`Scan error: ${err}`);
    }

    // Subsequent cycles on interval
    const timer = setInterval(() => {
        try {
            scanCycle(config, db);
        } catch (err) {
            log(`Scan error: ${err}`);
        }
    }, config.scanInterval * 1000);

    const shutdown = () => {
        log('Shutting down...');
        clearInterval(timer);
        db.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// CLI entry point: node dist/daemon.js [project_root]
const isDirectRun = process.argv[1]?.endsWith('daemon.js');
if (isDirectRun) {
    main(process.argv[2]);
}
