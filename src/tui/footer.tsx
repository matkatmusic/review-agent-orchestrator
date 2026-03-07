import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ViewType } from './views.js';
import { Ink_keyofKeys_Choices, InkKeyOfKeysStringMap, KeyCombinations, getHotKeyLabel } from './hotkeys.js';

export const FOOTER_LINES = 1; // deprecated — use computeFooterLines()

export interface Shortcut {
    readonly key: string;
    readonly label: string;
    readonly disabled?: boolean;
    readonly action?: string;
}

export interface FooterOptions {
    readonly inThread?: boolean;
    readonly responseSelected?: boolean;
    readonly hasReplies?: boolean;
    readonly isQuoting?: boolean;
    readonly focusedAction?: string;
    readonly inputFocused?: boolean;
}

export interface FooterProps extends FooterOptions {
    readonly viewType: ViewType;
    readonly threadResolved?: boolean;
    readonly focusedIndex?: number | null;
    readonly columns?: number;
}

const inkKey = (k: Ink_keyofKeys_Choices) => InkKeyOfKeysStringMap.get(k)!;
const comboKey = (k: KeyCombinations) => getHotKeyLabel(k);

export const VIEW_SHORTCUTS: Record<ViewType, readonly Shortcut[]> = {
    [ViewType.Home]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'View' },
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
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'Send' },
        { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Scroll' },
        { key: comboKey(KeyCombinations.CTRL_SHIFT_RIGHT_ARROW), label: 'Thread', action: 'enterThread' },
        { key: comboKey(KeyCombinations.CTRL_R), label: 'Resolve Issue' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Back', action: 'back' },
        { key: comboKey(KeyCombinations.ALT_H), label: 'Home', action: 'home' },
        { key: 'd',     label: 'Defer', disabled: true },
        { key: 'b',     label: 'Block', disabled: true },
        { key: 'w',     label: 'Rebase', disabled: true },
        { key: 's',     label: 'Show pane', disabled: true },
    ],
    [ViewType.NewIssue]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'Create' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Cancel' },
    ],
    [ViewType.AgentStatus]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'Focus pane' },
        { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Navigate' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Back' },
        { key: 'q',     label: 'Quit' },
    ],
    [ViewType.BlockingMap]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'View issue' },
        { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Navigate' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Back' },
        { key: 'q',     label: 'Quit' },
    ],
    [ViewType.GroupView]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'View issues' },
        { key: 'n',     label: 'Next issue' },
        { key: 'p',     label: 'Prev issue' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Back' },
        { key: 'q',     label: 'Quit' },
    ],
    [ViewType.IssuePicker]: [
        { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'Toggle' },
        { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Scroll' },
        { key: 'Ctrl v', label: 'View issue' },
        { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Close' },
        { key: 'q',     label: 'Quit' },
    ],
};

const THREAD_SHORTCUTS: readonly Shortcut[] = [
    { key: inkKey(Ink_keyofKeys_Choices.RETURN), label: 'Send' },
    { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Scroll' },
    { key: comboKey(KeyCombinations.CTRL_SHIFT_RIGHT_ARROW), label: 'Sub-thread', action: 'enterThread' },
    { key: comboKey(KeyCombinations.CTRL_SHIFT_LEFT_ARROW), label: 'Exit thread', action: 'exitThread' },
    { key: comboKey(KeyCombinations.CTRL_R), label: 'Resolve Issue' },
    { key: inkKey(Ink_keyofKeys_Choices.ESCAPE), label: 'Back', action: 'back' },
    { key: comboKey(KeyCombinations.ALT_H), label: 'Home', action: 'home' },
];

/** Get the full shortcut list for the given view/thread state. */
export function getFooterShortcuts(viewType: ViewType, options?: FooterOptions | boolean): readonly Shortcut[] {
    const inThread = typeof options === 'boolean' ? options : options?.inThread ?? false;
    return (viewType === ViewType.Detail && inThread) ? THREAD_SHORTCUTS : VIEW_SHORTCUTS[viewType];
}

/** Get only the shortcuts that participate in the Tab focus ring. */
export function getFocusableShortcuts(viewType: ViewType, options?: FooterOptions | boolean): Shortcut[] {
    return getFooterShortcuts(viewType, options).filter(
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

const FooterComponent: React.FC<FooterProps> = ({ viewType, inThread, responseSelected, hasReplies, isQuoting, focusedAction, inputFocused, threadResolved, focusedIndex, columns = 80 }) => {
    const options: FooterOptions = { inThread, responseSelected, hasReplies, isQuoting, focusedAction, inputFocused };
    const shortcuts = getFooterShortcuts(viewType, options);

    const focusable = getFocusableShortcuts(viewType, options);
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
