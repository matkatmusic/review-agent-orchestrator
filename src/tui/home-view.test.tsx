import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { HomeView } from './home-view.js';
import type { Issue, Dependency } from '../types.js';
import { IssueStatus } from '../types.js';
import { LayoutProps, TerminalProps } from './views.js';
import { STATUS_SHORTCUTS } from './footer.js';

function makeIssue(overrides: Partial<Issue> & { inum: number; title: string }): Issue {
    return {
        description: '',
        status: IssueStatus.InQueue,
        created_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        issue_revision: 1,
        agent_last_read_at: null,
        user_last_viewed_at: null,
        ...overrides,
    };
}

const MOCK_ISSUES: Issue[] = [
    makeIssue({ inum: 1, title: 'migrate_ServerDerivedFields', status: IssueStatus.Active }),
    makeIssue({ inum: 2, title: 'migrate_SessionCredentials', status: IssueStatus.Active }),
    makeIssue({ inum: 3, title: 'rate_limiting_design', status: IssueStatus.InQueue }),
    makeIssue({ inum: 4, title: 'payload_encryption_flow', status: IssueStatus.InQueue }),
    makeIssue({ inum: 5, title: 'docker_healthcheck', status: IssueStatus.InQueue }),
    makeIssue({ inum: 6, title: 'stale_session_cleanup', status: IssueStatus.Blocked }),
    makeIssue({ inum: 7, title: 'legacy_api_removal', status: IssueStatus.Deferred }),
    makeIssue({ inum: 8, title: 'initial_setup_task', status: IssueStatus.Resolved }),
];

const UNREAD_INUMS = new Set([3, 6]);
const MAX_AGENTS = 3;

describe('HomeView (Phase 1 — render only)', () => {
    it('renders without crashing', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(lastFrame()).toBeDefined();
    });

    it('renders issue titles in the list', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('migrate_ServerDerivedFields');
        expect(plain).toContain('migrate_SessionCredentials');
        expect(plain).toContain('rate_limiting_design');
    });

    it('renders inum identifiers (I-N format)', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('I-1');
        expect(plain).toContain('I-5');
        expect(plain).toContain('I-8');
    });

    it('renders status text for each issue', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i1Line = lines.find(l => l.includes('I-1'));
        expect(i1Line).toContain('Active');
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('In Queue');
        const i6Line = lines.find(l => l.includes('I-6'));
        expect(i6Line).toContain('Blocked');
    });

    it('renders unread marker for unread issues', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('\u2731');
        const i6Line = lines.find(l => l.includes('I-6'));
        expect(i6Line).toContain('\u2731');
    });

    it('does not render unread marker for read issues', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i1Line = lines.find(l => l.includes('I-1'));
        expect(i1Line).not.toContain('\u2731');
        const i2Line = lines.find(l => l.includes('I-2'));
        expect(i2Line).not.toContain('\u2731');
    });

    it('renders empty state when no issues', () => {
        const { lastFrame } = render(
            <HomeView issues={[]} dependencies={[]} unreadInums={new Set()} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain.toLowerCase()).toMatch(/no issues/);
    });
});

const tick = () => new Promise(r => setTimeout(r, 0));

function cursorLine(frame: string): string | undefined {
    return stripAnsi(frame).split('\n').find(l => l.includes('\u25B8'));
}

function nonCursorIssueLines(frame: string): string[] {
    return stripAnsi(frame).split('\n').filter(l => l.includes('I-') && !l.includes('\u25B8'));
}

describe('HomeView — cursor navigation', () => {
    it('selected row shows \u25B8 indicator', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const frame = lastFrame()!;
        expect(cursorLine(frame)).toBeDefined();
    });

    it('selected row inum matches first issue on initial render', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('non-selected rows show spaces instead of \u25B8', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const others = nonCursorIssueLines(lastFrame()!);
        expect(others.length).toBe(MOCK_ISSUES.length - 1);
        for (const line of others) {
            expect(line).not.toContain('\u25B8');
        }
    });

    it('down arrow moves cursor to next item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[B');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-2');
    });

    it('up arrow moves cursor to previous item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[B');
        await tick();
        stdin.write('\x1b[A');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('cursor does not go above first item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[A');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('cursor does not go below last item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        for (let i = 0; i < 20; i++) {
            stdin.write('\x1b[B');
            await tick();
        }
        expect(cursorLine(lastFrame()!)).toContain('I-8');
    });
});

const TP : TerminalProps = { columns: 80, rows: 24 };
const LP : LayoutProps = { headerLines: 3, footerLines: 1 };

describe('HomeView — status change hotkeys', () => {
    it('"d" on Active calls handler with Deferred', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // I-1 is Active
        stdin.write('d');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 1, newStatus: IssueStatus.Deferred });
    });

    it('"r" on Active calls handler with Resolved', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 1, newStatus: IssueStatus.Resolved });
    });

    it('"e" on Deferred calls handler with InQueue', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-7 (Deferred, index 6)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 7, newStatus: IssueStatus.InQueue });
    });

    it('"e" on Resolved calls handler with InQueue (Phase 1 stub)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-8 (Resolved, index 7)
        for (let i = 0; i < 7; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 8, newStatus: IssueStatus.InQueue });
    });

    it('"f" on InQueue calls handler with Active (Phase 1 stub)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-3 (InQueue, index 2)
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('f');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 3, newStatus: IssueStatus.Active });
    });

    it('"d" on InQueue calls handler with Deferred', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-3 (InQueue, index 2)
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('d');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 3, newStatus: IssueStatus.Deferred });
    });

    it('"r" on InQueue calls handler with Resolved', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-3 (InQueue, index 2)
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 3, newStatus: IssueStatus.Resolved });
    });

    it('"r" on Deferred calls handler with Resolved', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-7 (Deferred, index 6)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 7, newStatus: IssueStatus.Resolved });
    });

    it('"d" on Blocked does NOT call handler (no-op)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (Blocked, index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('d');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('hotkey targets the cursor-selected issue after navigation', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('\x1b[B'); // down to I-2
        await tick();
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 2, newStatus: IssueStatus.Resolved });
    });

    it('does not crash when onStatusChange is undefined', async () => {
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('e');
        await tick();
        // no error thrown
    });
});

