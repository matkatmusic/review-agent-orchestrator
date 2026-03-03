import type { ShellExecutor } from './exec.js';
import { defaultExec, esc } from './exec.js';

/** Check if the current process is running inside a tmux session. */
export function isInsideTmux(): boolean {
    return !!process.env.TMUX;
}

/** Check if tmux is installed and on PATH. */
export async function isTmuxAvailable(
    exec: ShellExecutor = defaultExec,
): Promise<boolean> {
    try {
        await exec('command -v tmux');
        return true;
    } catch {
        return false;
    }
}

/** Check if a named tmux session exists. */
export async function hasSession(
    session: string,
    exec: ShellExecutor = defaultExec,
): Promise<boolean> {
    try {
        await exec(`tmux has-session -t ${esc(session)}`);
        return true;
    } catch {
        return false;
    }
}

export interface CreateSessionOptions {
    readonly cwd?: string;
    readonly cols?: number;
    readonly rows?: number;
    readonly cmd?: string;
}

/**
 * Create a new detached tmux session.
 * Returns the pane ID of the initial pane (e.g., "%0").
 */
export async function createSession(
    session: string,
    options?: CreateSessionOptions,
    exec: ShellExecutor = defaultExec,
): Promise<string> {
    const parts = ['tmux', 'new-session', '-d', '-s', esc(session), '-P', '-F', "'#{pane_id}'"];
    if (options?.cols && options?.rows) {
        parts.push('-x', String(options.cols), '-y', String(options.rows));
    }
    if (options?.cwd) {
        parts.push('-c', esc(options.cwd));
    }
    if (options?.cmd) {
        parts.push(esc(options.cmd));
    }

    const result = await exec(parts.join(' '));
    return result.stdout.trim();
}

export interface SplitWindowOptions {
    readonly cwd?: string;
    readonly cmd?: string;
    /**
     * When true, passes `-v` to tmux which creates a horizontal dividing line,
     * placing panes top-to-bottom. This is what the v2.1 spec calls "horizontal split"
     * (top pane: TUI, bottom pane: agents). tmux's `-h` would create side-by-side panes.
     */
    readonly vertical?: boolean;
    readonly percent?: number;
    readonly noFocus?: boolean;
}

/**
 * Split an existing window to create a new pane.
 * Returns the pane ID of the new pane.
 */
export async function splitWindow(
    session: string,
    options?: SplitWindowOptions,
    exec: ShellExecutor = defaultExec,
): Promise<string> {
    const parts = ['tmux', 'split-window', '-t', esc(session), '-P', '-F', "'#{pane_id}'"];
    if (options?.vertical) parts.push('-v');
    if (options?.noFocus) parts.push('-d');
    if (options?.percent) parts.push('-l', `${options.percent}%`);
    if (options?.cwd) parts.push('-c', esc(options.cwd));
    if (options?.cmd) parts.push(esc(options.cmd));

    const result = await exec(parts.join(' '));
    return result.stdout.trim();
}

/** List all pane IDs in a session. Returns empty array if session does not exist. */
export async function listPanes(
    session: string,
    exec: ShellExecutor = defaultExec,
): Promise<string[]> {
    try {
        const result = await exec(`tmux list-panes -t ${esc(session)} -F '#{pane_id}'`);
        return result.stdout.split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

/** Kill an entire tmux session. Safe to call on a nonexistent session. */
export async function killSession(
    session: string,
    exec: ShellExecutor = defaultExec,
): Promise<void> {
    try {
        await exec(`tmux kill-session -t ${esc(session)}`);
    } catch {
        // session already dead — ignore
    }
}
