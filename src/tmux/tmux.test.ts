import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import {
    isInsideTmux,
    isTmuxAvailable,
    hasSession,
    createSession,
    splitWindow,
    killSession,
    listPanes,
} from './tmux.js';
import { createMockExec, mockShellError } from './testing.js';

// ---------------------------------------------------------------------------
// Env var save/restore
// ---------------------------------------------------------------------------
let savedTmux: string | undefined;

function saveEnv(): void {
    savedTmux = process.env.TMUX;
}

function restoreEnv(): void {
    if (savedTmux === undefined) delete process.env.TMUX;
    else process.env.TMUX = savedTmux;
}

// ---------------------------------------------------------------------------
// Unit tests — mock executor, no real tmux needed
// ---------------------------------------------------------------------------
describe('tmux — unit (mock executor)', () => {
    // ---- isInsideTmux (reads env, no executor) ----

    describe('isInsideTmux', () => {
        beforeEach(saveEnv);
        afterEach(restoreEnv);

        it('returns false when TMUX is not set', () => {
            delete process.env.TMUX;
            expect(isInsideTmux()).toBe(false);
        });

        it('returns true when TMUX is set to a non-empty string', () => {
            process.env.TMUX = '/private/tmp/tmux-501/default,12345,0';
            expect(isInsideTmux()).toBe(true);
        });

        it('returns false when TMUX is empty string', () => {
            process.env.TMUX = '';
            expect(isInsideTmux()).toBe(false);
        });
    });

    // ---- isTmuxAvailable ----

    describe('isTmuxAvailable', () => {
        it('returns true when which tmux succeeds', async () => {
            const { exec } = createMockExec([
                { stdout: '/usr/local/bin/tmux', stderr: '', exitCode: 0 },
            ]);
            expect(await isTmuxAvailable(exec)).toBe(true);
        });

        it('returns false when which tmux fails', async () => {
            const { exec } = createMockExec([
                mockShellError('which tmux', { exitCode: 1 }),
            ]);
            expect(await isTmuxAvailable(exec)).toBe(false);
        });
    });

    // ---- hasSession ----

    describe('hasSession', () => {
        it('returns true when tmux has-session succeeds', async () => {
            const { exec } = createMockExec([
                { stdout: '', stderr: '', exitCode: 0 },
            ]);
            expect(await hasSession('my-session', exec)).toBe(true);
        });

        it('returns false when tmux has-session fails', async () => {
            const { exec } = createMockExec([
                mockShellError('tmux has-session'),
            ]);
            expect(await hasSession('nonexistent', exec)).toBe(false);
        });

        it('passes escaped session name to tmux', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '', stderr: '', exitCode: 0 },
            ]);
            await hasSession('my-session', exec);
            expect(calls[0]!.cmd).toContain("'my-session'");
            expect(calls[0]!.cmd).toContain('has-session');
        });
    });

    // ---- createSession ----

    describe('createSession', () => {
        it('returns the pane ID from stdout', async () => {
            const { exec } = createMockExec([
                { stdout: '%42', stderr: '', exitCode: 0 },
            ]);
            const paneId = await createSession('test', undefined, exec);
            expect(paneId).toBe('%42');
        });

        it('issues tmux new-session command', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%0', stderr: '', exitCode: 0 },
            ]);
            await createSession('test', undefined, exec);
            expect(calls[0]!.cmd).toContain('new-session');
            expect(calls[0]!.cmd).toContain("'test'");
        });

        it('passes cwd option', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%0', stderr: '', exitCode: 0 },
            ]);
            await createSession('s', { cwd: '/tmp/work' }, exec);
            expect(calls[0]!.cmd).toContain("'/tmp/work'");
        });

        it('passes cmd option', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%0', stderr: '', exitCode: 0 },
            ]);
            await createSession('s', { cmd: 'sleep 60' }, exec);
            expect(calls[0]!.cmd).toContain("'sleep 60'");
        });
    });

    // ---- splitWindow ----

    describe('splitWindow', () => {
        it('returns the new pane ID', async () => {
            const { exec } = createMockExec([
                { stdout: '%5', stderr: '', exitCode: 0 },
            ]);
            const paneId = await splitWindow('s', undefined, exec);
            expect(paneId).toBe('%5');
        });

        it('issues tmux split-window command', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%1', stderr: '', exitCode: 0 },
            ]);
            await splitWindow('s', undefined, exec);
            expect(calls[0]!.cmd).toContain('split-window');
        });

        it('passes vertical and percent options', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%1', stderr: '', exitCode: 0 },
            ]);
            await splitWindow('s', { vertical: true, percent: 40 }, exec);
            expect(calls[0]!.cmd).toContain('-v');
            expect(calls[0]!.cmd).toContain('40%');
        });

        it('passes noFocus option', async () => {
            const { exec, calls } = createMockExec([
                { stdout: '%1', stderr: '', exitCode: 0 },
            ]);
            await splitWindow('s', { noFocus: true }, exec);
            expect(calls[0]!.cmd).toContain('-d');
        });
    });

    // ---- listPanes ----

    describe('listPanes', () => {
        it('returns pane IDs from stdout', async () => {
            const { exec } = createMockExec([
                { stdout: '%0\n%1\n%2', stderr: '', exitCode: 0 },
            ]);
            const panes = await listPanes('s', exec);
            expect(panes).toEqual(['%0', '%1', '%2']);
        });

        it('returns empty array when session does not exist', async () => {
            const { exec } = createMockExec([
                mockShellError('tmux list-panes'),
            ]);
            const panes = await listPanes('nonexistent', exec);
            expect(panes).toEqual([]);
        });
    });

    // ---- killSession ----

    describe('killSession', () => {
        it('does not throw when session does not exist', async () => {
            const { exec } = createMockExec([
                mockShellError('tmux kill-session'),
            ]);
            await expect(killSession('nonexistent', exec)).resolves.not.toThrow();
        });
    });
});

