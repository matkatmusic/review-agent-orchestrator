import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { HomeView } from './home-view.js';
import type { Issue } from '../types.js';
import { IssueStatus } from '../types.js';
import { LayoutProps, TerminalProps } from './views.js';
import { STATUS_SHORTCUTS, CONFIRM_TRASH_SHORTCUTS } from './footer.js';

function makeIssue(overrides: Partial<Issue> & { inum: number; title: string }): Issue {
    return {
        description: '',
        status: IssueStatus.InQueue,
        created_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        trashed_at: null,
        issue_revision: 1,
        agent_last_read_at: null,
        user_last_viewed_at: null,
        blocked_by: [],
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(lastFrame()).toBeDefined();
    });

    it('renders issue titles in the list', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('migrate_ServerDerivedFields');
        expect(plain).toContain('migrate_SessionCredentials');
        expect(plain).toContain('rate_limiting_design');
    });

    it('renders inum identifiers (I-N format)', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('I-1');
        expect(plain).toContain('I-5');
        expect(plain).toContain('I-8');
    });

    it('renders status text for each issue', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('*');
        const i6Line = lines.find(l => l.includes('I-6'));
        expect(i6Line).toContain('*');
    });

    it('does not render unread marker for read issues', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i1Info = extractInfoColumn(lines.find(l => l.includes('I-1'))!);
        expect(i1Info).not.toContain('*');
        const i2Info = extractInfoColumn(lines.find(l => l.includes('I-2'))!);
        expect(i2Info).not.toContain('*');
    });

    it('renders empty state when no issues', () => {
        const { lastFrame } = render(
            <HomeView issues={[]} unreadInums={new Set()} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain.toLowerCase()).toMatch(/no issues/);
    });
});

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = () => new Promise(r => setTimeout(r, 50));

function cursorLine(frame: string): string | undefined {
    return stripAnsi(frame).split('\n').find(l => l.includes('\u25B8'));
}

function nonCursorIssueLines(frame: string): string[] {
    return stripAnsi(frame).split('\n').filter(l => l.includes('I-') && !l.includes('\u25B8'));
}

describe('HomeView — cursor navigation', () => {
    it('selected row shows \u25B8 indicator', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const frame = lastFrame()!;
        expect(cursorLine(frame)).toBeDefined();
    });

    it('selected row inum matches first issue on initial render', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('non-selected rows show spaces instead of \u25B8', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const others = nonCursorIssueLines(lastFrame()!);
        expect(others.length).toBe(MOCK_ISSUES.length - 1);
        for (const line of others) {
            expect(line).not.toContain('\u25B8');
        }
    });

    it('down arrow moves cursor to next item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[B');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-2');
    });

    it('up arrow moves cursor to previous item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[A');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('cursor does not go below last item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('r');
        await tick();
        expect(handler).toHaveBeenCalledWith({ inum: 1, newStatus: IssueStatus.Resolved });
    });

    it('"e" on Deferred calls handler with InQueue', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('e');
        await tick();
        // no error thrown
    });
});

const MOCK_ISSUES_WITH_BLOCKERS: Issue[] = [
    makeIssue({ inum: 1, title: 'migrate_ServerDerivedFields', status: IssueStatus.Active }),
    makeIssue({ inum: 2, title: 'migrate_SessionCredentials', status: IssueStatus.Active }),
    makeIssue({ inum: 3, title: 'rate_limiting_design', status: IssueStatus.InQueue, blocked_by: [1] }),
    makeIssue({ inum: 4, title: 'payload_encryption_flow', status: IssueStatus.InQueue, blocked_by: [1] }),
    makeIssue({ inum: 5, title: 'docker_healthcheck', status: IssueStatus.InQueue, blocked_by: [2] }),
    makeIssue({ inum: 6, title: 'stale_session_cleanup', status: IssueStatus.Blocked, blocked_by: [3, 5] }),
    makeIssue({ inum: 7, title: 'legacy_api_removal', status: IssueStatus.Deferred }),
    makeIssue({ inum: 8, title: 'initial_setup_task', status: IssueStatus.Resolved }),
];

