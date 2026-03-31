import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ViewType } from './views.js';
import { IssueStatus } from '../types.js';
import { Ink_keyofKeys_Choices, InkKeyOfKeysStringMap, KeyCombinations, getHotKeyLabel } from './hotkeys.js';

export const FOOTER_HEIGHT = 4;

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
    readonly shortcutOverrides?: readonly Shortcut[];
    readonly globalShortcuts?: readonly Shortcut[];
    readonly contextualShortcuts?: readonly Shortcut[];
    readonly contextualPageCount?: number;
    readonly contextualPage?: number;
}

const inkKey = (k: Ink_keyofKeys_Choices) => InkKeyOfKeysStringMap.get(k)!;
const comboKey = (k: KeyCombinations) => getHotKeyLabel(k);

export const VIEW_SHORTCUTS: Record<ViewType, readonly Shortcut[]> = {
    [ViewType.Home]: [
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
    [ViewType.Trash]: [
        { key: 'r', label: 'Restore' },
        { key: 'd', label: 'Delete' },
        { key: 'e', label: 'Empty trash' },
        { key: comboKey(KeyCombinations.SCROLL_UP_DOWN), label: 'Navigate' },
        { key: 'Esc', label: 'Back' },
        { key: 'q', label: 'Quit' },
    ],
    [ViewType.ConfirmModal]: [],
};

const dimShortcut: Shortcut = { key: comboKey(KeyCombinations.SHIFT_D), label: 'Dim unrelated issues' };

export const STATUS_SHORTCUTS: Record<IssueStatus, readonly Shortcut[]> = {
    [IssueStatus.Active]:   [{ key: 'd', label: 'Defer' }, { key: 'r', label: 'Resolve' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.InQueue]:  [{ key: 'd', label: 'Defer' }, { key: 'r', label: 'Resolve' }, { key: 'f', label: 'Force active' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.Blocked]:  [{ key: 'b', label: 'Show blockers' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.Deferred]: [{ key: 'e', label: 'Enqueue' }, { key: 'r', label: 'Resolve' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.Resolved]: [{ key: 'e', label: 'Add comment to re-enqueue' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.Trashed]:  [{ key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
    [IssueStatus.Inactive]: [{ key: 'f', label: 'Activate' }, { key: 'e', label: 'Enqueue' }, { key: 'x', label: 'Move to Trash' }, { key: 't', label: 'Trash view' }, dimShortcut, { key: 'q', label: 'Quit' }],
};

export const CONFIRM_TRASH_SHORTCUTS: readonly Shortcut[] = [
    { key: 'x', label: 'Confirm trash' },
    { key: 'Esc', label: 'Cancel' },
];

export const CONFIRM_DELETE_SHORTCUTS: readonly Shortcut[] = [
    { key: 'd', label: 'Confirm delete' },
    { key: 'Esc', label: 'Cancel' },
];

export const CONFIRM_EMPTY_SHORTCUTS: readonly Shortcut[] = [
    { key: '"empty" + Enter', label: 'Confirm' },
    { key: 'Esc', label: 'Cancel' },
];

export function paginateMultiRow(shortcuts: readonly Shortcut[], columns: number, maxRows: number): Shortcut[][] {
    if (shortcuts.length === 0) return [[]];
    const rows = computeRows(shortcuts, columns);
    if (rows.length <= maxRows) return [shortcuts.slice()];

    const pages: Shortcut[][] = [];
    for (let i = 0; i < rows.length; i += maxRows) {
        const chunk: Shortcut[] = [];
        const end = Math.min(i + maxRows, rows.length);
        for (let r = i; r < end; r++) {
            for (let c = 0; c < rows[r].length; c++) {
                chunk.push(rows[r][c]);
            }
        }
        pages.push(chunk);
    }
    return pages;
}

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

function centeredRule(label: string, columns: number): string {
    const text = ` ${label} `;
    const remaining = columns - text.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return '─'.repeat(left) + text + '─'.repeat(right);
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

function renderShortcutRow(shortcuts: readonly Shortcut[], focusable: Shortcut[], focusedIndex: number | null | undefined): React.ReactElement {
    return (
        <Box>
            {shortcuts.map((s, i) => {
                const focusIdx = focusable.indexOf(s);
                const isFocused = focusedIndex != null && focusIdx !== -1 && focusIdx === focusedIndex;
                const label = `[${s.key}] ${s.label}`;
                const marginRight = i < shortcuts.length - 1 ? 2 : 0;

                const content = isFocused
                    ? <Text>{[...label].map((ch, ci) => <Text key={ci} inverse bold>{ch}</Text>)}</Text>
                    : s.disabled
                    ? <Text dimColor>{label}</Text>
                    : <Text><Text bold color="cyan">[{s.key}]</Text> {s.label}</Text>;

                return (
                    <Box key={i} marginRight={marginRight}>
                        {content}
                    </Box>
                );
            })}
        </Box>
    );
}

const FooterComponent: React.FC<FooterProps> = (footerProps: FooterProps) => {
    const columns = footerProps.columns ?? 80;

    // 4-row mode: globalShortcuts provided (1 separator + 1 global + 2 contextual)
    if (footerProps.globalShortcuts) {
        const contextual = footerProps.contextualShortcuts ?? [];
        const pageCount = footerProps.contextualPageCount ?? 1;
        const page = footerProps.contextualPage ?? 0;
        const contextualRows = contextual.length > 0 ? computeRows(contextual, columns) : [];
        const maxContextualRows = 2;

        const pageIndicator = pageCount > 1 ? (
            <Box marginLeft={2}>
                {page > 0
                    ? <Text bold color="cyan">{'<'}</Text>
                    : <Text dimColor>{'<'}</Text>}
                <Text dimColor> ({page + 1}/{pageCount}) </Text>
                {page < pageCount - 1
                    ? <Text bold color="cyan">{'>'}</Text>
                    : <Text dimColor>{'>'}</Text>}
            </Box>
        ) : null;

        return (
            <Box flexDirection="column" height={FOOTER_HEIGHT}>
                <Text bold wrap="truncate">{centeredRule('Hotkeys', columns)}</Text>
                {renderShortcutRow(footerProps.globalShortcuts, [], null)}
                {contextualRows.map((row, idx) => (
                    <Box key={idx}>
                        {renderShortcutRow(row, [], null)}
                        {idx === contextualRows.length - 1 && pageIndicator}
                    </Box>
                ))}
                {Array.from({ length: maxContextualRows - contextualRows.length }, (_, i) => (
                    <Text key={`pad-${i}`}> </Text>
                ))}
            </Box>
        );
    }

    // Legacy single-list mode
    const options: FooterOptions = {
        inThread: footerProps.inThread,
        responseSelected: footerProps.responseSelected,
        hasReplies: footerProps.hasReplies,
        isQuoting: footerProps.isQuoting,
        focusedAction: footerProps.focusedAction,
        inputFocused: footerProps.inputFocused,
    };
    const shortcuts = footerProps.shortcutOverrides ?? getFooterShortcuts(footerProps.viewType, options);
    const focusable = getFocusableShortcuts(footerProps.viewType, options);
    const rows = computeRows(shortcuts, columns);

    return (
        <Box flexDirection="column">
            {rows.map((row, rowIdx) => (
                <Box key={rowIdx}>
                    {renderShortcutRow(row, focusable, footerProps.focusedIndex)}
                </Box>
            ))}
        </Box>
    );
};

export const Footer = memo(FooterComponent);
