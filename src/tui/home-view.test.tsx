import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { HomeView } from './home-view.js';
import type { Issue } from '../types.js';
import { IssueStatus } from '../types.js';

function makeIssue(overrides: Partial<Issue> & { inum: number; title: string }): Issue {
    return {
        description: '',
        status: IssueStatus.Awaiting,
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
    makeIssue({ inum: 3, title: 'rate_limiting_design', status: IssueStatus.Awaiting }),
    makeIssue({ inum: 4, title: 'payload_encryption_flow', status: IssueStatus.Awaiting }),
    makeIssue({ inum: 5, title: 'docker_healthcheck', status: IssueStatus.Awaiting }),
    makeIssue({ inum: 6, title: 'stale_session_cleanup', status: IssueStatus.Blocked }),
    makeIssue({ inum: 7, title: 'legacy_api_removal', status: IssueStatus.Deferred }),
    makeIssue({ inum: 8, title: 'initial_setup_task', status: IssueStatus.Resolved }),
];

const UNREAD_INUMS = new Set([3, 6]);

describe('HomeView (Phase 1 — render only)', () => {
    it('renders without crashing', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(lastFrame()).toBeDefined();
    });

    it('renders issue titles in the list', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('migrate_ServerDerivedFields');
        expect(plain).toContain('migrate_SessionCredentials');
        expect(plain).toContain('rate_limiting_design');
    });

    it('renders inum identifiers (I-N format)', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        expect(plain).toContain('I-1');
        expect(plain).toContain('I-5');
        expect(plain).toContain('I-8');
    });

    it('renders status text for each issue', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        const plain = stripAnsi(lastFrame()!);
        const lines = plain.split('\n');
        const i1Line = lines.find(l => l.includes('I-1'));
        expect(i1Line).toContain('Active');
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('Awaiting');
        const i6Line = lines.find(l => l.includes('I-6'));
        expect(i6Line).toContain('Blocked');
    });

    it('renders unread marker for unread issues', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={[]} unreadInums={new Set()} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        const frame = lastFrame()!;
        expect(cursorLine(frame)).toBeDefined();
    });

    it('selected row inum matches first issue on initial render', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('non-selected rows show spaces instead of \u25B8', () => {
        const { lastFrame } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        const others = nonCursorIssueLines(lastFrame()!);
        expect(others.length).toBe(MOCK_ISSUES.length - 1);
        for (const line of others) {
            expect(line).not.toContain('\u25B8');
        }
    });

    it('down arrow moves cursor to next item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[B');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-2');
    });

    it('up arrow moves cursor to previous item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
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
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        stdin.write('\x1b[A');
        await tick();
        expect(cursorLine(lastFrame()!)).toContain('I-1');
    });

    it('cursor does not go below last item', async () => {
        const { lastFrame, stdin } = render(
            <HomeView issues={MOCK_ISSUES} unreadInums={UNREAD_INUMS} terminal={{ columns: 80, rows: 24 }} layout={{ headerLines: 3, footerLines: 1 }} />
        );
        await tick();
        for (let i = 0; i < 20; i++) {
            stdin.write('\x1b[B');
            await tick();
        }
        expect(cursorLine(lastFrame()!)).toContain('I-8');
    });
});
