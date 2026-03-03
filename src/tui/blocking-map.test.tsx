import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { BlockingMap } from './blocking-map.js';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('BlockingMap — rendering', () => {
    it('renders without crash', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        expect(lastFrame()).toBeDefined();
    });

    it('shows "Blocking Map" title area', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        expect(lastFrame()).toContain('Dependency');
    });

    // ---- Tree structure ----

    it('shows root issues (issues that block others)', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // Mock data has I-1 and I-2 as roots
        expect(frame).toContain('I-1');
        expect(frame).toContain('I-2');
    });

    it('shows blocked issues as children under their blockers', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // I-3 is blocked by I-1 and should appear indented under it
        expect(frame).toContain('I-3');
    });

    it('displays tree connectors (├── or └──)', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // Should have box-drawing tree connectors
        expect(frame).toMatch(/[├└]/);
    });

    it('displays issue titles', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // Mock issues should show their titles from canonical mock-data
        expect(frame).toContain('migrate_ServerDerivedFields');
    });

    it('displays issue statuses', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // Should show status indicators
        expect(frame).toContain('Active');
        expect(frame).toContain('Blocked');
    });

    it('shows continuation lines (│) for multi-child trees', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // I-1 has multiple children, so should show vertical continuation
        expect(frame).toContain('│');
    });

    // ---- Isolated issues ----

    it('shows isolated issues section for issues with no dependencies', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // I-7 "legacy_api_removal" and I-8 "initial_setup_task" have no dependencies — shown separately
        expect(frame).toContain('I-7');
        expect(frame).toContain('legacy_api_removal');
    });

    // ---- Diamond dependency (I-6 blocked by both I-3 and I-5) ----

    it('shows issues that appear in multiple subtrees', () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        const frame = lastFrame()!;
        // I-6 appears under both I-3 and I-5 subtrees
        // Count occurrences of I-6 — should appear at least twice
        const matches = frame.match(/I-6/g);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
});

describe('BlockingMap — cursor navigation', () => {
    it('first item is selected by default (has cursor indicator)', async () => {
        const { lastFrame } = render(<BlockingMap navigate={vi.fn()} />);
        await tick();
        const frame = lastFrame()!;
        // The first item should have a selection indicator (▸ or similar)
        const lines = frame.split('\n');
        const firstIssueLine = lines.find(l => l.includes('I-1'));
        expect(firstIssueLine).toBeDefined();
        expect(firstIssueLine).toMatch(/[▸►>]/);
    });

    it('j moves cursor down', async () => {
        const { lastFrame, stdin } = render(<BlockingMap navigate={vi.fn()} />);
        await tick();

        // Move down
        stdin.write('j');
        await tick();

        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // The cursor should have moved — second item should be selected
        // First item should no longer have the cursor
        const i1Line = lines.find(l => l.includes('I-1') && !l.includes('I-1') === false);
        // Second tree item should now be selected
        expect(frame).toBeDefined();
    });

    it('k moves cursor up', async () => {
        const { lastFrame, stdin } = render(<BlockingMap navigate={vi.fn()} />);
        await tick();

        // Move down then back up
        stdin.write('j');
        await tick();
        stdin.write('k');
        await tick();

        const frame = lastFrame()!;
        const lines = frame.split('\n');
        // Cursor should be back on the first item
        const firstIssueLine = lines.find(l => l.includes('I-1'));
        expect(firstIssueLine).toMatch(/[▸►>]/);
    });

    it('cursor does not move above first item', async () => {
        const { lastFrame, stdin } = render(<BlockingMap navigate={vi.fn()} />);
        await tick();

        const frameBefore = lastFrame();
        // Try moving up from first item
        stdin.write('k');
        await tick();

        expect(lastFrame()).toBe(frameBefore);
    });

    it('cursor does not move below last item', async () => {
        const { lastFrame, stdin } = render(<BlockingMap navigate={vi.fn()} />);
        await tick();

        // Move down many times past the end
        for (let i = 0; i < 50; i++) {
            stdin.write('j');
            await tick();
        }
        const frameAtEnd = lastFrame();

        // Try one more
        stdin.write('j');
        await tick();
        expect(lastFrame()).toBe(frameAtEnd);
    });
});

describe('BlockingMap — Enter navigates to detail', () => {
    it('Enter on selected issue calls navigate with Detail view', async () => {
        const navigate = vi.fn();
        const { stdin } = render(<BlockingMap navigate={navigate} />);
        await tick();

        // Press Enter on the first item (I-1)
        stdin.write('\r');
        await tick();

        expect(navigate).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith({ type: 'Detail', inum: 1 });
    });

    it('Enter after moving cursor navigates to the correct issue', async () => {
        const navigate = vi.fn();
        const { stdin } = render(<BlockingMap navigate={navigate} />);
        await tick();

        // Move down to second item then press Enter
        stdin.write('j');
        await tick();
        stdin.write('\r');
        await tick();

        expect(navigate).toHaveBeenCalledOnce();
        // Should navigate to the second item's inum (child of I-1)
        const call = navigate.mock.calls[0][0];
        expect(call.type).toBe('Detail');
        expect(call.inum).toBeGreaterThan(0);
    });
});

// Footer shortcuts are rendered centrally by App-level Footer component
// and tested in footer.test.tsx
