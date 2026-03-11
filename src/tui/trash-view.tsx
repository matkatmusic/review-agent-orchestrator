import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue } from '../types.js';
import type { TerminalProps, LayoutProps } from './views.js';
import { ViewType } from './views.js';
import type { Shortcut } from './footer.js';
import { VIEW_SHORTCUTS, CONFIRM_DELETE_SHORTCUTS } from './footer.js';

const COL = {
    cursor: 2,
    id:     5,
    days:   8,
} as const;

// ---- Confirmation modal ----

interface ConfirmModalProps {
    prompt: string;
    shortcuts: readonly Shortcut[];
    columns: number;
    rows: number;
}

function ConfirmModal(props: ConfirmModalProps): React.ReactElement {
    return (
        <Box justifyContent="center" alignItems="center" width={props.columns} height={props.rows}>
            <Box flexDirection="column" alignItems="center" borderStyle="single" paddingLeft={1} paddingRight={1}>
                <Text> </Text>
                <Text bold color='red'>  {props.prompt}  </Text>
                <Text> </Text>
                <Box gap={2} justifyContent="center">
                    {props.shortcuts.map(s => (
                        <Text key={s.key}>
                            <Text>[</Text>
                            <Text color="cyan" bold>{s.key}</Text>
                            <Text>] {s.label}</Text>
                        </Text>
                    ))}
                </Box>
                <Text> </Text>
            </Box>
        </Box>
    );
}

interface TypeToConfirmModalProps {
    prompt: string;
    targetWord: string;
    typed: string;
    columns: number;
    rows: number;
}

function TypeToConfirmModal(props: TypeToConfirmModalProps): React.ReactElement {
    return (
        <Box justifyContent="center" alignItems="center" width={props.columns} height={props.rows}>
            <Box flexDirection="column" alignItems="center" borderStyle="single" paddingLeft={1} paddingRight={1}>
                <Text> </Text>
                <Text bold color="red">  {props.prompt}  </Text>
                <Text> </Text>
                <Box>
                    <Text>  Type </Text>
                    {[...props.targetWord].map((char, i) => (
                        <Text key={i} bold={i < props.typed.length} color={i < props.typed.length ? 'green' : undefined} dimColor={i >= props.typed.length}>
                            {char}
                        </Text>
                    ))}
                    <Text>  </Text>
                </Box>
                <Text> </Text>
                {props.typed === props.targetWord
                    ? <Box gap={2}><Text>[<Text color="cyan" bold>Enter</Text>] To Confirm</Text><Text>[<Text color="cyan" bold>Esc</Text>] Cancel</Text></Box>
                    : <Text>[<Text color="cyan" bold>Esc</Text>] Cancel</Text>
                }
                <Text> </Text>
            </Box>
        </Box>
    );
}

function center(text: string, width: number): string {
    const pad = width - text.length;
    if (pad <= 0) return text.slice(0, width);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

function bracketCenter(text: string, width: number): string {
    const inner = center(text, width - 2);
    return ` ${inner} `;
}

const columnSeparator = ' ';

interface SelectionCaretProps { selected: boolean; confirmHighlight?: boolean; }
function SelectionCaret(props: SelectionCaretProps): React.ReactElement {
    const colorToUse = props.confirmHighlight ? 'red' : props.selected ? 'cyan' : undefined;
    const caret = props.selected ? '\u25B8 ' : '  ';
    return <Text color={colorToUse} bold={props.selected}>{caret}</Text>;
}

interface IssueNumProps { inum: number; selected: boolean; confirmHighlight?: boolean; }
function IssueNum(props: IssueNumProps): React.ReactElement {
    const colorToUse = props.confirmHighlight ? 'red' : props.selected ? 'cyan' : undefined;
    const idLabel = center(`I-${props.inum}`, COL.id);
    return <Text color={colorToUse} bold={props.selected}>{columnSeparator}{idLabel}</Text>;
}

interface TitleProps { text: string; width: number; selected: boolean; flashColor: string | undefined; }
function Title(props: TitleProps): React.ReactElement {
    const colorToUse = props.flashColor ?? (props.selected ? 'cyan' : undefined);
    const titleContent = bracketCenter(props.text, props.width);
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color={colorToUse} bold={props.selected}>{titleContent}</Text>
        </>
    );
}

interface DaysProps { trashedAt: string; selected: boolean; confirmHighlight?: boolean; }
function Days(props: DaysProps): React.ReactElement {
    const ms = Date.now() - new Date(props.trashedAt).getTime();
    const days = Math.floor(ms / 86400000);
    const label = center(`${days}d`, COL.days);
    const colorToUse = props.confirmHighlight ? 'red' : props.selected ? 'cyan' : undefined;
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color={colorToUse} bold={props.selected}>{label}</Text>
            <Text>{columnSeparator}</Text>
        </>
    );
}

export interface TrashViewProps {
    issues: Issue[];
    terminalProps: TerminalProps;
    layoutProps: LayoutProps;
    setFooterShortcuts?: (shortcuts: readonly Shortcut[]) => void;
    setHeaderSubtitleOverride?: (s: string | undefined) => void;
    onRestoreIssue?: (inum: number) => void;
    onPermanentDelete?: (inum: number) => void;
    onEmptyTrash?: () => void;
}

