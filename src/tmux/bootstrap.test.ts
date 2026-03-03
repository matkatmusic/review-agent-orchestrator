import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
    REEXEC_ENV_VAR,
    buildReexecCommand,
    ensureTmuxSession,
    type BootstrapDeps,
} from './bootstrap.js';
import { isTmuxAvailable, hasSession, killSession } from './tmux.js';

// ---------------------------------------------------------------------------
// Env var save/restore
// ---------------------------------------------------------------------------
let savedTmux: string | undefined;
let savedGuard: string | undefined;

function saveEnv(): void {
    savedTmux = process.env.TMUX;
    savedGuard = process.env[REEXEC_ENV_VAR];
}

function restoreEnv(): void {
    if (savedTmux === undefined) delete process.env.TMUX;
    else process.env.TMUX = savedTmux;
    if (savedGuard === undefined) delete process.env[REEXEC_ENV_VAR];
    else process.env[REEXEC_ENV_VAR] = savedGuard;
}

// Sentinel error for intercepting re-exec calls
class SentinelError extends Error {
    constructor() { super('sentinel — test-only re-exec interception'); }
}

// ---------------------------------------------------------------------------
// buildReexecCommand
// ---------------------------------------------------------------------------
describe('buildReexecCommand', () => {
    it('includes REEXEC_ENV_VAR=1 prefix', () => {
        const cmd = buildReexecCommand('/project', 'node', '/project/dist/app.js', []);
        expect(cmd).toContain(`${REEXEC_ENV_VAR}=1`);
    });

    it('includes PATH from current process', () => {
        const cmd = buildReexecCommand('/project', 'node', '/project/dist/app.js', []);
        expect(cmd).toContain('PATH=');
    });

    it('includes node binary and script path', () => {
        const cmd = buildReexecCommand('/project', '/usr/bin/node', '/project/dist/app.js', []);
        expect(cmd).toContain('/usr/bin/node');
        expect(cmd).toContain('/project/dist/app.js');
    });

    it('preserves extra args', () => {
        const cmd = buildReexecCommand('/project', 'node', 'app.js', ['--verbose', '/path/to/root']);
        expect(cmd).toContain('--verbose');
        expect(cmd).toContain('/path/to/root');
    });

    it('shell-escapes paths with spaces', () => {
        const cmd = buildReexecCommand('/my project', 'node', '/my project/dist/app.js', []);
        expect(cmd).toContain("'/my project/dist/app.js'");
    });
});

