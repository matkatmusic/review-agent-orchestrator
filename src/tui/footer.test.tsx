import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Footer, VIEW_SHORTCUTS, FOOTER_LINES } from './footer.js';
import { ViewType } from './views.js';

describe('Footer — shortcut data', () => {
    const allViews: ViewType[] = [
        ViewType.Home, ViewType.Detail, ViewType.NewIssue, ViewType.AgentStatus, ViewType.BlockingMap, ViewType.GroupView,
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

    it('FOOTER_LINES constant is exported', () => {
        expect(FOOTER_LINES).toBeDefined();
    });
});

describe('Footer — per-view rendering', () => {
    it('Dashboard renders all 9 shortcuts (wraps on narrow terminals)', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.Home} />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('View');
        expect(frame).toContain('[n]');
        expect(frame).toContain('New');
        expect(frame).toContain('[a]');
        expect(frame).toContain('Activate');
        expect(frame).toContain('[s]');
        expect(frame).toContain('Agents');
        expect(frame).toContain('[b]');
        expect(frame).toContain('Blocking');
        expect(frame).toContain('[g]');
        expect(frame).toContain('Groups');
        expect(frame).toContain('[q]');
        expect(frame).toContain('Quit');
    });

    it('Detail shows all shortcuts with disabled indicators', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.Detail} />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Send');
        expect(frame).toContain('Scroll');
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
        const { lastFrame } = render(<Footer viewType={ViewType.NewIssue} />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Create');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Cancel');
    });

    it('NewIssue does NOT show Dashboard-only shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.NewIssue} />);
        const frame = lastFrame()!;
        expect(frame).not.toContain('[q]');
        expect(frame).not.toContain('Quit');
        expect(frame).not.toContain('[a]');
        expect(frame).not.toContain('Activate');
    });

    it('AgentStatus shows 3 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.AgentStatus} />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('Focus pane');
        expect(frame).toContain('[j/k]');
        expect(frame).toContain('Navigate');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
    });

    it('BlockingMap shows 3 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.BlockingMap} />);
        const frame = lastFrame()!;
        expect(frame).toContain('[Enter]');
        expect(frame).toContain('View issue');
        expect(frame).toContain('[j/k]');
        expect(frame).toContain('Navigate');
        expect(frame).toContain('[Esc]');
        expect(frame).toContain('Back');
    });

    it('GroupView shows 4 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.GroupView} />);
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
