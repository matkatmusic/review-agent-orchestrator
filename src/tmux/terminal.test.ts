import { describe, it, expect } from 'vitest';
import { buildOsascript, openTerminalWindow } from './terminal.js';
import { createMockExec, mockShellError } from './testing.js';

// ---------------------------------------------------------------------------
// buildOsascript — pure function, no executor needed
// ---------------------------------------------------------------------------
describe('buildOsascript', () => {
    it('generates Terminal.app AppleScript with tmux attach', () => {
        const script = buildOsascript('Terminal', 'issue-review');
        expect(script).toContain('tell application "Terminal"');
        expect(script).toContain('activate');
        expect(script).toContain('tmux attach-session -t');
        expect(script).toContain('issue-review');
    });

    it('generates iTerm AppleScript with tmux attach', () => {
        const script = buildOsascript('iTerm', 'my-session');
        expect(script).toContain('tell application "iTerm"');
        expect(script).toContain('activate');
        expect(script).toContain('tmux attach-session -t');
        expect(script).toContain('my-session');
    });

    it('throws for unknown terminal app', () => {
        expect(() => buildOsascript('Hyper', 'session')).toThrow('Unsupported terminalApp');
    });

    it('escapes session names with single quotes', () => {
        const script = buildOsascript('Terminal', "it's-a-session");
        // Should not break the AppleScript — session name is embedded in shell cmd
        expect(script).toContain("it's-a-session");
    });
});

// ---------------------------------------------------------------------------
// openTerminalWindow — uses executor
// ---------------------------------------------------------------------------
describe('openTerminalWindow', () => {
    it('calls executor with osascript for Terminal.app', async () => {
        const { exec, calls } = createMockExec([
            { stdout: '', stderr: '', exitCode: 0 },
        ]);
        await openTerminalWindow('issue-review', 'Terminal', exec);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.cmd).toContain('osascript');
        expect(calls[0]!.cmd).toContain('Terminal');
    });

    it('calls executor with osascript for iTerm', async () => {
        const { exec, calls } = createMockExec([
            { stdout: '', stderr: '', exitCode: 0 },
        ]);
        await openTerminalWindow('session', 'iTerm', exec);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.cmd).toContain('osascript');
        expect(calls[0]!.cmd).toContain('iTerm');
    });

    it('does nothing for terminalApp "none"', async () => {
        const { exec, calls } = createMockExec([]);
        await openTerminalWindow('session', 'none', exec);
        expect(calls).toHaveLength(0);
    });

    it('does not throw if executor fails (terminal not found)', async () => {
        const { exec } = createMockExec([
            mockShellError('osascript', { exitCode: 1, stderr: 'app not found' }),
        ]);
        // openTerminalWindow should catch and warn, not throw
        await expect(openTerminalWindow('session', 'Terminal', exec)).resolves.not.toThrow();
    });
});
