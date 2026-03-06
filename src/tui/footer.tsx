import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ViewType } from './views.js';

export const FOOTER_LINES = 1; // deprecated — use computeFooterLines()

export interface Shortcut {
    readonly key: string;
    readonly label: string;
    readonly disabled?: boolean;
    readonly action?: string;
}

export interface FooterProps {
    readonly viewType: ViewType;
    readonly inThread?: boolean;
    readonly threadResolved?: boolean;
    readonly focusedIndex?: number | null;
    readonly columns?: number;
}

export const VIEW_SHORTCUTS: Record<ViewType, readonly Shortcut[]> = {
    [ViewType.Home]: [
        { key: 'Enter', label: 'View' },
        { key: 'n',     label: 'New' },
        { key: 'a',     label: 'Activate' },
        { key: 'd',     label: 'Defer' },
        { key: 'r',     label: 'Resolve' },
        { key: 's',     label: 'Agents' },
        { key: 'b',     label: 'Blocking' },
        { key: 'g',     label: 'Groups' },
        { key: 'q',     label: 'Quit' },
    ],
    [ViewType.Detail]: [
        { key: 'Enter', label: 'Send' },
        { key: '\u2191\u2193', label: 'Scroll' },
        { key: '^⇧→', label: 'Thread', action: 'enterThread' },
        { key: '^R', label: 'Resolve', action: 'resolveThread' },
        { key: 'Esc',   label: 'Back', action: 'back' },
        { key: '⌥h',   label: 'Home', action: 'home' },
        { key: 'd',     label: 'Defer', disabled: true },
        { key: 'r',     label: 'Resolve issue', disabled: true },
        { key: 'b',     label: 'Block', disabled: true },
        { key: 'w',     label: 'Rebase', disabled: true },
        { key: 's',     label: 'Show pane', disabled: true },
    ],
    [ViewType.NewIssue]: [
        { key: 'Enter', label: 'Create' },
        { key: 'Esc',   label: 'Cancel' },
    ],
    [ViewType.AgentStatus]: [
        { key: 'Enter', label: 'Focus pane' },
        { key: 'j/k',   label: 'Navigate' },
        { key: 'Esc',   label: 'Back' },
    ],
    [ViewType.BlockingMap]: [
        { key: 'Enter', label: 'View issue' },
        { key: 'j/k',   label: 'Navigate' },
        { key: 'Esc',   label: 'Back' },
    ],
    [ViewType.GroupView]: [
        { key: 'Enter', label: 'View issues' },
        { key: 'n',     label: 'Next issue' },
        { key: 'p',     label: 'Prev issue' },
        { key: 'Esc',   label: 'Back' },
    ],
    [ViewType.IssuePicker]: [
        { key: 'Enter', label: 'Toggle' },
        { key: '\u2191\u2193',    label: 'Scroll' },
        { key: 'Esc',   label: 'Done' },
        { key: 'Ctrl v', label: 'View issue' },
    ],
};

const THREAD_SHORTCUTS: readonly Shortcut[] = [
    { key: 'Enter', label: 'Send' },
    { key: '\u2191\u2193', label: 'Scroll' },
    { key: '^⇧→', label: 'Sub-thread', action: 'enterThread' },
    { key: '^⇧←', label: 'Exit thread', action: 'exitThread' },
    { key: '^R', label: 'Resolve', action: 'resolveThread' },
    { key: 'Esc', label: 'Back', action: 'back' },
    { key: '⌥h', label: 'Home', action: 'home' },
];

/** Get the full shortcut list for the given view/thread state. */
export function getFooterShortcuts(viewType: ViewType, inThread?: boolean): readonly Shortcut[] {
    return (viewType === ViewType.Detail && inThread) ? THREAD_SHORTCUTS : VIEW_SHORTCUTS[viewType];
}

/** Get only the shortcuts that participate in the Tab focus ring. */
export function getFocusableShortcuts(viewType: ViewType, inThread?: boolean): Shortcut[] {
    return getFooterShortcuts(viewType, inThread).filter(
        s => s.action !== undefined && !s.disabled,
    );
}

/** Measure the display width of a shortcut item: "[key] label" */
function itemWidth(s: Shortcut): number {
    return 1 + s.key.length + 2 + s.label.length; // "[" + key + "] " + label
}

/** Estimate how many terminal lines the footer will occupy. */
export function computeFooterLines(shortcuts: readonly Shortcut[], columns: number): number {
    let totalWidth = 0;
    for (let i = 0; i < shortcuts.length; i++) {
        if (i > 0) totalWidth += 2; // gap between items
        totalWidth += itemWidth(shortcuts[i]);
    }
    return Math.max(1, Math.ceil(totalWidth / columns));
}

/** Split shortcuts into rows that fit within the given column width. */
function computeRows(shortcuts: readonly Shortcut[], columns: number): Shortcut[][] {
    const rows: Shortcut[][] = [];
    let currentRow: Shortcut[] = [];
    let currentWidth = 0;
    const gap = 2;

    for (const s of shortcuts) {
        const w = itemWidth(s);
        const needed = currentRow.length > 0 ? gap + w : w;

        if (currentWidth + needed > columns && currentRow.length > 0) {
            rows.push(currentRow);
            currentRow = [s];
            currentWidth = w;
        } else {
            currentRow.push(s);
            currentWidth += needed;
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
}

const FooterComponent: React.FC<FooterProps> = ({ viewType, inThread, threadResolved, focusedIndex, columns = 80 }) => {
    let shortcuts = getFooterShortcuts(viewType, inThread);

    // Toggle resolve label based on thread state
    if (viewType === ViewType.Detail && inThread && threadResolved !== undefined) {
        const resolveLabel = threadResolved ? 'Unresolve' : 'Resolve';
        shortcuts = shortcuts.map(s =>
            s.key === '^R' ? { ...s, label: resolveLabel } : s
        );
    }

    const focusable = getFocusableShortcuts(viewType, inThread);
    const rows = computeRows(shortcuts, columns);

    return (
        <Box flexDirection="column">
            {rows.map((row, rowIdx) => (
                <Box key={rowIdx}>
                    {row.map((s, i) => {
                        const focusIdx = focusable.indexOf(s);
                        const isFocused = focusedIndex != null && focusIdx !== -1 && focusIdx === focusedIndex;

                        const label = `[${s.key}] ${s.label}`;
                        return (
                            <Box key={i} marginRight={i < row.length - 1 ? 2 : 0}>
                                {isFocused ? (
                                    <Text>{[...label].map((ch, ci) => <Text key={ci} inverse bold>{ch}</Text>)}</Text>
                                ) : s.disabled ? (
                                    <Text dimColor>{label}</Text>
                                ) : (
                                    <Text><Text bold color="cyan">[{s.key}]</Text> {s.label}</Text>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            ))}
        </Box>
    );
};

export const Footer = memo(FooterComponent);
