import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Dashboard } from './dashboard.js';
import type { Issue } from '../types.js';
import { IssueStatus } from "../types.js";

const tick = () => new Promise(r => setTimeout(r, 0));

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

const defaultProps = {
    issues: MOCK_ISSUES,
    unreadInums: UNREAD_INUMS,
    maxAgents: 6,
    onSelect: vi.fn(),
    onNewIssue: vi.fn(),
    onActivate: vi.fn(),
    onDefer: vi.fn(),
    onResolve: vi.fn(),
};

describe('Dashboard', () => {
    // ---- Rendering ----

    it('renders without crash', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        expect(lastFrame()).toBeDefined();
    });

    it('renders issue titles in the list', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        expect(frame).toContain('migrate_ServerDerivedFields');
    });

    it('renders inum identifiers', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        expect(frame).toContain('I-1');
    });

    it('renders empty state when no issues', () => {
        const { lastFrame } = render(
            <Dashboard {...defaultProps} issues={[]} unreadInums={new Set()} />
        );
        expect(lastFrame()!.toLowerCase()).toMatch(/no issues/);
    });

    // ---- Status tabs with counts ----

    it('shows all status tabs', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        expect(frame).toContain('Active');
        expect(frame).toContain('Awaiting');
        expect(frame).toContain('Blocked');
        expect(frame).toContain('Deferred');
        expect(frame).toContain('Resolved');
    });

    it('shows correct count for Active tab', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        // 2 active issues
        expect(lastFrame()!).toMatch(/Active\s*\(?2\)?/);
    });

    it('shows correct count for Awaiting tab', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        // 3 awaiting issues
        expect(lastFrame()!).toMatch(/Awaiting\s*\(?3\)?/);
    });

    it('shows correct count for Blocked tab', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        expect(lastFrame()!).toMatch(/Blocked\s*\(?1\)?/);
    });

    it('shows correct count for Deferred tab', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        expect(lastFrame()!).toMatch(/Deferred\s*\(?1\)?/);
    });

    it('shows correct count for Resolved tab', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        expect(lastFrame()!).toMatch(/Resolved\s*\(?1\)?/);
    });

    // ---- "All" tab shows all issues by default ----

    it('default tab shows all issues', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        // All 8 issues should be visible
        expect(frame).toContain('migrate_ServerDerivedFields');
        expect(frame).toContain('initial_setup_task');
        expect(frame).toContain('legacy_api_removal');
    });

    // ---- Tab switching filters the issue list ----

    it('Tab key switches to next status filter', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Press Tab to move from All → Active
        stdin.write('\t');
        await tick();
        const frame = lastFrame()!;
        // Should show only Active issues
        expect(frame).toContain('migrate_ServerDerivedFields');
        expect(frame).toContain('migrate_SessionCredentials');
        expect(frame).not.toContain('rate_limiting_design');
        expect(frame).not.toContain('legacy_api_removal');
    });

    it('Shift+Tab switches to previous status filter', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Move to Active first
        stdin.write('\t');
        await tick();
        // Shift+Tab back to All
        stdin.write('\x1b[Z'); // Shift+Tab escape sequence
        await tick();
        const frame = lastFrame()!;
        // All issues visible again
        expect(frame).toContain('migrate_ServerDerivedFields');
        expect(frame).toContain('rate_limiting_design');
        expect(frame).toContain('legacy_api_removal');
    });

    it('tab wraps around from last to first filter', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Tab through all: All → Active → Awaiting → Blocked → Deferred → Resolved → All
        for (let i = 0; i < 6; i++) {
            stdin.write('\t');
            await tick();
        }
        const frame = lastFrame()!;
        // Should be back to All — all issues visible
        expect(frame).toContain('migrate_ServerDerivedFields');
        expect(frame).toContain('initial_setup_task');
    });

    it('filtering to Blocked shows only blocked issues', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Tab: All → Active → Awaiting → Blocked
        stdin.write('\t');
        await tick();
        stdin.write('\t');
        await tick();
        stdin.write('\t');
        await tick();
        const frame = lastFrame()!;
        expect(frame).toContain('stale_session_cleanup');
        expect(frame).not.toContain('migrate_ServerDerivedFields');
    });

    // ---- Cursor navigation ----

    it('cursor starts at first item', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        // First item should have cursor indicator
        expect(frame).toContain('\u25B8');
    });

    it('down arrow moves cursor down', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        stdin.write('\x1b[B'); // Down arrow
        await tick();
        const frame = lastFrame()!;
        // Cursor indicator should be on second item now
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-2');
    });

    it('up arrow moves cursor up', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Move down first
        stdin.write('\x1b[B');
        await tick();
        // Then back up
        stdin.write('\x1b[A');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-1');
    });

    it('j key moves cursor down (vim-style)', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        stdin.write('j');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-2');
    });

    it('k key moves cursor up (vim-style)', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        stdin.write('j');
        await tick();
        stdin.write('k');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-1');
    });

    it('cursor does not go above first item', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        stdin.write('\x1b[A'); // Up arrow at top
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-1');
    });

    it('cursor does not go below last item', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Move down past end
        for (let i = 0; i < 20; i++) {
            stdin.write('\x1b[B');
            await tick();
        }
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        // Last issue is I-8
        expect(cursorLine).toContain('I-8');
    });

    it('cursor resets to 0 when switching tabs', async () => {
        const { lastFrame, stdin } = render(<Dashboard {...defaultProps} />);
        await tick();
        // Move cursor down a few
        stdin.write('\x1b[B');
        await tick();
        stdin.write('\x1b[B');
        await tick();
        // Switch tab
        stdin.write('\t');
        await tick();
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        // Should be on the first item of the Active filter (I-1)
        expect(cursorLine).toContain('I-1');
    });

    // ---- Unread markers ----

    it('shows unread marker for issues with unread responses', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // I-3 is in unreadInums
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('\u2731'); // ✱
    });

    it('does not show unread marker for issues without unread responses', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // I-1 is NOT in unreadInums
        const i1Line = lines.find(l => l.includes('I-1'));
        // The line should NOT contain the unread marker (but the cursor indicator ▸ might be there)
        // We need to check that ✱ is not on this specific line
        expect(i1Line).not.toContain('\u2731');
    });

    // Footer shortcuts are rendered centrally by App-level Footer component
    // and tested in footer.test.tsx

    // ---- Keyboard actions ----

    it('Enter calls onSelect with current issue inum', async () => {
        const onSelect = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onSelect={onSelect} />
        );
        await tick();
        stdin.write('\r'); // Enter
        await tick();
        expect(onSelect).toHaveBeenCalledWith(1); // First issue (cursor at 0)
    });

    it('Enter on second item calls onSelect with that inum', async () => {
        const onSelect = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onSelect={onSelect} />
        );
        await tick();
        stdin.write('\x1b[B'); // Down to I-2
        await tick();
        stdin.write('\r');
        await tick();
        expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('n calls onNewIssue', async () => {
        const onNewIssue = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onNewIssue={onNewIssue} />
        );
        await tick();
        stdin.write('n');
        await tick();
        expect(onNewIssue).toHaveBeenCalledOnce();
    });

    it('a calls onActivate with current issue inum', async () => {
        const onActivate = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onActivate={onActivate} />
        );
        await tick();
        stdin.write('a');
        await tick();
        expect(onActivate).toHaveBeenCalledWith(1);
    });

    it('d calls onDefer with current issue inum', async () => {
        const onDefer = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onDefer={onDefer} />
        );
        await tick();
        stdin.write('d');
        await tick();
        expect(onDefer).toHaveBeenCalledWith(1);
    });

    it('r calls onResolve with current issue inum', async () => {
        const onResolve = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} onResolve={onResolve} />
        );
        await tick();
        stdin.write('r');
        await tick();
        expect(onResolve).toHaveBeenCalledWith(1);
    });

    it('Enter does nothing when list is empty', async () => {
        const onSelect = vi.fn();
        const { stdin } = render(
            <Dashboard {...defaultProps} issues={[]} unreadInums={new Set()} onSelect={onSelect} />
        );
        await tick();
        stdin.write('\r');
        await tick();
        expect(onSelect).not.toHaveBeenCalled();
    });

    // ---- MAX_AGENTS enforcement ----

    it('shows activate disabled indicator when active count >= maxAgents', () => {
        // 2 active issues, maxAgents set to 2
        const { lastFrame } = render(
            <Dashboard {...defaultProps} maxAgents={2} />
        );
        const frame = lastFrame()!;
        // Should indicate activate is disabled/at capacity
        expect(frame).toMatch(/full|max|limit|\d+\/\d+/i);
    });

    it('does not show disabled indicator when active count < maxAgents', () => {
        // 2 active issues, maxAgents set to 6 (plenty of room)
        const { lastFrame } = render(
            <Dashboard {...defaultProps} maxAgents={6} />
        );
        const frame = lastFrame()!;
        // "full" should not appear
        expect(frame).not.toMatch(/\bfull\b/i);
    });

    // ---- Status display on each row ----

    it('each row shows the status text', () => {
        const { lastFrame } = render(<Dashboard {...defaultProps} />);
        const frame = lastFrame()!;
        const lines = frame.split('\n');
        const i1Line = lines.find(l => l.includes('I-1'));
        expect(i1Line).toContain('Active');
        const i3Line = lines.find(l => l.includes('I-3'));
        expect(i3Line).toContain('Awaiting');
        const i6Line = lines.find(l => l.includes('I-6'));
        expect(i6Line).toContain('Blocked');
    });
});