// ---------------------------------------------------------------------------
// Integration tests — real tmux required
// ---------------------------------------------------------------------------
const tmuxInstalled = await (async () => {
    try {
        return await isTmuxAvailable();
    } catch {
        return false;
    }
})();

const describeIfTmux = tmuxInstalled ? describe : describe.skip;
const TEST_SESSION = 'orch-test-tmux-unit';

describeIfTmux('tmux — integration (real tmux)', () => {
    beforeEach(() => {
        try { execSync(`tmux kill-session -t ${TEST_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
    });

    afterEach(() => {
        try { execSync(`tmux kill-session -t ${TEST_SESSION}`, { stdio: 'pipe' }); } catch { /* ok */ }
    });

    it('creates a session and hasSession returns true', async () => {
        const paneId = await createSession(TEST_SESSION);
        expect(paneId).toMatch(/^%\d+$/);
        expect(await hasSession(TEST_SESSION)).toBe(true);
    });

    it('hasSession returns false after session killed', async () => {
        await createSession(TEST_SESSION);
        await killSession(TEST_SESSION);
        expect(await hasSession(TEST_SESSION)).toBe(false);
    });

    it('splitWindow creates a second pane', async () => {
        await createSession(TEST_SESSION);
        const newPaneId = await splitWindow(TEST_SESSION, { vertical: true, percent: 40, noFocus: true });
        expect(newPaneId).toMatch(/^%\d+$/);
        const panes = await listPanes(TEST_SESSION);
        expect(panes).toHaveLength(2);
    });

    it('listPanes returns pane IDs in %N format', async () => {
        await createSession(TEST_SESSION);
        await splitWindow(TEST_SESSION, { vertical: true });
        const panes = await listPanes(TEST_SESSION);
        expect(panes.length).toBeGreaterThanOrEqual(2);
        for (const p of panes) {
            expect(p).toMatch(/^%\d+$/);
        }
    });

    it('killSession is safe to call on dead session', async () => {
        await killSession('orch-nonexistent-session');
        // no throw = pass
    });
});
