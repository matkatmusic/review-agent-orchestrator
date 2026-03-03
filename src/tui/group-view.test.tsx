import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { GroupView } from './group-view.js';

const ESC = '\x1b';
const tick = () => new Promise(r => setTimeout(r, 0));

/** Helper: find which line has the cursor indicator ▸ */
function cursorLineIndex(frame: string): number {
    const lines = frame.split('\n');
    return lines.findIndex(l => l.includes('\u25B8'));
}

describe('GroupView', () => {
    // ---- Container list mode ----

    it('renders without crash', () => {
        const { lastFrame } = render(<GroupView />);
        expect(lastFrame()).toBeDefined();
    });

    it('shows container names', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        expect(frame).toContain('Inbox');
        expect(frame).toContain('Backend Sprint 1');
        expect(frame).toContain('Frontend');
    });

    it('shows issue counts for containers', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        // Inbox has 1/3, Sprint has 0/3, Frontend has 1/1
        expect(frame).toContain('1/3');
        expect(frame).toContain('0/3');
        expect(frame).toContain('1/1');
    });

    it('shows progress as resolved/total', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        const progressMatches = frame.match(/\d+\/\d+/g);
        expect(progressMatches).not.toBeNull();
        expect(progressMatches!.length).toBeGreaterThanOrEqual(3);
    });

    it('shows container type indicator', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        expect(frame).toContain('group');
        expect(frame).toContain('sprint');
    });

    it('shows cursor on first container by default', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        expect(frame).toContain('\u25B8');
        // Cursor should be on the line with "Inbox"
        const lines = frame.split('\n');
        const cursorLine = lines.find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('Inbox');
    });

    it('shows container count in header', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        expect(frame).toContain('containers');
    });

    // ---- Cursor navigation in container list ----

    it('arrow down moves cursor to next container', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();
        const beforeIdx = cursorLineIndex(lastFrame()!);

        stdin.write('\x1b[B'); // down arrow
        await tick();
        const afterIdx = cursorLineIndex(lastFrame()!);

        expect(afterIdx).toBe(beforeIdx + 1);
    });

    it('arrow up from second item moves cursor to first', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        stdin.write('\x1b[B');
        await tick();
        const afterDown = cursorLineIndex(lastFrame()!);

        stdin.write('\x1b[A');
        await tick();
        const afterUp = cursorLineIndex(lastFrame()!);

        expect(afterUp).toBe(afterDown - 1);
    });

    it('j moves cursor down', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();
        const beforeIdx = cursorLineIndex(lastFrame()!);

        stdin.write('j');
        await tick();
        const afterIdx = cursorLineIndex(lastFrame()!);

        expect(afterIdx).toBe(beforeIdx + 1);
    });

    it('k moves cursor up after moving down', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();
        const initialIdx = cursorLineIndex(lastFrame()!);

        stdin.write('j');
        await tick();

        stdin.write('k');
        await tick();
        const finalIdx = cursorLineIndex(lastFrame()!);

        expect(finalIdx).toBe(initialIdx);
    });

    it('cursor does not go above first item', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();
        const initial = lastFrame()!;

        stdin.write('k');
        await tick();
        const after = lastFrame()!;

        expect(after).toBe(initial);
    });

    it('cursor does not go below last item', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Move to last item (4 containers: Inbox, Backend Sprint 1, Frontend, Backlog)
        stdin.write('j');
        await tick();
        stdin.write('j');
        await tick();
        stdin.write('j');
        await tick();
        const atLast = lastFrame()!;

        // Try to go further down
        stdin.write('j');
        await tick();
        const afterOvershoot = lastFrame()!;

        expect(afterOvershoot).toBe(atLast);
    });

    // ---- Drill-down into container ----

    it('Enter drills into the selected container', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        stdin.write('\r');
        await tick();
        const frame = lastFrame()!;

        // Should show issues with inum and status
        expect(frame).toMatch(/I-\s*\d+/);
        expect(frame).toContain('Active');
        // Should NOT show progress fractions (that's the list view)
        expect(frame).toContain('resolved');
    });

    it('drilled-in view shows container name as context', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        stdin.write('\r');
        await tick();
        const frame = lastFrame()!;

        expect(frame).toContain('Inbox');
    });

    it('drilled-in view shows issues sorted by status priority', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Drill into Inbox (Active, Awaiting, Resolved)
        stdin.write('\r');
        await tick();
        const frame = lastFrame()!;

        // Verify status order: Active appears before Awaiting, Awaiting before Resolved
        const activeIdx = frame.indexOf('Active');
        const awaitingIdx = frame.indexOf('Awaiting');
        const resolvedIdx = frame.indexOf('Resolved');
        expect(activeIdx).toBeLessThan(awaitingIdx);
        expect(awaitingIdx).toBeLessThan(resolvedIdx);
    });

    it('Esc from drilled-in view returns to container list', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Drill in
        stdin.write('\r');
        await tick();
        const drilledFrame = lastFrame()!;
        expect(drilledFrame).toMatch(/I-\s*\d+/);

        // Go back
        stdin.write(ESC);
        await tick();
        const listFrame = lastFrame()!;

        // Should be back to container list — shows container names and progress
        expect(listFrame).toContain('Inbox');
        expect(listFrame).toContain('Backend Sprint 1');
        expect(listFrame).toMatch(/\d+\/\d+/);
    });

    it('cursor position restored when returning from drill-in', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Move cursor to second container
        stdin.write('j');
        await tick();
        const cursorLine = lastFrame()!.split('\n').find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('Backend Sprint 1');

        // Drill in
        stdin.write('\r');
        await tick();
        expect(lastFrame()).toContain('Backend Sprint 1');

        // Go back
        stdin.write(ESC);
        await tick();

        // Cursor should be back on second container
        const restoredLine = lastFrame()!.split('\n').find(l => l.includes('\u25B8'));
        expect(restoredLine).toContain('Backend Sprint 1');
    });

    // ---- Navigation within drilled-in issue list ----

    it('cursor navigation works in drilled-in issue list', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Drill into Inbox (3 issues)
        stdin.write('\r');
        await tick();
        const beforeIdx = cursorLineIndex(lastFrame()!);

        // Move cursor down
        stdin.write('j');
        await tick();
        const afterIdx = cursorLineIndex(lastFrame()!);

        expect(afterIdx).toBe(beforeIdx + 1);
    });

    it('n moves to next issue in group', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        stdin.write('\r');
        await tick();
        const beforeIdx = cursorLineIndex(lastFrame()!);

        stdin.write('n');
        await tick();
        const afterIdx = cursorLineIndex(lastFrame()!);

        expect(afterIdx).toBe(beforeIdx + 1);
    });

    it('p moves to previous issue in group', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        stdin.write('\r');
        await tick();

        // Move down first
        stdin.write('n');
        await tick();
        const movedIdx = cursorLineIndex(lastFrame()!);

        // Move back with p
        stdin.write('p');
        await tick();
        const backIdx = cursorLineIndex(lastFrame()!);

        expect(backIdx).toBe(movedIdx - 1);
    });

    it('cursor does not go below last issue in drilled-in list', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Drill into Inbox (3 issues)
        stdin.write('\r');
        await tick();

        // Move past all issues
        stdin.write('n');
        await tick();
        stdin.write('n');
        await tick();
        const atLast = lastFrame()!;

        // Try to go further
        stdin.write('n');
        await tick();
        const afterOvershoot = lastFrame()!;

        expect(afterOvershoot).toBe(atLast);
    });

    // Footer shortcuts are rendered centrally by App-level Footer component
    // and tested in footer.test.tsx

    // ---- Empty states ----

    it('shows empty message for container with no issues', async () => {
        const { lastFrame, stdin } = render(<GroupView />);
        await tick();

        // Navigate to Backlog (4th container, index 3 — has no issues)
        stdin.write('j');
        await tick();
        stdin.write('j');
        await tick();
        stdin.write('j');
        await tick();
        stdin.write('\r');
        await tick();
        const frame = lastFrame()!;

        expect(frame).toContain('No issues');
    });

    // ---- onNavigate callback ----

    it('does not call onNavigate from container list', async () => {
        const onNavigate = vi.fn();
        const { stdin } = render(<GroupView onNavigate={onNavigate} />);
        await tick();

        stdin.write('j');
        await tick();

        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('Enter on issue in drilled-in view calls onNavigate', async () => {
        const onNavigate = vi.fn();
        const { stdin } = render(<GroupView onNavigate={onNavigate} />);
        await tick();

        // Drill into Inbox
        stdin.write('\r');
        await tick();

        // Press Enter on first issue (inum 2 — Active "Implement auth module")
        stdin.write('\r');
        await tick();

        expect(onNavigate).toHaveBeenCalledOnce();
        expect(onNavigate).toHaveBeenCalledWith(2);
    });

    // ---- onBack callback ----

    it('calls onBack when Esc pressed in container list mode', async () => {
        const onBack = vi.fn();
        const { stdin } = render(<GroupView onBack={onBack} />);
        await tick();

        stdin.write(ESC);
        await tick();

        expect(onBack).toHaveBeenCalledOnce();
    });

    it('Esc in drilled-in mode goes back to list, does NOT call onBack', async () => {
        const onBack = vi.fn();
        const { lastFrame, stdin } = render(<GroupView onBack={onBack} />);
        await tick();

        // Drill in first
        stdin.write('\r');
        await tick();

        // Esc should go back to container list, not call onBack
        stdin.write(ESC);
        await tick();

        expect(onBack).not.toHaveBeenCalled();
        // Should be back on container list
        expect(lastFrame()).toContain('Inbox');
        expect(lastFrame()).toContain('Backend Sprint 1');
    });

    // ---- Multiple containers visible ----

    it('shows all mock containers in list', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;

        expect(frame).toContain('Inbox');
        expect(frame).toContain('Backend Sprint 1');
        expect(frame).toContain('Frontend');
        expect(frame).toContain('Backlog');
    });

    it('shows 0/0 for empty container', () => {
        const { lastFrame } = render(<GroupView />);
        const frame = lastFrame()!;
        expect(frame).toContain('0/0');
    });
});