function issueLineFor(frame: string, inum: number): string | undefined {
    return stripAnsi(frame).split('\n').find(l => l.includes(`I-${inum}`));
}

describe('HomeView — blocked status flash', () => {
    it('"e" on Blocked issue does NOT call onStatusHotkeyPressed (flashes instead)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"e" on Blocked issue shows "Blocked By ->" on blocker titles', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('Blocked By ->');
    });

    it('"r" on Blocked issue does NOT call onStatusHotkeyPressed (flashes instead)', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"r" on Blocked issue shows "Blocked By ->" on blocker titles', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('Blocked By ->');
    });

    it('"Blocked By ->" clears when cursor moves to non-blocked issue', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        // Flash should be active — I-3 and I-5 should show "Blocked By ->"
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        // Move cursor down to I-7 (no blockers) to clear flash
        stdin.write('\x1b[B');
        await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(cursorLine(lastFrame()!)).toContain('I-7');
        const issueLines = plain.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocked By');
        }
    });

    it('"b" on Blocked shows "Blocked By ->" on blocker titles', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (Blocked, index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('b');
        await tick();
        expect(handler).not.toHaveBeenCalled();
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('Blocked By ->');
    });
});

describe('HomeView — deferred blocker guard', () => {
    it('"e" on Deferred with unresolved blockers does NOT enqueue (flashes instead)', async () => {
        const issues = [
            makeIssue({ inum: 10, title: 'blocker_issue', status: IssueStatus.Active }),
            makeIssue({ inum: 11, title: 'was_blocked_now_deferred', status: IssueStatus.Deferred, blocked_by: [10] }),
        ];
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            makeIssue({ inum: 11, title: 'was_blocked_now_deferred', status: IssueStatus.Deferred, blocked_by: [10] }),
        ];
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        expect(handler).toHaveBeenCalledWith(STATUS_SHORTCUTS[IssueStatus.Active]);
    });

    it('calls with InQueue shortcuts after navigating to InQueue issue', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
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
            <HomeView issues={[]} unreadInums={new Set()} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={handler} />
        );
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('HomeView — no-op hotkey guards', () => {
    it('"e" on Active issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        stdin.write('a');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });

    it('"d" on Deferred issue does not call handler', async () => {
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-7 (Deferred, index 6)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('f');
        await tick();
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('HomeView — trash confirmation', () => {
    it('"x" once enters confirmation state (footer changes to confirm shortcuts)', async () => {
        const footerSpy = vi.fn();
        const trashSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} onTrashIssue={trashSpy} />
        );
        await settle();
        footerSpy.mockClear();
        stdin.write('x');
        await settle();
        expect(footerSpy).toHaveBeenCalledWith(CONFIRM_TRASH_SHORTCUTS);
        expect(trashSpy).not.toHaveBeenCalled();
    });

    it('"x" "x" calls onTrashIssue with selected issue inum', async () => {
        const trashSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onTrashIssue={trashSpy} />
        );
        await tick();
        stdin.write('x');
        await settle();
        stdin.write('x');
        await settle();
        expect(trashSpy).toHaveBeenCalledWith(1);
    });

    it('"x" then Esc cancels (restores normal footer)', async () => {
        const footerSpy = vi.fn();
        const trashSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} onTrashIssue={trashSpy} />
        );
        await settle();
        footerSpy.mockClear();
        stdin.write('x');
        await settle();
        expect(footerSpy).toHaveBeenCalledWith(CONFIRM_TRASH_SHORTCUTS);
        footerSpy.mockClear();
        stdin.write('\x1b');
        await settle();
        expect(footerSpy).toHaveBeenCalledWith(STATUS_SHORTCUTS[IssueStatus.Active]);
        expect(trashSpy).not.toHaveBeenCalled();
    });

    it('"x" then other key (e.g. "a") stays in confirm state (ignored)', async () => {
        const trashSpy = vi.fn();
        const footerSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} onTrashIssue={trashSpy} />
        );
        await settle();
        stdin.write('x');
        await settle();
        footerSpy.mockClear();
        stdin.write('a');
        await settle();
        expect(trashSpy).not.toHaveBeenCalled();
        // Still in confirm state -- footer should NOT have been reset
        expect(footerSpy).not.toHaveBeenCalled();
    });

    it('"x" then arrow key stays in confirm state (ignored)', async () => {
        const trashSpy = vi.fn();
        const footerSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} onTrashIssue={trashSpy} />
        );
        await settle();
        stdin.write('x');
        await settle();
        footerSpy.mockClear();
        stdin.write('\x1b[B');
        await settle();
        expect(trashSpy).not.toHaveBeenCalled();
        // Still in confirm state -- footer should NOT have been reset
        expect(footerSpy).not.toHaveBeenCalled();
    });

    it('"x" available from all statuses', async () => {
        const statuses = [IssueStatus.Active, IssueStatus.InQueue, IssueStatus.Blocked, IssueStatus.Deferred, IssueStatus.Resolved];
        for (const status of statuses) {
            const footerSpy = vi.fn();
            const issues = [makeIssue({ inum: 99, title: 'test_issue', status })];
            const { stdin } = render(
                <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} />
            );
            await settle();
            footerSpy.mockClear();
            stdin.write('x');
            await settle();
            expect(footerSpy, `status ${IssueStatus[status]}`).toHaveBeenCalledWith(CONFIRM_TRASH_SHORTCUTS);
        }
    });

    it('confirm state highlights selected row red', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('x');
        await tick();
        const frame = lastFrame()!;
        // The frame should contain red ANSI codes on the I-1 row
        const lines = frame.split('\n');
        const i1Line = lines.find(l => stripAnsi(l).includes('I-1'));
        expect(i1Line).toBeDefined();
        // Red ANSI escape: \x1b[31m
        expect(i1Line).toContain('\x1b[31m');
    });

    it('"x" "x" on navigated issue trashes the correct inum', async () => {
        const trashSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onTrashIssue={trashSpy} />
        );
        await tick();
        // Navigate to I-3 (index 2)
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('x'); await settle();
        stdin.write('x'); await settle();
        expect(trashSpy).toHaveBeenCalledWith(3);
    });
});