export const TrashView: React.FunctionComponent<TrashViewProps> = (props: TrashViewProps) => {
    const [cursor, setCursor] = useState(0);
    const cursorRef = useRef(cursor);
    cursorRef.current = cursor;

    const [confirmDeleteInum, setConfirmDeleteInum] = useState<number | null>(null);
    const [emptyTrashTyped, setEmptyTrashTyped] = useState<string | null>(null);
    const confirmEmptyTrash = emptyTrashTyped !== null;

    const clampedCursor = props.issues.length > 0
        ? Math.min(cursor, props.issues.length - 1)
        : 0;

    // Footer shortcuts effect
    useEffect(() => {
        if (!props.setFooterShortcuts) return;
        const shortcuts = (() => {
            if (confirmDeleteInum !== null || confirmEmptyTrash)
                return [];
            return VIEW_SHORTCUTS[ViewType.Trash].filter(
                s => props.issues.length > 0 || s.key === 'Esc' || s.key === 'q'
            );
        })();
        props.setFooterShortcuts(shortcuts);
    }, [confirmDeleteInum, confirmEmptyTrash, props.issues.length]);

    // Header subtitle override effect — modal handles prompts now
    useEffect(() => {
        props.setHeaderSubtitleOverride?.(undefined);
    }, [confirmDeleteInum, confirmEmptyTrash]);

    useInput((input, key) => {
        // Delete confirmation state machine
        if (confirmDeleteInum !== null) {
            if (input === 'd') {
                props.onPermanentDelete?.(confirmDeleteInum);
                setConfirmDeleteInum(null);
            } else if (key.escape) {
                setConfirmDeleteInum(null);
            }
            return;
        }

        // Empty trash confirmation state machine
        if (emptyTrashTyped !== null) {
            if (key.escape) {
                setEmptyTrashTyped(null);
            } else if (key.backspace || key.delete) {
                setEmptyTrashTyped(prev => prev!.slice(0, -1));
            } else if (key.return && emptyTrashTyped === 'empty') {
                props.onEmptyTrash?.();
                setEmptyTrashTyped(null);
            } else if (input && input.length === 1) {
                const next = emptyTrashTyped + input;
                if ('empty'.startsWith(next)) {
                    setEmptyTrashTyped(next);
                }
                // else: ignore characters that don't match the expected sequence
            }
            return;
        }

        // Normal state
        if (key.downArrow) {
            setCursor(c => Math.min(c + 1, props.issues.length - 1));
        } else if (key.upArrow) {
            setCursor(c => Math.max(c - 1, 0));
        } else if (input === 'r' && props.issues.length > 0) {
            const idx = Math.min(cursorRef.current, Math.max(0, props.issues.length - 1));
            props.onRestoreIssue?.(props.issues[idx].inum);
        } else if (input === 'd' && props.issues.length > 0) {
            const idx = Math.min(cursorRef.current, Math.max(0, props.issues.length - 1));
            setConfirmDeleteInum(props.issues[idx].inum);
        } else if (input === 'e' && props.issues.length > 0) {
            setEmptyTrashTyped('');
        }
    });

    const contentRows = props.terminalProps.rows - props.layoutProps.headerLines - props.layoutProps.footerLines;

    if (props.issues.length === 0) {
        return (
            <Box justifyContent="center" alignItems="center" width={props.terminalProps.columns} height={contentRows}>
                <Text dimColor>Trash is empty.</Text>
            </Box>
        );
    }

    // 4 separators: |ID|Title|Days|
    const titleWidth = props.terminalProps.columns - COL.cursor - COL.id - COL.days - 4;
    const headerPad = ''.padEnd(COL.cursor);
    const headerColumns = `|${center('ID', COL.id)}|${center('Title', titleWidth)}|${center('Days', COL.days)}|`;


    if (confirmDeleteInum !== null) {
        return (
            <Box flexDirection="column">
                <ConfirmModal
                    prompt={`Really delete I-${confirmDeleteInum}?`}
                    shortcuts={CONFIRM_DELETE_SHORTCUTS}
                    columns={props.terminalProps.columns}
                    rows={contentRows}
                />
            </Box>
        );
    }
    if (emptyTrashTyped !== null) {
        return (
            <Box flexDirection="column">
                <TypeToConfirmModal
                    prompt="Really empty trash?"
                    targetWord="empty"
                    typed={emptyTrashTyped}
                    columns={props.terminalProps.columns}
                    rows={contentRows}
                />
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            {/* header row */}
            <Box>
                <Text dimColor>{headerPad}</Text>
                <Text dimColor>{headerColumns}</Text>
            </Box>
            {/* issue rows */}
            {props.issues.map((issue, i) => {
                const selected = i === clampedCursor;
                const innerWidth = titleWidth - 2;
                const titleText = issue.title.length > innerWidth
                    ? issue.title.slice(0, innerWidth - 3) + '...'
                    : issue.title;
                return (
                    <Box key={issue.inum}>
                        <SelectionCaret selected={selected} />
                        <IssueNum inum={issue.inum} selected={selected} />
                        <Title text={titleText} width={titleWidth} selected={selected} flashColor={undefined} />
                        <Days trashedAt={issue.trashed_at!} selected={selected} />
                    </Box>
                );
            })}
        </Box>
    );
};
