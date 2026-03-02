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
 * Build the claude CLI command (a compound shell command sent to the tmux pane).
 * Claude is started in interactive mode with the initial prompt as a positional
 * argument (auto-submitted first message). This keeps claude alive for reprompting
 * via sendKeys, unlike -p which runs non-interactively and exits.
 */
export function buildClaudeCommand(config: Config, qnum: number, initialPromptFile?: string): string {
    const submoduleDir = getSubmoduleDir();
    const promptFile = join(submoduleDir, config.agentPrompt);
    const mainTree = config.projectRoot;
    const codeRoot = config.codeRoot || config.projectRoot;

    // Build compound shell command for the tmux pane
    const parts: string[] = [
        'unset CLAUDECODE',
        `export PATH=${esc(process.env.PATH ?? '')}`,
        'export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95',
    ];

    const claudeArgs = [
        'exec claude',
        `--append-system-prompt "$(cat ${esc(promptFile)})"`,
        '--worktree',
        `--add-dir ${esc(mainTree)}`,
    ];

    if (codeRoot !== mainTree) {
        claudeArgs.push(`--add-dir ${esc(codeRoot)}`);
    }

    // Pass initial prompt as a positional argument (interactive mode, auto-submitted)
    // Using -- to separate options from the positional prompt argument
    if (initialPromptFile) {
        claudeArgs.push(`-- "$(cat ${esc(initialPromptFile)})"`);
    }

    parts.push(claudeArgs.join(' '));
    return parts.join('; ');
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

/** Resolve the launcher script path for a given qnum. */
function launcherScriptPath(config: Config, qnum: number): string {
    return join(locksDir(config), `Q${qnum}.launcher.sh`);
}

/**
 * Write the initial prompt to a file so it can be passed as a positional
 * argument via $(cat ...) in the launcher script.
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
 * Write a launcher shell script for the agent.
 * This avoids nested single-quote escaping issues when passing compound
 * commands as tmux pane commands — tmux's esc() wraps in single quotes,
 * which suppresses $(cat ...) expansion. Writing a script file lets us
 * pass a simple `bash /path/to/script.sh` to tmux instead.
 */
function writeLauncherScript(config: Config, qnum: number, cmd: string): string {
    const dir = locksDir(config);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const scriptPath = launcherScriptPath(config, qnum);
    writeFileSync(scriptPath, `#!/usr/bin/env bash\n${cmd}\n`, { mode: 0o755 });
    return scriptPath;
}

/**
 * Spawn a new agent for an Active question.
 * Creates a tmux pane, launches claude CLI in interactive mode, and writes a lockfile.
 * The initial prompt is passed as a positional argument (auto-submitted first message)
 * so claude stays alive for reprompting. Returns the lockfile data on success.
 */
export function spawnAgent(
    config: Config,
    qnum: number,
    title: string,
    description: string,
): LockfileData {
    // Write initial prompt to file — passed as positional arg to claude
    const initialPromptFile = writeInitialPromptFile(config, qnum, title, description);
    const cmd = buildClaudeCommand(config, qnum, initialPromptFile);

    // Write launcher script — avoids shell escaping issues when passing
    // compound commands (with $(cat ...) expansions) as tmux pane commands.
    const launcherPath = writeLauncherScript(config, qnum, cmd);
    const paneCmd = `bash ${esc(launcherPath)}`;

    let paneId: string;
    if (!hasSession(config.tmuxSession)) {
        paneId = createSession(config.tmuxSession, { cwd: config.projectRoot, cmd: paneCmd });
    } else {
        paneId = splitWindow(config.tmuxSession, { cwd: config.projectRoot, cmd: paneCmd });
    }

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
 * Kill an agent and clean up its lockfile, launcher script, and prompt file.
 */
export function killAgent(config: Config, qnum: number): void {
    const lock = readLockfile(config, qnum);
    if (lock) {
        killPane(lock.paneId);
    }
    removeLockfile(config, qnum);
    // Clean up ephemeral files
    for (const path of [launcherScriptPath(config, qnum), promptFilePath(config, qnum)]) {
        try { unlinkSync(path); } catch { /* already gone */ }
    }
}

/** Shell-escape a string for safe use in commands. */
function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