// ---------------------------------------------------------------------------
// ensureTmuxSession — unit tests with injected deps
// ---------------------------------------------------------------------------
describe('ensureTmuxSession — unit (injected deps)', () => {
    beforeEach(saveEnv);
    afterEach(restoreEnv);

    function makeDeps(overrides: Partial<BootstrapDeps> = {}): BootstrapDeps {
        return {
            isTmuxAvailable: async () => true,
            hasSession: async () => false,
            createSession: async () => '%0',
            splitWindow: async () => '%1',
            listPanes: async () => [],
            killSession: async () => {},
            openTerminalWindow: async () => {},
            exit: () => { throw new SentinelError(); },
            ...overrides,
        };
    }

    const defaultOpts = {
        sessionName: 'test-session',
        terminalApp: 'Terminal',
        cwd: '/project',
        nodeBin: 'node',
        scriptPath: '/project/dist/app.js',
        extraArgs: [],
    };

    it('returns already-inside when guard var is set', async () => {
        process.env[REEXEC_ENV_VAR] = '1';

        const result = await ensureTmuxSession(defaultOpts, makeDeps());
        expect(result.action).toBe('already-inside');
    });

    it('does not create session when guard var is set', async () => {
        process.env[REEXEC_ENV_VAR] = '1';
        let createCalled = false;

        await ensureTmuxSession(defaultOpts, makeDeps({
            createSession: async () => { createCalled = true; return '%0'; },
        }));

        expect(createCalled).toBe(false);
    });

    it('returns already-inside when $TMUX is set (user started in tmux)', async () => {
        delete process.env[REEXEC_ENV_VAR];
        process.env.TMUX = '/tmp/tmux-501/default,1,0';

        const result = await ensureTmuxSession(defaultOpts, makeDeps({
            hasSession: async () => false,
        }));

        expect(result.action).toBe('already-inside');
    });

    it('creates session and split when $TMUX set but session does not exist', async () => {
        delete process.env[REEXEC_ENV_VAR];
        process.env.TMUX = '/tmp/tmux-501/default,1,0';

        let sessionCreated = false;
        let splitCreated = false;

        await ensureTmuxSession(defaultOpts, makeDeps({
            hasSession: async () => false,
            createSession: async () => { sessionCreated = true; return '%0'; },
            splitWindow: async () => { splitCreated = true; return '%1'; },
        }));

        expect(sessionCreated).toBe(true);
        expect(splitCreated).toBe(true);
    });

    it('creates only split when $TMUX set and session already exists with 1 pane', async () => {
        delete process.env[REEXEC_ENV_VAR];
        process.env.TMUX = '/tmp/tmux-501/default,1,0';

        let sessionCreated = false;
        let splitCreated = false;

        await ensureTmuxSession(defaultOpts, makeDeps({
            hasSession: async () => true,
            listPanes: async () => ['%0'],
            createSession: async () => { sessionCreated = true; return '%0'; },
            splitWindow: async () => { splitCreated = true; return '%1'; },
        }));

        expect(sessionCreated).toBe(false);
        expect(splitCreated).toBe(true);
    });

    it('does nothing extra when $TMUX set and session has 2+ panes', async () => {
        delete process.env[REEXEC_ENV_VAR];
        process.env.TMUX = '/tmp/tmux-501/default,1,0';

        let splitCreated = false;

        await ensureTmuxSession(defaultOpts, makeDeps({
            hasSession: async () => true,
            listPanes: async () => ['%0', '%1'],
            splitWindow: async () => { splitCreated = true; return '%2'; },
        }));

        expect(splitCreated).toBe(false);
    });

    it('returns tmux-unavailable when tmux not installed', async () => {
        delete process.env[REEXEC_ENV_VAR];
        delete process.env.TMUX;

        const result = await ensureTmuxSession(defaultOpts, makeDeps({
            isTmuxAvailable: async () => false,
        }));

        expect(result.action).toBe('tmux-unavailable');
    });

    it('calls openTerminalWindow and exit when not in tmux', async () => {
        delete process.env[REEXEC_ENV_VAR];
        delete process.env.TMUX;

        let terminalOpened = false;
        let exitCalled = false;

        try {
            await ensureTmuxSession(defaultOpts, makeDeps({
                createSession: async () => '%0',
                splitWindow: async () => '%1',
                openTerminalWindow: async () => { terminalOpened = true; },
                exit: () => { exitCalled = true; throw new SentinelError(); },
            }));
        } catch (e) {
            if (!(e instanceof SentinelError)) throw e;
        }

        expect(terminalOpened).toBe(true);
        expect(exitCalled).toBe(true);
    });

    it('creates session with reexec command before opening terminal', async () => {
        delete process.env[REEXEC_ENV_VAR];
        delete process.env.TMUX;

        let sessionCmd: string | undefined;

        try {
            await ensureTmuxSession(defaultOpts, makeDeps({
                createSession: async (_name, opts) => {
                    sessionCmd = opts?.cmd;
                    return '%0';
                },
                exit: () => { throw new SentinelError(); },
            }));
        } catch (e) {
            if (!(e instanceof SentinelError)) throw e;
        }

        expect(sessionCmd).toBeDefined();
        expect(sessionCmd).toContain(REEXEC_ENV_VAR);
    });

    it('kills stale session before creating new one', async () => {
        delete process.env[REEXEC_ENV_VAR];
        delete process.env.TMUX;

        let killCalled = false;

        try {
            await ensureTmuxSession(defaultOpts, makeDeps({
                hasSession: async () => true,
                listPanes: async () => [],  // no live panes = stale
                killSession: async () => { killCalled = true; },
                exit: () => { throw new SentinelError(); },
            }));
        } catch (e) {
            if (!(e instanceof SentinelError)) throw e;
        }

        expect(killCalled).toBe(true);
    });

    it('uses terminalApp "none" for headless mode', async () => {
        delete process.env[REEXEC_ENV_VAR];
        delete process.env.TMUX;

        let terminalCalled = false;

        try {
            await ensureTmuxSession(
                { ...defaultOpts, terminalApp: 'none' },
                makeDeps({
                    openTerminalWindow: async () => { terminalCalled = true; },
                    exit: () => { throw new SentinelError(); },
                }),
            );
        } catch (e) {
            if (!(e instanceof SentinelError)) throw e;
        }

        // openTerminalWindow is still called but terminal.ts handles 'none' as no-op
        expect(terminalCalled).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Integration test — real tmux
// ---------------------------------------------------------------------------
const tmuxInstalled = await (async () => {
    try {
        return await isTmuxAvailable();
    } catch {
        return false;
    }
})();

const describeIfTmux = tmuxInstalled ? describe : describe.skip;
const TEST_SESSION = 'orch-test-bootstrap';

describeIfTmux('ensureTmuxSession — integration (real tmux)', () => {
    const HELPER_SESSION = 'orch-test-helper';

    beforeEach(() => {
        saveEnv();
        try { execSync(`tmux kill-session -t ${TEST_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
        try { execSync(`tmux kill-session -t ${HELPER_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
    });

    afterEach(() => {
        restoreEnv();
        try { execSync(`tmux kill-session -t ${TEST_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
        try { execSync(`tmux kill-session -t ${HELPER_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
    });

    it('creates session with 2 panes when $TMUX is set to a real socket', async () => {
        delete process.env[REEXEC_ENV_VAR];

        // Create a real tmux session to get a valid $TMUX value
        execSync(`tmux new-session -d -s ${HELPER_SESSION}`, { stdio: 'pipe' });
        const tmuxEnv = execSync(
            `tmux show-environment -t ${HELPER_SESSION} TMUX 2>/dev/null || tmux display-message -t ${HELPER_SESSION} -p '#{socket_path},#{pid},0'`,
            { encoding: 'utf-8', stdio: 'pipe' },
        ).trim().replace(/^TMUX=/, '');

        // If we can't get a valid TMUX env, construct one from the default socket
        if (!tmuxEnv || tmuxEnv.includes('unknown')) {
            // Use the default tmux socket path
            const serverPid = execSync('tmux display-message -p "#{pid}"', { encoding: 'utf-8', stdio: 'pipe' }).trim();
            process.env.TMUX = `/tmp/tmux-${process.getuid?.() ?? 501}/default,${serverPid},0`;
        } else {
            process.env.TMUX = tmuxEnv;
        }

        const result = await ensureTmuxSession({
            sessionName: TEST_SESSION,
            terminalApp: 'none',
            cwd: process.cwd(),
            nodeBin: process.argv[0]!,
            scriptPath: process.argv[1]!,
            extraArgs: [],
        });

        expect(result.action).toBe('already-inside');
        expect(await hasSession(TEST_SESSION)).toBe(true);

        const paneOutput = execSync(
            `tmux list-panes -t ${TEST_SESSION} -F '#{pane_id}'`,
            { encoding: 'utf-8', stdio: 'pipe' },
        ).trim();
        const panes = paneOutput.split('\n').filter(Boolean);
        expect(panes).toHaveLength(2);
    });
});
