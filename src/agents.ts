import type { Config, LockfileData } from './types.js';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    unlinkSync,
    readdirSync,
    renameSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    hasSession,
    createSession,
    splitWindow,
    sendKeys,
    killPane,
    isPaneAlive,
} from './tmux.js';

const LOCKS_DIR_NAME = '.question-review-locks';

/** Resolve the absolute path to the lockfile directory. */
function locksDir(config: Config): string {
    return join(config.projectRoot, LOCKS_DIR_NAME);
}

/** Resolve the lockfile path for a given qnum. */
function lockfilePath(config: Config, qnum: number): string {
    return join(locksDir(config), `Q${qnum}.lock`);
}

/** Resolve the initial prompt file path for a given qnum. */
function promptFilePath(config: Config, qnum: number): string {
    return join(locksDir(config), `Q${qnum}.prompt`);
}

/** Get the current HEAD commit hash from the project root. */
function headCommit(config: Config): string {
    try {
        return execSync('git rev-parse HEAD', {
            cwd: config.projectRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch {
        return 'unknown';
    }
}

/** Resolve the submodule directory (where this package lives). */
function getSubmoduleDir(): string {
    const __filename = fileURLToPath(import.meta.url);
    return dirname(dirname(__filename)); // src/ → submodule root
}

/**
 * Build the initial prompt message sent to the agent when spawned.
 */
export function buildInitialPrompt(
    config: Config,
    qnum: number,
    title: string,
    description: string,
): string {
    const codeRoot = config.codeRoot || config.projectRoot;
    const lines = [
        `Process question Q${qnum}: ${title}`,
        '',
        `Q number: Q${qnum}`,
        `Main tree path: ${config.projectRoot}`,
    ];
    if (config.codeRoot && config.codeRoot !== config.projectRoot) {
        lines.push(`Code tree path: ${codeRoot}`);
    }
    lines.push(
        `qr-tool path: ${join(getSubmoduleDir(), 'dist', 'qr-tool.js')}`,
        '',
        `Description:`,
        description,
    );
    return lines.join('\n');
}

/**
 * Build the claude CLI command that launch-agent.sh will execute.
 */
export function buildClaudeCommand(config: Config, qnum: number, initialPromptFile?: string): string {
    const submoduleDir = getSubmoduleDir();
    const promptFile = join(submoduleDir, config.agentPrompt);
    const launchScript = join(submoduleDir, 'scripts', 'launch-agent.sh');
    const mainTree = config.projectRoot;
    const codeRoot = config.codeRoot || config.projectRoot;

    const parts = [
        `bash ${esc(launchScript)}`,
        esc(promptFile),
        esc(initialPromptFile ?? ''),
        '--worktree',
        `--add-dir ${esc(mainTree)}`,
    ];

    // Add code root as additional directory if it differs from main tree
    if (codeRoot !== mainTree) {
        parts.push(`--add-dir ${esc(codeRoot)}`);
    }

    return parts.join(' ');
}

/**
 * Create the lockfile for an agent.
 */
export function createLockfile(config: Config, data: LockfileData): void {
    const dir = locksDir(config);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const finalPath = lockfilePath(config, data.qnum);
    const tmpPath = finalPath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    renameSync(tmpPath, finalPath);
}

/**
 * Remove the lockfile for a qnum.
 */
export function removeLockfile(config: Config, qnum: number): void {
    const path = lockfilePath(config, qnum);
    try {
        unlinkSync(path);
    } catch {
        // already gone — ignore
    }
}

/**
 * Read the lockfile for a qnum. Returns undefined if not found or invalid.
 */
export function readLockfile(config: Config, qnum: number): LockfileData | undefined {
    const path = lockfilePath(config, qnum);
    if (!existsSync(path)) return undefined;
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as LockfileData;
    } catch {
        return undefined;
    }
}

/**
 * List all lockfiles in the locks directory.
 */
export function listLockfiles(config: Config): LockfileData[] {
    const dir = locksDir(config);
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter(f => f.endsWith('.lock'));
    const result: LockfileData[] = [];
    for (const file of files) {
        try {
            const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as LockfileData;
            result.push(data);
        } catch {
            // skip malformed lockfiles
        }
    }
    return result;
}

/**
 * Check if a lockfile exists AND the pane is still alive.
 */
export function isAgentRunning(config: Config, qnum: number): boolean {
    const lock = readLockfile(config, qnum);
    if (!lock) return false;
    return isPaneAlive(lock.paneId, config.tmuxSession);
}

/**
 * Remove lockfiles whose tmux pane is dead.
 * Returns the qnums that were cleaned up.
 */
export function cleanupStaleLocks(config: Config): number[] {
    const cleaned: number[] = [];
    const locks = listLockfiles(config);

    for (const lock of locks) {
        if (!isPaneAlive(lock.paneId, config.tmuxSession)) {
            removeLockfile(config, lock.qnum);
            cleaned.push(lock.qnum);
        }
    }

    return cleaned;
}

/**
 * Write the initial prompt to a file so launch-agent.sh can pass it via -p.
 * This avoids the race condition of sending the prompt via sendKeys before
 * the claude CLI is ready to read stdin.
 */
function writeInitialPromptFile(
    config: Config,
    qnum: number,
    title: string,
    description: string,
): string {
    const dir = locksDir(config);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const filePath = promptFilePath(config, qnum);
    const prompt = buildInitialPrompt(config, qnum, title, description);
    writeFileSync(filePath, prompt);
    return filePath;
}

/**
 * Spawn a new agent for an Active question.
 * Creates a tmux pane, launches claude CLI with initial prompt, and writes a lockfile.
 * The initial prompt is written to a file and passed via launch-agent.sh's -p flag,
 * eliminating the race condition of sending via sendKeys before claude is ready.
 * Returns the lockfile data on success.
 */
export function spawnAgent(
    config: Config,
    qnum: number,
    title: string,
    description: string,
): LockfileData {
    // Write initial prompt to file for launch-agent.sh to pass via -p
    const initialPromptFile = writeInitialPromptFile(config, qnum, title, description);

    // Ensure tmux session exists
    if (!hasSession(config.tmuxSession)) {
        createSession(config.tmuxSession, { cwd: config.projectRoot });
        // The initial pane is created by createSession; use it for the first agent
        const paneId = getSessionFirstPane(config.tmuxSession);
        const cmd = buildClaudeCommand(config, qnum, initialPromptFile);
        sendKeys(paneId, cmd);

        const data: LockfileData = {
            paneId,
            qnum,
            headCommit: headCommit(config),
        };
        createLockfile(config, data);

        return data;
    }

    // Session exists — split a new pane
    const paneId = splitWindow(config.tmuxSession, { cwd: config.projectRoot });
    const cmd = buildClaudeCommand(config, qnum, initialPromptFile);
    sendKeys(paneId, cmd);

    const data: LockfileData = {
        paneId,
        qnum,
        headCommit: headCommit(config),
    };
    createLockfile(config, data);

    return data;
}

/**
 * Send the initial prompt to an agent's pane.
 * Called by the daemon after the CLI has had time to start.
 */
export function sendInitialPrompt(
    config: Config,
    qnum: number,
    title: string,
    description: string,
): void {
    const lock = readLockfile(config, qnum);
    if (!lock) return;
    if (!isPaneAlive(lock.paneId, config.tmuxSession)) return;

    const prompt = buildInitialPrompt(config, qnum, title, description);
    sendKeys(lock.paneId, prompt);
}

/**
 * Re-prompt an existing agent when a new user response arrives.
 * Sends a re-prompt message to the agent's tmux pane.
 * Returns true if the reprompt was sent, false if the agent is dead.
 */
export function repromptAgent(config: Config, qnum: number): boolean {
    const lock = readLockfile(config, qnum);
    if (!lock) return false;

    if (!isPaneAlive(lock.paneId, config.tmuxSession)) {
        // Pane is dead — clean up the stale lockfile
        removeLockfile(config, qnum);
        return false;
    }

    const message = `NEW USER RESPONSE in Q${qnum}. Re-read the question and process the new response.`;
    sendKeys(lock.paneId, message);
    return true;
}

/**
 * Kill an agent and clean up its lockfile.
 */
export function killAgent(config: Config, qnum: number): void {
    const lock = readLockfile(config, qnum);
    if (lock) {
        killPane(lock.paneId);
    }
    removeLockfile(config, qnum);
}

/** Get the first pane ID of a session. */
function getSessionFirstPane(session: string): string {
    try {
        return execSync(
            `tmux list-panes -t '${session.replace(/'/g, "'\\''")}' -F '#{pane_id}' | head -1`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
    } catch {
        return '%0'; // fallback
    }
}

/** Shell-escape a string for safe use in commands. */
function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
