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
    return stripAnsi(frame).split('\n').find(l => l.startsWith('> '));
}

function nonCursorIssueLines(frame: string): string[] {
    return stripAnsi(frame).split('\n').filter(l => l.includes('I-') && !l.startsWith('> '));
}

describe('HomeView — cursor navigation', () => {
    it('selected row shows > indicator', () => {
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

    it('non-selected rows show spaces instead of >', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={{ columns: 80, rows: 24 }} layoutProps={{ headerLines: 3, footerLines: 1 }} />
        );
        const others = nonCursorIssueLines(lastFrame()!);
        expect(others.length).toBe(MOCK_ISSUES.length - 1);
        for (const line of others) {
            expect(line).not.toMatch(/^> /);
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

    it('"e" on Blocked issue shows "<- Blocked By" on blocker titles', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('e');
        await tick();
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('<- Blocked By');
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

    it('"r" on Blocked issue shows "<- Blocked By" on blocker titles', async () => {
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
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('<- Blocked By');
    });

    it('"<- Blocked By" clears when cursor moves to non-blocked issue', async () => {
        const handler = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-6 (index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        stdin.write('r');
        await tick();
        // Flash should be active — I-3 and I-5 should show "<- Blocked By"
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
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

    it('"b" on Blocked shows "<- Blocked By" on blocker titles', async () => {
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
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('<- Blocked By');
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

/** Extract the Info column segment from a row line (pipe-separated layout) */
function extractInfoColumn(line: string): string {
    // Layout: caret(2) | ID(5) | Status(8) | Info(6) | Title...
    // Split on pipe separators and pick the Info segment (4th section, index 3)
    const parts = line.split('|');
    // parts[0]=caret, parts[1]=ID, parts[2]=Status, parts[3]=Info, parts[4]=Title...
    return parts.length > 3 ? parts[3] : '';
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
        expect(subtitleSpy).toHaveBeenCalledWith("Info: (*) unread, (i) needs input");
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

    // Test D: "<- Blocked By" flashes on blocker titles when blocked issue is selected
    it('"<- Blocked By" shows on blocker titles when cursor is on a blocked issue', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-6 (index 5) which has blocked_by: [3, 5]
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        const plain = stripAnsi(lastFrame()!);
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
        expect(plain.split('\n').find(l => l.includes('I-5'))).toContain('<- Blocked By');
    });

    // Test E: "<- Blocked By" stops when cursor leaves blocked issue
    it('"<- Blocked By" stops when cursor moves away from blocked issue', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-6 (index 5) - auto-flash starts on I-3, I-5
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        await settle();
        // Confirm flash active
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
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

describe('HomeView — "<- Blocks" flash on blocked issues', () => {
    // Test F: selecting non-blocker shows no "<- Blocks"
    it('selecting non-blocker leaves all titles unchanged (no "<- Blocks")', async () => {
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

    // Test G: selecting blocker shows "<- Blocks" on blocked issue titles
    it('selecting blocker shows "<- Blocks" prepended to blocked issue titles', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate away then back to I-1 to trigger autoFlash
        stdin.write('\x1b[B'); await tick(); // to I-2
        stdin.write('\x1b[A'); await tick(); // back to I-1
        // I-1 blocks I-3 and I-4 — they should show "<- Blocks" in title
        const plain = stripAnsi(lastFrame()!);
        const i3Line = plain.split('\n').find(l => l.includes('I-3'));
        const i4Line = plain.split('\n').find(l => l.includes('I-4'));
        expect(i3Line).toContain('<- Blocks');
        expect(i4Line).toContain('<- Blocks');
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

    // Test G2: Info column has no 'b' indicator on rows showing "<- Blocks" (only unread * allowed)
    it('"<- Blocks" rows have no blocking indicator in Info column', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        const frame = lastFrame()!;
        // I-3 and I-4 should not have 'b' or 'i' in Info column (only unread * is allowed)
        const i3Info = extractInfoColumn(issueLineFor(frame, 3)!);
        const i4Info = extractInfoColumn(issueLineFor(frame, 4)!);
        expect(i3Info).not.toContain('b');
        expect(i3Info).not.toContain('i');
        expect(i4Info).not.toContain('b');
        expect(i4Info).not.toContain('i');
        expect(i4Info.trim()).toBe('');
    });

    // Test H: "<- Blocks" clears when cursor leaves blocker
    it('"<- Blocks" clears when cursor moves away from blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Trigger flash on I-1
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Confirm flash is active
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocks');
        // Navigate to I-7 (blocks nothing)
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        const plain = stripAnsi(lastFrame()!);
        const issueLines = plain.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocks');
        }
    });

    // Test I: non-blocked titles are dimmed when Shift+D is toggled on while on a blocker
    it('non-blocked titles are dimmed when cursor is on a blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate away then back to I-1 to trigger autoFlash
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Toggle dim on with Shift+D
        stdin.write('D'); await tick();
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n');
        // I-3 and I-4 show "<- Blocks" (red bold, NOT dimmed)
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

    // Test J: dimming clears when cursor leaves blocker (highlight gone, dim has no effect)
    it('dimming clears when cursor moves away from blocker', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-1 to trigger blocker highlight
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Toggle dim on with Shift+D
        stdin.write('D'); await tick();
        // Confirm dimming is active
        const beforeRaw = lastFrame()!;
        const i2Before = beforeRaw.split('\n').find(l => stripAnsi(l).includes('I-2'))!;
        expect(i2Before).toContain('\x1b[2m');
        // Navigate to I-7 (blocks nothing) — no highlight active, dim has no visible effect
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n').filter(l => stripAnsi(l).includes('I-'));
        for (const line of rawLines) {
            expect(line).not.toContain('\x1b[2m');
        }
    });
});

// ─── Part 2: New test coverage ──────────────────────────────────────────────

describe('HomeView — Shift+D dim toggle', () => {
    it('Shift+D toggles dim on, second Shift+D toggles dim off', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-1 (blocker of I-3, I-4) via down+up to trigger autoFlash
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Toggle dim ON
        stdin.write('D'); await tick();
        const rawOn = lastFrame()!;
        const i2On = rawOn.split('\n').find(l => stripAnsi(l).includes('I-2'))!;
        expect(i2On, 'I-2 should be dimmed after Shift+D on').toContain('\x1b[2m');
        // Toggle dim OFF
        stdin.write('D'); await tick();
        const rawOff = lastFrame()!;
        const i2Off = rawOff.split('\n').find(l => stripAnsi(l).includes('I-2'))!;
        expect(i2Off, 'I-2 should not be dimmed after second Shift+D').not.toContain('\x1b[2m');
    });

    it('Shift+D has no visible effect when no highlight is active', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-7 (index 6) which blocks nothing and has no blockers
        for (let i = 0; i < 6; i++) { stdin.write('\x1b[B'); await tick(); }
        // Toggle dim on
        stdin.write('D'); await tick();
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n').filter(l => stripAnsi(l).includes('I-'));
        for (const line of rawLines) {
            expect(line).not.toContain('\x1b[2m');
        }
    });

    it('dim state persists across cursor movements while highlight remains', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-1 (blocker) via down+up
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        // Toggle dim on
        stdin.write('D'); await tick();
        // Move to I-2 (also a blocker of I-5)
        stdin.write('\x1b[B'); await tick();
        const rawFrame = lastFrame()!;
        const rawLines = rawFrame.split('\n');
        // I-2 blocks I-5 — non-highlighted rows should still be dimmed
        // I-1, I-3, I-4, I-6, I-7, I-8 are non-highlighted (not I-5 and not selected I-2)
        const i1Line = rawLines.find(l => stripAnsi(l).includes('I-1'))!;
        expect(i1Line, 'I-1 should be dimmed').toContain('\x1b[2m');
    });

    it('Shift+D during trash confirmation is ignored', async () => {
        const footerSpy = vi.fn();
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setFooterShortcuts={footerSpy} />
        );
        await settle();
        // Enter trash confirmation
        stdin.write('x'); await settle();
        expect(footerSpy).toHaveBeenCalledWith(CONFIRM_TRASH_SHORTCUTS);
        footerSpy.mockClear();
        // Try Shift+D — should be ignored (still in confirm state)
        stdin.write('D'); await settle();
        // Footer should not have changed (still in confirmation)
        expect(footerSpy).not.toHaveBeenCalled();
        // Esc should still cancel confirmation normally
        stdin.write('\x1b'); await settle();
        expect(footerSpy).toHaveBeenCalledWith(STATUS_SHORTCUTS[IssueStatus.Active]);
    });
});

describe('HomeView — blockedByCurrentIssue filters', () => {
    it('blockedByCurrentIssue excludes Resolved blocked issues', async () => {
        const issues = [
            makeIssue({ inum: 1, title: 'active_blocker', status: IssueStatus.Active }),
            makeIssue({ inum: 2, title: 'resolved_blocked', status: IssueStatus.Resolved, blocked_by: [1] }),
            makeIssue({ inum: 3, title: 'inqueue_blocked', status: IssueStatus.InQueue, blocked_by: [1] }),
        ];
        const { lastFrame, stdin } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-1 (blocker) via down+up to trigger autoFlash
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[A'); await tick();
        const plain = stripAnsi(lastFrame()!);
        // I-3 (InQueue) should show "<- Blocks"
        expect(plain.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocks');
        // I-2 (Resolved) should NOT show "<- Blocks"
        expect(plain.split('\n').find(l => l.includes('I-2'))).not.toContain('Blocks');
    });

    it('hasUnresolvedBlockers returns false when blocker inum not in issues list', async () => {
        const issues = [
            makeIssue({ inum: 1, title: 'other_issue', status: IssueStatus.Active }),
            makeIssue({ inum: 2, title: 'deferred_with_ghost_blocker', status: IssueStatus.Deferred, blocked_by: [999] }),
        ];
        const handler = vi.fn();
        const { stdin } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} onStatusHotkeyPressed={handler} />
        );
        await tick();
        // Navigate to I-2 (Deferred with blocker 999 that doesn't exist)
        stdin.write('\x1b[B'); await tick();
        stdin.write('e'); await tick();
        // Should enqueue normally since blocker 999 doesn't exist in the list
        expect(handler).toHaveBeenCalledWith({ inum: 2, newStatus: IssueStatus.InQueue });
    });
});

describe('HomeView — manual flash interaction', () => {
    it('manual flash ("e" on Blocked) then cursor move clears flash', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES_WITH_BLOCKERS} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        // Navigate to I-6 (Blocked, index 5)
        for (let i = 0; i < 5; i++) { stdin.write('\x1b[B'); await tick(); }
        // Manual flash via 'e'
        stdin.write('e'); await tick();
        const before = stripAnsi(lastFrame()!);
        expect(before.split('\n').find(l => l.includes('I-3'))).toContain('<- Blocked By');
        // Move cursor away to I-7 (no blockers)
        stdin.write('\x1b[B'); await tick();
        const after = stripAnsi(lastFrame()!);
        const issueLines = after.split('\n').filter(l => l.includes('I-'));
        for (const line of issueLines) {
            expect(line).not.toContain('Blocked By');
        }
    });
});

describe('HomeView — header subtitle', () => {
    it('header subtitle changes during trash confirmation and reverts', async () => {
        const subtitleSpy = vi.fn();
        const { stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} setHeaderSubtitleOverride={subtitleSpy} />
        );
        await settle();
        // Default subtitle
        expect(subtitleSpy).toHaveBeenCalledWith("Info: (*) unread, (i) needs input");
        subtitleSpy.mockClear();
        // Enter trash confirmation
        stdin.write('x'); await settle();
        expect(subtitleSpy).toHaveBeenCalledWith("Confirm delete with 'x', Esc to cancel");
        subtitleSpy.mockClear();
        // Cancel with Esc
        stdin.write('\x1b'); await settle();
        expect(subtitleSpy).toHaveBeenCalledWith("Info: (*) unread, (i) needs input");
    });

    it('auto-flash does NOT trigger on initial mount for first blocked issue', async () => {
        // First issue has blockers — verify no flash on initial render
        const issues = [
            makeIssue({ inum: 1, title: 'blocked_first', status: IssueStatus.Blocked, blocked_by: [2] }),
            makeIssue({ inum: 2, title: 'blocker_second', status: IssueStatus.Active }),
        ];
        const { lastFrame } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        const plain = stripAnsi(lastFrame()!);
        // No auto-flash on mount — requires arrow key navigation
        expect(plain.split('\n').find(l => l.includes('I-2'))).not.toContain('Blocked By');
    });
});

describe('HomeView — column layout', () => {
    it('column header order matches issue row column order', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} maxAgents={MAX_AGENTS} terminalProps={TP} layoutProps={LP} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const headerLine = lines[0];
        const headerParts = headerLine.split('|').map(s => s.trim()).filter(Boolean);
        // Header should show: ID#, Status, Info, Title
        expect(headerParts).toEqual(['ID#', 'Status', 'Info', 'Title']);
        // First data row should have same column structure (pipe-separated)
        const dataLine = lines[1];
        const dataParts = dataLine.split('|');
        // Should have at least the same number of pipe-separated segments
        expect(dataParts.length).toBeGreaterThanOrEqual(headerLine.split('|').length - 1);
    });

    it('single issue list cursor bounds', async () => {
        const issues = [makeIssue({ inum: 99, title: 'only_issue', status: IssueStatus.Active })];
        const { lastFrame, stdin } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} />
        );
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-99');
        // Up on single item stays on same item
        stdin.write('\x1b[A'); await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-99');
        // Down on single item stays on same item
        stdin.write('\x1b[B'); await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-99');
    });
});

describe('HomeView — InfoMarker edge cases', () => {
    it('InfoMarker shows * for unread issues', async () => {
        const issues = [makeIssue({ inum: 1, title: 'unread_issue', status: IssueStatus.Active })];
        const { lastFrame } = render(
            <HomeView issues={issues} unreadInums={new Set([1])} maxAgents={3} terminalProps={TP} layoutProps={LP} />
        );
        const frame = lastFrame()!;
        const info = extractInfoColumn(issueLineFor(frame, 1)!);
        expect(info).toContain('*');
    });

    it('InfoMarker shows no indicator for non-unread issues', () => {
        const issues = [makeIssue({ inum: 1, title: 'read_issue', status: IssueStatus.Active })];
        const { lastFrame } = render(
            <HomeView issues={issues} unreadInums={new Set()} maxAgents={3} terminalProps={TP} layoutProps={LP} />
        );
        const frame = lastFrame()!;
        const info = extractInfoColumn(issueLineFor(frame, 1)!);
        expect(info.trim()).toBe('');
    });
});
