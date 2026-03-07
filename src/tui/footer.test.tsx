import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { renderToString } from 'ink';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {
    Footer,
    VIEW_SHORTCUTS,
    FOOTER_LINES,
    getFooterShortcuts,
    getFocusableShortcuts,
    computeFooterLines,
} from './footer.js';
import type { Shortcut } from './footer.js';
import { ViewType } from './views.js';

const cols = 80;
const rts = (el: React.JSX.Element) => renderToString(el, { columns: cols });

const allViews: ViewType[] = [
    ViewType.Home, ViewType.Detail, ViewType.NewIssue,
    ViewType.AgentStatus, ViewType.BlockingMap, ViewType.GroupView,
];

// Derive ANSI open codes from chalk (avoids hardcoding escape sequences)
const DIM_OPEN = chalk.dim(' ').split(' ')[0];
const BOLD_OPEN = chalk.bold(' ').split(' ')[0];
const INVERSE_OPEN = chalk.inverse(' ').split(' ')[0];

// ---- Exported constants ----

describe('Footer — constants', () => {
    it('FOOTER_LINES is defined', () => {
        expect(FOOTER_LINES).toBeDefined();
    });
});

// ---- Shortcut data invariants ----

describe('Footer — shortcut data invariants', () => {
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

    it('getFooterShortcuts returns a non-empty array for every view', () => {
        for (const view of allViews) {
            const shortcuts = getFooterShortcuts(view);
            expect(Array.isArray(shortcuts)).toBe(true);
            expect(shortcuts.length).toBeGreaterThan(0);
        }
    });

    it('getFocusableShortcuts never includes disabled items', () => {
        for (const view of allViews) {
            const focusable = getFocusableShortcuts(view);
            expect(focusable.every(s => !s.disabled)).toBe(true);
        }
    });

    it('getFocusableShortcuts only includes items with an action', () => {
        for (const view of allViews) {
            const focusable = getFocusableShortcuts(view);
            expect(focusable.every(s => s.action !== undefined)).toBe(true);
        }
    });

    it('every focusable shortcut has a non-empty action string', () => {
        for (const view of allViews) {
            for (const s of getFocusableShortcuts(view)) {
                expect(s.action!.length).toBeGreaterThan(0);
            }
        }
    });
});

// ---- computeFooterLines arithmetic ----

describe('Footer — computeFooterLines', () => {
    const short: Shortcut[] = [{ key: 'a', label: 'Do' }];
    const many: Shortcut[] = Array.from({ length: 10 }, (_, i) => ({
        key: `k${i}`, label: `Action number ${i}`,
    }));

    it('returns 1 for a single short shortcut at wide width', () => {
        expect(computeFooterLines(short, 80)).toBe(1);
    });

    it('returns >= 2 for many shortcuts at narrow width', () => {
        expect(computeFooterLines(many, 30)).toBeGreaterThanOrEqual(2);
    });

    it('returns >= 1 for any input', () => {
        expect(computeFooterLines(short, 500)).toBeGreaterThanOrEqual(1);
        expect(computeFooterLines(many, 500)).toBeGreaterThanOrEqual(1);
    });

    it('clamps to minimum 1 even with wide terminal', () => {
        expect(computeFooterLines(short, 9999)).toBe(1);
    });
});

// ---- Rendering basics ----

describe('Footer — rendering basics', () => {
    it('renders without crash for every ViewType', () => {
        for (const view of allViews) {
            const { lastFrame } = render(<Footer viewType={view} />);
            expect(lastFrame()).toBeDefined();
            expect(lastFrame()!.length).toBeGreaterThan(0);
        }
    });

    it('output contains [key] label chip format', () => {
        for (const view of allViews) {
            const output = rts(<Footer viewType={view} columns={cols} />);
            expect(output).toContain('[');
            expect(output).toContain(']');
        }
    });
});

// ---- Focus safety ----

describe('Footer — focus safety', () => {
    it('focusedIndex out of bounds does not crash', () => {
        for (const view of allViews) {
            const { lastFrame } = render(
                <Footer viewType={view} focusedIndex={99} columns={120} />
            );
            expect(lastFrame()).toBeDefined();
        }
    });

    it('focusedIndex=null is equivalent to no focusedIndex', () => {
        for (const view of allViews) {
            const a = render(<Footer viewType={view} focusedIndex={null} columns={120} />);
            const b = render(<Footer viewType={view} columns={120} />);
            expect(a.lastFrame()).toBe(b.lastFrame());
        }
    });
});

