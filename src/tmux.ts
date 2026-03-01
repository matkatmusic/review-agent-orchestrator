import { execSync } from 'node:child_process';

function exec(cmd: string): string {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

export function isTmuxAvailable(): boolean {
    try {
        exec('which tmux');
        return true;
    } catch {
        return false;
    }
}

export function hasSession(session: string): boolean {
    try {
        exec(`tmux has-session -t ${esc(session)}`);
        return true;
    } catch {
        return false;
    }
}

export function createSession(
    session: string,
    opts?: { cwd?: string; cols?: number; rows?: number; cmd?: string }
): string {
    const parts = ['tmux', 'new-session', '-d', '-s', esc(session), '-P', '-F', "'#{pane_id}'"];
    if (opts?.cols && opts?.rows) {
        parts.push('-x', String(opts.cols), '-y', String(opts.rows));
    }
    if (opts?.cwd) {
        parts.push('-c', esc(opts.cwd));
    }
    if (opts?.cmd) {
        parts.push(esc(opts.cmd));
    }
    return exec(parts.join(' '));
}

export function splitWindow(
    session: string,
    opts?: { cwd?: string; cmd?: string }
): string {
    const parts = ['tmux', 'split-window', '-t', esc(session), '-P', '-F', "'#{pane_id}'"];
    if (opts?.cwd) {
        parts.push('-c', esc(opts.cwd));
    }
    if (opts?.cmd) {
        parts.push(esc(opts.cmd));
    }
    return exec(parts.join(' '));
}

export function killPane(paneId: string): void {
    try {
        exec(`tmux kill-pane -t ${esc(paneId)}`);
    } catch {
        // pane already dead — ignore
    }
}

export function sendKeys(paneId: string, keys: string): void {
    // Use literal flag (-l) for text, then chain Enter in a single tmux
    // invocation to prevent interleaving from concurrent sendKeys calls.
    execSync(
        `tmux send-keys -t ${esc(paneId)} -l ${esc(keys)} \\; send-keys -t ${esc(paneId)} Enter`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
}

export function capturePaneTail(paneId: string, lines: number = 20): string {
    try {
        return exec(`tmux capture-pane -t ${esc(paneId)} -p -S -${lines}`);
    } catch {
        return '';
    }
}

export function listPanes(session: string): string[] {
    try {
        const output = exec(`tmux list-panes -t ${esc(session)} -F '#{pane_id}'`);
        return output.split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Check if a pane is alive.
 * When `session` is provided, only checks panes within that session (O(n) for session panes only).
 * Without `session`, falls back to checking all panes globally (O(n) for all panes).
 */
export function isPaneAlive(paneId: string, session?: string): boolean {
    try {
        const flag = session ? `-t ${esc(session)}` : '-a';
        const output = exec(`tmux list-panes ${flag} -F '#{pane_id}'`);
        return output.split('\n').includes(paneId);
    } catch {
        return false;
    }
}

export function killSession(session: string): void {
    try {
        exec(`tmux kill-session -t ${esc(session)}`);
    } catch {
        // session already dead — ignore
    }
}

/** Shell-escape a string for safe use in commands. */
function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