const MOCK_DEPS: Dependency[] = [
    { blocker_inum: 1, blocked_inum: 3 },
    { blocker_inum: 1, blocked_inum: 4 },
    { blocker_inum: 2, blocked_inum: 5 },
    { blocker_inum: 3, blocked_inum: 6 },
    { blocker_inum: 5, blocked_inum: 6 },
];

function issueLineFor(frame: string, inum: number): string | undefined {
    return stripAnsi(frame).split('\n').find(l => l.includes(`I-${inum}`));
}

describe('HomeView — blocked status flash', () => {
    it('"e" on Blocked issue does NOT call onStatusHotkeyPressed (flashes instead)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"e" on Blocked issue shows > < arrows on blocker rows', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        const frame = lastFrame()!;
        expect(issueLineFor(frame, 3)).toContain('>');
        expect(issueLineFor(frame, 5)).toContain('>');
        expect(issueLineFor(frame, 1)).not.toContain('>');
    });

    it('"r" on Blocked issue does NOT call onStatusHotkeyPressed (flashes instead)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"r" on Blocked issue shows > < arrows on blocker rows', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        const frame = lastFrame()!;
        // I-3 and I-5 are blockers of I-6
        expect(issueLineFor(frame, 3)).toContain('>');
        expect(issueLineFor(frame, 3)).toContain('<');
        expect(issueLineFor(frame, 5)).toContain('>');
        expect(issueLineFor(frame, 5)).toContain('<');
        // Non-blockers should NOT have arrows
        expect(issueLineFor(frame, 1)).not.toContain('>');
        expect(issueLineFor(frame, 2)).not.toContain('>');
    });

    it('flash clears when cursor moves', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        // Flash should be active
        expect(issueLineFor(lastFrame()!, 3)).toContain('>');
        // Move cursor down to clear flash
        stdin.write('\x1b[B');
        await tick();
        const frame = lastFrame()!;
        expect(issueLineFor(frame, 3)).not.toContain('>');
        expect(issueLineFor(frame, 5)).not.toContain('>');
    });

    it('"b" on Blocked flashes blockers', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={MOCK_DEPS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (Blocked, index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('b');
        await tick();
        expect(handler).not.toHaveBeenCalled();
        const frame = lastFrame()!;
        expect(issueLineFor(frame, 3)).toContain('>');
        expect(issueLineFor(frame, 5)).toContain('>');
    });
});

describe('HomeView — deferred blocker guard', () => {
    it('"e" on Deferred with unresolved blockers does NOT enqueue (flashes instead)', async () => {
        const issues = [
            makeIssue({ inum: 10, title: 'blocker_issue', status: IssueStatus.Active }),
            makeIssue({ inum: 11, title: 'was_blocked_now_deferred', status: IssueStatus.Deferred }),
        ];
        const deps: Dependency[] = [{ blocker_inum: 10, blocked_inum: 11 }];
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={issues} dependencies={deps} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('\x1b[B'); // move to I-11 (Deferred, index 1)
        await tick();
        stdin.write('e');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"e" on Deferred with all blockers resolved enqueues normally', async () => {
        const issues = [
            makeIssue({ inum: 10, title: 'blocker_resolved', status: IssueStatus.Resolved }),
            makeIssue({ inum: 11, title: 'was_blocked_now_deferred', status: IssueStatus.Deferred }),
        ];
        const deps: Dependency[] = [{ blocker_inum: 10, blocked_inum: 11 }];
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={issues} dependencies={deps} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('\x1b[B'); // move to I-11 (Deferred, index 1)
        await tick();
        stdin.write('e');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 11, newStatus: IssueStatus.InQueue });
    });
});

describe('HomeView — setFooterShortcuts', () => {
    it('calls with Active shortcuts on mount when first issue is Active', async () => {
        const handler = vi.fn();
        render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        expect(handler).toHaveBeenCalledWith(STATUS_SHORTCUTS[IssueStatus.Active]);
    });

    it('calls with InQueue shortcuts after navigating to InQueue issue', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        handler.mockClear();
        // Navigate to I-3 (InQueue, index 2) — I-1 and I-2 are both Active, so status only changes at I-3
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        await tick(); // extra tick for useEffect
        expect(handler).toHaveBeenCalledWith(STATUS_SHORTCUTS[IssueStatus.InQueue]);
    });

    it('does not call when issues list is empty', async () => {
        const handler = vi.fn();
        render(
            <HomeView issues={[]} dependencies={[]} unreadInums={new Set()} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('HomeView — no-op hotkey guards', () => {
    it('"e" on Active issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // I-1 is Active
        stdin.write('e');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"f" on Active issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // I-1 is Active
        stdin.write('f');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"a" on any issue does not call handler (removed key)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('a');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"d" on Deferred issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-7 (Deferred, index 6)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('d');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"d" on Resolved issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-8 (Resolved, index 7)
        for (let i = 0; i < 7; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('d');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"r" on Resolved issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-8 (Resolved, index 7)
        for (let i = 0; i < 7; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"e" on InQueue issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-3 (InQueue, index 2)
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('e');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"f" on Deferred issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} dependencies={[]} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-7 (Deferred, index 6)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('f');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });
});