// ---- Disabled styling (ANSI-aware) ----

describe('Footer — disabled shortcuts render dimmed', () => {
    const viewWithDisabled = allViews.find(v =>
        VIEW_SHORTCUTS[v].some(s => s.disabled)
    );

    it('at least one view has disabled shortcuts for testing', () => {
        expect(viewWithDisabled).toBeDefined();
    });

    it('disabled shortcuts produce dim styling', () => {
        if (!viewWithDisabled) return;
        const output = renderToString(
            <Footer viewType={viewWithDisabled} columns={200} />,
            { columns: 200 },
        );
        expect(output).toContain(DIM_OPEN);
    });

    it('views without disabled shortcuts have none flagged disabled', () => {
        for (const view of allViews) {
            const shortcuts = getFooterShortcuts(view);
            const hasDisabled = shortcuts.some(s => s.disabled);
            if (!hasDisabled) {
                expect(shortcuts.every(s => !s.disabled)).toBe(true);
            }
        }
    });
});

// ---- Focused styling (ANSI-aware) ----

describe('Footer — focused shortcuts render inverse+bold', () => {
    const viewWithFocusable = allViews.find(v =>
        getFocusableShortcuts(v).length > 0
    );

    it('at least one view has focusable shortcuts for testing', () => {
        expect(viewWithFocusable).toBeDefined();
    });

    it('focused item contains inverse and bold styling', () => {
        if (!viewWithFocusable) return;
        const output = renderToString(
            <Footer viewType={viewWithFocusable} focusedIndex={0} columns={200} />,
            { columns: 200 },
        );
        expect(output).toContain(INVERSE_OPEN);
        expect(output).toContain(BOLD_OPEN);
    });

    it('each focusable item renders inverse+bold when focused', () => {
        if (!viewWithFocusable) return;
        const focusable = getFocusableShortcuts(viewWithFocusable);
        for (let i = 0; i < focusable.length; i++) {
            const output = renderToString(
                <Footer viewType={viewWithFocusable} focusedIndex={i} columns={200} />,
                { columns: 200 },
            );
            expect(output).toContain(INVERSE_OPEN);
            expect(output).toContain(BOLD_OPEN);
        }
    });
});

// ---- Row wrapping ----

describe('Footer — row wrapping keeps key+label together', () => {
    it('every line has balanced brackets at narrow width', () => {
        for (const view of allViews) {
            const shortcuts = getFooterShortcuts(view);
            if (shortcuts.length < 3) continue;
            const { lastFrame } = render(
                <Footer viewType={view} columns={50} />
            );
            const lines = lastFrame()!.split('\n');
            for (const line of lines) {
                const stripped = stripAnsi(line);
                const opens = (stripped.match(/\[/g) || []).length;
                const closes = (stripped.match(/\]/g) || []).length;
                expect(opens).toBe(closes);
            }
        }
    });
});

// ---- Memoization ----

describe('Footer — memoization', () => {
    it('Footer is memoized with React.memo', () => {
        expect(Footer).toHaveProperty('$$typeof', Symbol.for('react.memo'));
    });
});

// ---- Shortcut content per non-Detail view ----

describe('Footer — footer shows correct shortcuts for each non-Detail ViewType', () => {
    const nonDetailViews: ViewType[] = [
        ViewType.Home,
        ViewType.NewIssue,
        ViewType.AgentStatus,
        ViewType.BlockingMap,
        ViewType.GroupView,
        ViewType.IssuePicker,
    ];

    it('each non-Detail view renders all its shortcut keys and labels', () => {
        for (const vt of nonDetailViews) {
            const { lastFrame } = render(<Footer viewType={vt} columns={120} />);
            const output = stripAnsi(lastFrame()!);
            for (const shortcut of VIEW_SHORTCUTS[vt]) {
                expect(output, `view ${ViewType[vt]}: missing key "${shortcut.key}"`).toContain(shortcut.key);
                expect(output, `view ${ViewType[vt]}: missing label "${shortcut.label}"`).toContain(shortcut.label);
            }
        }
    });
});
