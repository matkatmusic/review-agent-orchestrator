import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
    Footer,
    VIEW_SHORTCUTS,
    FOOTER_LINES,
    getFooterShortcuts,
    getFocusableShortcuts,
    computeFooterLines,
} from './footer.js';
import { ViewType } from './views.js';
import { Ink_keyofKeys_Choices, InkKeyOfKeysStringMap, KeyCombinations, getHotKeyLabel } from './hotkeys.js';

const ik = (k: Ink_keyofKeys_Choices) => InkKeyOfKeysStringMap.get(k)!;
const ck = (k: KeyCombinations) => getHotKeyLabel(k);

// ---- Shortcut data ----

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

// ---- getFooterShortcuts ----

describe('Footer — getFooterShortcuts', () => {
    it('returns VIEW_SHORTCUTS[Detail] when not in thread', () => {
        const shortcuts = getFooterShortcuts(ViewType.Detail, false);
        expect(shortcuts).toBe(VIEW_SHORTCUTS[ViewType.Detail]);
    });

    it('returns thread shortcuts when Detail + inThread', () => {
        const shortcuts = getFooterShortcuts(ViewType.Detail, true);
        expect(shortcuts).not.toBe(VIEW_SHORTCUTS[ViewType.Detail]);
        expect(shortcuts.some(s => s.label === 'Sub-thread')).toBe(true);
        expect(shortcuts.some(s => s.label === 'Exit thread')).toBe(true);
    });

    it('returns VIEW_SHORTCUTS for non-Detail views regardless of inThread', () => {
        const shortcuts = getFooterShortcuts(ViewType.Home, true);
        expect(shortcuts).toBe(VIEW_SHORTCUTS[ViewType.Home]);
    });
});

// ---- getFocusableShortcuts ----

describe('Footer — getFocusableShortcuts', () => {
    it('excludes disabled items', () => {
        const focusable = getFocusableShortcuts(ViewType.Detail, false);
        expect(focusable.every(s => !s.disabled)).toBe(true);
    });

    it('excludes items without an action string', () => {
        const focusable = getFocusableShortcuts(ViewType.Detail, false);
        expect(focusable.every(s => s.action !== undefined)).toBe(true);
    });

    it('returns 4 focusable items for Detail view (Thread, Resolve, Back, Home)', () => {
        const focusable = getFocusableShortcuts(ViewType.Detail, false);
        expect(focusable).toHaveLength(4);
        expect(focusable.map(s => s.action)).toEqual(['enterThread', 'resolveThread', 'back', 'home']);
    });

    it('returns 5 focusable items for thread view', () => {
        const focusable = getFocusableShortcuts(ViewType.Detail, true);
        expect(focusable).toHaveLength(5);
        expect(focusable.map(s => s.action)).toEqual([
            'enterThread', 'exitThread', 'resolveThread', 'back', 'home',
        ]);
    });

    it('every focusable shortcut has a non-empty action string', () => {
        const detailFocusable = getFocusableShortcuts(ViewType.Detail, false);
        const threadFocusable = getFocusableShortcuts(ViewType.Detail, true);
        for (const s of [...detailFocusable, ...threadFocusable]) {
            expect(s.action!.length).toBeGreaterThan(0);
        }
    });
});

// ---- computeFooterLines ----

describe('Footer — computeFooterLines', () => {
    it('returns 1 for NewIssue shortcuts at 80 columns', () => {
        const shortcuts = getFooterShortcuts(ViewType.NewIssue);
        expect(computeFooterLines(shortcuts, 80)).toBe(1);
    });

    it('returns >= 2 for Detail shortcuts at 40 columns', () => {
        const shortcuts = getFooterShortcuts(ViewType.Detail);
        expect(computeFooterLines(shortcuts, 40)).toBeGreaterThanOrEqual(2);
    });

    it('returns >= 1 for all view types', () => {
        const allViews: ViewType[] = [
            ViewType.Home, ViewType.Detail, ViewType.NewIssue,
            ViewType.AgentStatus, ViewType.BlockingMap, ViewType.GroupView,
        ];
        for (const view of allViews) {
            const shortcuts = getFooterShortcuts(view);
            expect(computeFooterLines(shortcuts, 80)).toBeGreaterThanOrEqual(1);
        }
    });

    it('clamps to minimum 1 even with wide terminal', () => {
        const shortcuts = getFooterShortcuts(ViewType.NewIssue);
        expect(computeFooterLines(shortcuts, 500)).toBe(1);
    });
});

// ---- Per-view rendering ----