/** Extract the Info column segment from a row line (between ID column and Title column) */
function extractInfoColumn(line: string): string {
    // Layout: cursor(2) + sep(1) + ID(5) + sep(1) + Info(8) + sep(1) + Title...
    // The Info column starts at position 2+1+5+1 = 9 and is 8 chars wide
    return line.slice(9, 17);
}

describe('HomeView — Info column + blocking indicators', () => {
    // Test A: header shows 'Info' column (not 'Unread')
    it('header row contains "Info" column label', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        const headerLine = plain.split('\n')[0];
        expect(headerLine).toContain('Info');
        expect(headerLine).not.toContain('Unread');
    });

    // Test B: hint text sent to header subtitle
    it('sets header subtitle with hint text on mount', async () => {
        const subtitleSpy = vi.fn();
        render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setHeaderSubtitleOverride={subtitleSpy} />
        );
        await tick();
        expect(subtitleSpy).toHaveBeenCalledWith("Info: '*' unread  'i' needs input");
    });

    // Test C: no static 'b' in Info column (blocking shown via title flash only)
    it("does not show 'b' in Info column for any issue", () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        const frame = lastFrame()!;
        for (const inum of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const info = extractInfoColumn(issueLineFor(frame, inum)!);
            expect(info, `I-${inum} Info should not contain 'b'`).not.toContain('b');
        }
    });

    // Test D: "Blocked By ->" flashes on blocker titles when blocked issue is selected
    it('"Blocked By ->" shows on blocker titles when cursor is on a blocked issue', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-6 (index 5) which has blocked_by: [3, 5]
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('Blocked By ->');
    });

    // Test E: "Blocked By ->" stops when cursor leaves blocked issue
    it('"Blocked By ->" stops when cursor moves away from blocked issue', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-6 (index 5) - auto-flash starts on I-3, I-5
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        await settle();
        // Confirm flash active
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('Blocked By ->');
        // Navigate away to I-7 (index 6) — no unresolved blockers, flash clears
        stdin.write('\x1b[B'); await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-7');
        const plain = stripAnsi(lastFrame()!);
        const issueLines = plain.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocked By');
        }
    });
});

