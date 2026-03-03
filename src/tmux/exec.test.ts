import { describe, it, expect } from 'vitest';
import { defaultExec, esc, type ShellExecutor } from './exec.js';
import { createMockExec, mockShellError } from './testing.js';

// ---------------------------------------------------------------------------
// esc() — shell escape utility
// ---------------------------------------------------------------------------
describe('esc', () => {
    it('wraps a simple string in single quotes', () => {
        expect(esc('hello')).toBe("'hello'");
    });

    it('preserves spaces inside quotes', () => {
        expect(esc('hello world')).toBe("'hello world'");
    });

    it('escapes embedded single quotes', () => {
        expect(esc("it's")).toBe("'it'\\''s'");
    });

    it('handles a string that is only a single quote', () => {
        expect(esc("'")).toBe("''\\'''");
    });

    it('handles empty string', () => {
        expect(esc('')).toBe("''");
    });

    it('handles session names with hyphens', () => {
        expect(esc('issue-review')).toBe("'issue-review'");
    });

    it('handles paths with spaces', () => {
        expect(esc('/Users/me/my project')).toBe("'/Users/me/my project'");
    });

    it('backslashes are safe inside single quotes', () => {
        expect(esc('a\\b')).toBe("'a\\b'");
    });

    it('preserves newlines inside single quotes', () => {
        expect(esc('a\nb')).toBe("'a\nb'");
    });

    it('prevents shell expansion of $(cmd)', () => {
        expect(esc('$(whoami)')).toBe("'$(whoami)'");
    });

    it('prevents shell expansion of backticks', () => {
        expect(esc('`id`')).toBe("'`id`'");
    });

    it('prevents variable expansion of $VAR', () => {
        expect(esc('$HOME/path')).toBe("'$HOME/path'");
    });
});

// ---------------------------------------------------------------------------
// defaultExec — real shell execution
// ---------------------------------------------------------------------------
describe('defaultExec', () => {
    it('returns stdout from a successful command', async () => {
        const result = await defaultExec('echo hello');
        expect(result.stdout).toBe('hello');
        expect(result.exitCode).toBe(0);
    });

    it('captures stderr separately from stdout', async () => {
        const result = await defaultExec('echo out && echo err >&2');
        expect(result.stdout).toBe('out');
        expect(result.stderr).toBe('err');
    });

    it('rejects with ShellError on non-zero exit', async () => {
        try {
            await defaultExec('exit 42');
            expect.unreachable('should have thrown');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(Error);
            const e = err as { cmd: string; timedOut: boolean };
            expect(e.cmd).toBe('exit 42');
            expect(e.timedOut).toBe(false);
        }
    });

    it('rejects with timedOut=true when command exceeds timeout', async () => {
        try {
            await defaultExec('sleep 10', { timeoutMs: 100 });
            expect.unreachable('should have thrown');
        } catch (err: unknown) {
            const e = err as { timedOut: boolean };
            expect(e.timedOut).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// createMockExec — test utility
// ---------------------------------------------------------------------------
describe('createMockExec', () => {
    it('records calls in order', async () => {
        const { exec, calls } = createMockExec([
            { stdout: '', stderr: '', exitCode: 0 },
            { stdout: '%0', stderr: '', exitCode: 0 },
        ]);
        await exec('cmd1');
        await exec('cmd2');
        expect(calls).toHaveLength(2);
        expect(calls[0].cmd).toBe('cmd1');
        expect(calls[1].cmd).toBe('cmd2');
    });

    it('returns canned responses in order', async () => {
        const { exec } = createMockExec([
            { stdout: 'first', stderr: '', exitCode: 0 },
            { stdout: 'second', stderr: '', exitCode: 0 },
        ]);
        const r1 = await exec('a');
        const r2 = await exec('b');
        expect(r1.stdout).toBe('first');
        expect(r2.stdout).toBe('second');
    });

    it('returns default empty result when responses exhausted', async () => {
        const { exec } = createMockExec([]);
        const result = await exec('anything');
        expect(result.stdout).toBe('');
        expect(result.exitCode).toBe(0);
    });

    it('throws ShellError from mockShellError response', async () => {
        const { exec } = createMockExec([
            mockShellError('tmux has-session', { exitCode: 1 }),
        ]);
        await expect(exec('cmd')).rejects.toThrow();
    });
});