describe('Footer — per-view rendering', () => {
    it('Dashboard renders all 9 shortcuts (wraps on narrow terminals)', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.Home} />);
        const frame = lastFrame()!;
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
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
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
        expect(frame).toContain('Send');
        expect(frame).toContain('Scroll');
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.ESCAPE)}]`);
        expect(frame).toContain('Back');
        expect(frame).toContain(`[${ck(KeyCombinations.CTRL_SHIFT_R)}]`);
        expect(frame).toContain('Resolve Thread');
        expect(frame).toContain(`[${ck(KeyCombinations.CTRL_R)}]`);
        expect(frame).toContain('Resolve Issue');
        expect(frame).toContain('[d]');
        expect(frame).toContain('Defer');
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
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
        expect(frame).toContain('Create');
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.ESCAPE)}]`);
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
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
        expect(frame).toContain('Focus pane');
        expect(frame).toContain('[j/k]');
        expect(frame).toContain('Navigate');
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.ESCAPE)}]`);
        expect(frame).toContain('Back');
    });

    it('BlockingMap shows 3 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.BlockingMap} />);
        const frame = lastFrame()!;
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
        expect(frame).toContain('View issue');
        expect(frame).toContain('[j/k]');
        expect(frame).toContain('Navigate');
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.ESCAPE)}]`);
        expect(frame).toContain('Back');
    });

    it('GroupView shows 4 shortcuts', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.GroupView} />);
        const frame = lastFrame()!;
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.RETURN)}]`);
        expect(frame).toContain('View issues');
        expect(frame).toContain('[n]');
        expect(frame).toContain('Next issue');
        expect(frame).toContain('[p]');
        expect(frame).toContain('Prev issue');
        expect(frame).toContain(`[${ik(Ink_keyofKeys_Choices.ESCAPE)}]`);
        expect(frame).toContain('Back');
    });
});

// ---- Thread rendering ----

describe('Footer — thread rendering', () => {
    it('inThread=true shows Sub-thread and Exit thread', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.Detail} inThread={true} />);
        const frame = lastFrame()!;
        expect(frame).toContain('Sub-thread');
        expect(frame).toContain('Exit thread');
    });

    it('inThread=true does NOT show detail-only disabled items', () => {
        const { lastFrame } = render(<Footer viewType={ViewType.Detail} inThread={true} />);
        const frame = lastFrame()!;
        expect(frame).not.toContain('Defer');
        expect(frame).not.toContain('Rebase');
        expect(frame).not.toContain('Show pane');
    });

    it('threadResolved=true shows Unresolve instead of Resolve', () => {
        const { lastFrame } = render(
            <Footer viewType={ViewType.Detail} inThread={true} threadResolved={true} />
        );
        expect(lastFrame()).toContain('Unresolve');
    });

    it('threadResolved=false shows Resolve', () => {
        const { lastFrame } = render(
            <Footer viewType={ViewType.Detail} inThread={true} threadResolved={false} />
        );
        expect(lastFrame()).toContain('Resolve');
    });
});

// ---- Focused rendering ----

describe('Footer — focused rendering', () => {
    it('focusedIndex=null renders all items without extra spacing', () => {
        const a = render(<Footer viewType={ViewType.Detail} focusedIndex={null} columns={120} />);
        const b = render(<Footer viewType={ViewType.Detail} columns={120} />);
        expect(a.lastFrame()).toBe(b.lastFrame());
    });

    it('focusedIndex out of bounds does not crash', () => {
        const { lastFrame } = render(
            <Footer viewType={ViewType.Detail} focusedIndex={99} columns={120} />
        );
        expect(lastFrame()).toBeDefined();
        expect(lastFrame()).toContain('[Enter]');
    });

    it('focusedIndex=0 renders first focusable item content', () => {
        const { lastFrame } = render(
            <Footer viewType={ViewType.Detail} focusedIndex={0} columns={120} />
        );
        // First focusable item in Detail is Thread
        expect(lastFrame()).toContain('Thread');
    });
});

// ---- Row computation (Issue 1 regression) ----

describe('Footer — row wrapping keeps key+label together', () => {
    it('key and label stay on the same line at narrow width', () => {
        const { lastFrame } = render(
            <Footer viewType={ViewType.Detail} columns={50} />
        );
        const lines = lastFrame()!.split('\n');
        // No line should contain a bare key without its label or vice versa
        // Specifically, [s] and "Show pane" must be on the same line
        const lineWithS = lines.find(l => l.includes('[s]'));
        expect(lineWithS).toBeDefined();
        expect(lineWithS).toContain('Show pane');
    });
});
