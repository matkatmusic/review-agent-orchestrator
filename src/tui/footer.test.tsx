import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Footer, VIEW_SHORTCUTS, FOOTER_LINES } from './footer.js';
import type { ViewType } from './views.js';

describe('Footer — shortcut data', () => {
    const allViews: ViewType[] = [
        'Dashboard', 'Detail', 'NewIssue', 'AgentStatus', 'BlockingMap', 'GroupView',
    ];

    it('VIEW_SHORTCUTS has an entry for every ViewType', () => {
        for (const view of allViews) {
            expect(VIEW_SHORTCUTS[view]).toBeDefined();
            expect(VIEW_SHORTCUTS[view].length).toBeGreaterThan(0);
        }
    });

    it('every shortcut has non-empty key and label', () => {
        for (const view of allViews) {
            for (const shortcut of VIEW_SHORTCUTS[view]) {
                expect(shortcut.key.length).toBeGreaterThan(0);
                expect(shortcut.label.length).toBeGreaterThan(0);
            }
        }
    });

    it('FOOTER_LINES is 1', () => {
        expect(FOOTER_LINES).toBe(1);
    });
});

describe('Footer — per-view rendering', () => {
    it('Dashboard shows all 7 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="Dashboard" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('View');
        expect(frame).toContain('[n]');
        expect(frame).toContain('New');
        expect(frame).toContain('[a]');
        expect(frame).toContain('Activate');
        expect(frame).toContain('[d]');
        expect(frame).toContain('Defer');
        expect(frame).toContain('[r]');
        expect(frame).toContain('Resolve');
        expect(frame).toContain('[s]');
        expect(frame).toContain('Show pane');
        expect(frame).toContain('[q]');
        expect(frame).toContain('Quit');
    });

    it('Detail shows all 7 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="Detail" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Send');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
        expect(frame).toContain('[d]');
        expect(frame).toContain('Defer');
        expect(frame).toContain('[r]');
        expect(frame).toContain('Resolve');
        expect(frame).toContain('[b]');
        expect(frame).toContain('Block');
        expect(frame).toContain('[w]');
        expect(frame).toContain('Rebase');
        expect(frame).toContain('[s]');
        expect(frame).toContain('Show pane');
    });

    it('NewIssue shows 2 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="NewIssue" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Create');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Cancel');
    });

    it('NewIssue does NOT show Dashboard-only shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="NewIssue" />);
        const frame = lastFrame()!;
        expect(frame).not.toContain('[q]');
        expect(frame).not.toContain('Quit');
        expect(frame).not.toContain('[a]');
        expect(frame).not.toContain('Activate');
    });

    it('AgentStatus shows 2 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="AgentStatus" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Focus pane');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
    });

    it('BlockingMap shows 2 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="BlockingMap" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('View issue');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
    });

    it('GroupView shows 4 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType="GroupView" />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('View issues');
        expect(frame).toContain('[n]');
        expect(frame).toContain('Next issue');
        expect(frame).toContain('[p]');
        expect(frame).toContain('Prev issue');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
    });
});
