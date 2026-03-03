import type { ShellExecutor } from './exec.js';
import { defaultExec, esc } from './exec.js';
import {
    isInsideTmux,
    isTmuxAvailable as tmuxAvailable,
    hasSession as tmuxHasSession,
    createSession as tmuxCreateSession,
    splitWindow as tmuxSplitWindow,
    listPanes as tmuxListPanes,
    killSession as tmuxKillSession,
    type CreateSessionOptions,
    type SplitWindowOptions,
} from './tmux.js';
import { openTerminalWindow as terminalOpen } from './terminal.js';

/** Environment variable used as a re-exec guard to prevent infinite loops. */
export const REEXEC_ENV_VAR = 'ORCHESTRATOR_INSIDE_TMUX';

export type EnsureSessionResult =
    | { action: 'already-inside'; sessionName: string }
    | { action: 'spawned-terminal'; sessionName: string }
    | { action: 'tmux-unavailable' };

export interface BootstrapOpts {
    sessionName: string;
    terminalApp: string;
    cwd: string;
    nodeBin: string;
    scriptPath: string;
    extraArgs: string[];
}

/** Injectable dependencies for testing. */
export interface BootstrapDeps {
    isTmuxAvailable: () => Promise<boolean>;
    hasSession: (name: string) => Promise<boolean>;
    createSession: (name: string, opts?: CreateSessionOptions) => Promise<string>;
    splitWindow: (name: string, opts?: SplitWindowOptions) => Promise<string>;
    listPanes: (name: string) => Promise<string[]>;
    killSession: (name: string) => Promise<void>;
    openTerminalWindow: (session: string, app: string) => Promise<void>;
    exit: (code: number) => void;
}

function defaultDeps(exec: ShellExecutor): BootstrapDeps {
    return {
        isTmuxAvailable: () => tmuxAvailable(exec),
        hasSession: (name) => tmuxHasSession(name, exec),
        createSession: (name, opts) => tmuxCreateSession(name, opts, exec),
        splitWindow: (name, opts) => tmuxSplitWindow(name, opts, exec),
        listPanes: (name) => tmuxListPanes(name, exec),
        killSession: (name) => tmuxKillSession(name, exec),
        openTerminalWindow: (session, app) => terminalOpen(session, app, exec),
        exit: (code) => process.exit(code),
    };
}

/**
 * Build the shell command to re-exec the orchestrator inside tmux.
 * Includes PATH and guard var to prevent infinite loops.
 */
export function buildReexecCommand(
    cwd: string,
    nodeBin: string,
    scriptPath: string,
    extraArgs: string[],
): string {
    const parts = [
        `${REEXEC_ENV_VAR}=1`,
        `PATH=${esc(process.env.PATH ?? '')}`,
        esc(nodeBin),
        esc(scriptPath),
        ...extraArgs.map(esc),
    ];
    return parts.join(' ');
}

/**
 * Main entry point for Phase 1.1.
 *
 * Decision tree:
 * 1. Guard var set → already-inside (re-exec'd instance)
 * 2. $TMUX set → already-inside (user started in tmux), ensure layout
 * 3. tmux not installed → tmux-unavailable
 * 4. Otherwise → create session, open terminal, exit
 */
export async function ensureTmuxSession(
    opts: BootstrapOpts,
    deps?: BootstrapDeps,
): Promise<EnsureSessionResult> {
    const d = deps ?? defaultDeps(defaultExec);

    // 1. Re-exec guard — we are the child process inside tmux
    if (process.env[REEXEC_ENV_VAR] === '1') {
        return { action: 'already-inside', sessionName: opts.sessionName };
    }

    // 2. Already inside tmux — ensure the orchestrator session layout exists
    if (isInsideTmux()) {
        await ensureLayout(opts, d);
        return { action: 'already-inside', sessionName: opts.sessionName };
    }

    // 3. Check tmux availability
    if (!(await d.isTmuxAvailable())) {
        return { action: 'tmux-unavailable' };
    }

    // 4. Not in tmux — bootstrap: create session + open terminal + exit

    // Handle stale session from a crashed run
    if (await d.hasSession(opts.sessionName)) {
        const panes = await d.listPanes(opts.sessionName);
        if (panes.length > 0) {
            // Session has live panes — another instance may be running
            // Let the caller decide how to handle this
            return { action: 'already-inside', sessionName: opts.sessionName };
        }
        // No live panes — stale session, kill it
        await d.killSession(opts.sessionName);
    }

    // Build re-exec command and create session
    const reexecCmd = buildReexecCommand(opts.cwd, opts.nodeBin, opts.scriptPath, opts.extraArgs);

    await d.createSession(opts.sessionName, {
        cwd: opts.cwd,
        cmd: reexecCmd,
    });

    await d.splitWindow(opts.sessionName, {
        vertical: true,
        percent: 40,
        noFocus: true,
    });

    // Open terminal window attached to the session
    await d.openTerminalWindow(opts.sessionName, opts.terminalApp);

    // Exit the original process — the TUI is now running inside tmux
    d.exit(0);

    return { action: 'spawned-terminal', sessionName: opts.sessionName };
}

/** Ensure the orchestrator session has the correct layout (2 panes). */
async function ensureLayout(opts: BootstrapOpts, d: BootstrapDeps): Promise<void> {
    if (await d.hasSession(opts.sessionName)) {
        const panes = await d.listPanes(opts.sessionName);
        if (panes.length < 2) {
            await d.splitWindow(opts.sessionName, {
                vertical: true,
                percent: 40,
                noFocus: true,
            });
        }
    } else {
        await d.createSession(opts.sessionName, {
            cwd: opts.cwd,
            cols: 200,
            rows: 50,
        });
        await d.splitWindow(opts.sessionName, {
            vertical: true,
            percent: 40,
            noFocus: true,
        });
    }
}