describe('HomeView — "Blocks ->" flash on blocked issues', () => {
    // Test F: selecting non-blocker shows no "Blocks ->"
    it('selecting non-blocker leaves all titles unchanged (no "Blocks ->")', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-7 (index 6) which blocks nothing
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        const plain = stripAnsi(lastFrame()!);
        const issueLines = plain.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocks');
        }
    });

    // Test G: selecting blocker shows "Blocks ->" on blocked issue titles
    it('selecting blocker shows "Blocks ->" prepended to blocked issue titles', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate away then back to I-1 to trigger autoFlash
        stdin.write('\x1b[B'); await tick(); // to I-2
        stdin.write('\x1b[A'); await tick(); // back to I-1
        // I-1 blocks I-3 and I-4 — they should show "Blocks ->" in title
        const plain = stripAnsi(lastFrame()!);
        const i3Line = plain.split('\n').find(l => l.includes('I-3'));
        const i4Line = plain.split('\n').find(l => l.includes('I-4'));
        expect(i3Line).toContain('Blocks ->');
        expect(i4Line).toContain('Blocks ->');
        // Other issues should NOT show "Blocks"
        const i2Line = plain.split('\n').find(l => l.includes('I-2'));
        const i5Line = plain.split('\n').find(l => l.includes('I-5'));
        const i6Line = plain.split('\n').find(l => l.includes('I-6'));
        const i7Line = plain.split('\n').find(l => l.includes('I-7'));
        const i8Line = plain.split('\n').find(l => l.includes('I-8'));
        expect(i2Line).not.toContain('Blocks');
        expect(i5Line).not.toContain('Blocks');
        expect(i6Line).not.toContain('Blocks');
        expect(i7Line).not.toContain('Blocks');
        expect(i8Line).not.toContain('Blocks');
    });

    // Test G2: Info column is blank on rows showing "Blocks ->"
    it('"Blocks ->" rows have blank Info column', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        const frame = lastFrame()!;
        // I-3 and I-4 should have blank Info columns (no *, b, or i)
        const i3Info = extractInfoColumn(issueLineFor(frame, 3)!);
        const i4Info = extractInfoColumn(issueLineFor(frame, 4)!);
        expect(i3Info.trim()).toBe('');
        expect(i4Info.trim()).toBe('');
    });

    // Test H: "Blocks ->" clears when cursor leaves blocker
    it('"Blocks ->" clears when cursor moves away from blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Trigger flash on I-1
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Confirm flash is active
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('Blocks ->');
        // Navigate to I-7 (blocks nothing)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        const plain = stripAnsi(lastFrame()!);
        const issueLines = plain.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocks');
        }
    });

    // Test I: non-blocked titles are dimmed when cursor is on a blocker
    it('non-blocked titles are dimmed when cursor is on a blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate away then back to I-1 to trigger autoFlash
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n');
        // I-3 and I-4 show "Blocks ->" (red bold, NOT dimmed)
        const i3Raw = rawLines.find(l => stripAnsi(l).includes('I-3'))!;
        const i4Raw = rawLines.find(l => stripAnsi(l).includes('I-4'))!;
        expect(i3Raw).not.toContain('\x1b[2m');
        expect(i4Raw).not.toContain('\x1b[2m');
        // Non-blocked, non-selected titles (I-2, I-5, I-6, I-7, I-8) should be dimmed
        for (const inum of [2, 5, 6, 7, 8]) {
            const line = rawLines.find(l => stripAnsi(l).includes(`I-${inum}`))!;
            expect(line, `I-${inum} should be dimmed`).toContain('\x1b[2m');
        }
    });

    // Test J: dimming clears when cursor leaves blocker
    it('dimming clears when cursor moves away from blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-1 to trigger blocker highlight
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Confirm dimming is active
        const beforeRaw = lastFrame()!;
        const i2Before = beforeRaw.split('\n').find(l => stripAnsi(l).includes('I-2'))!;
        expect(i2Before).toContain('\x1b[2m');
        // Navigate to I-7 (blocks nothing)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n').filter(l => stripAnsi(l).includes('I-'));
        for (const line of rawLines) {
            expect(line).not.toContain('\x1b[2m');
        }
    });
});
