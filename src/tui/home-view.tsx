import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, ChangedStatusProps, Dependency } from '../types.js';
import { IssueStatus, IssueStatusStringsMap } from '../types.js';
import { statusToColor } from './status-color.js';
import type { TerminalProps, LayoutProps } from './views.js';

const COL = {
    cursor: 2,
    id:     5,
    unread: 8,
    status: 10,
} as const;

const SHOW_COLUMN_SEPARATORS = false;

function center(text: string, width: number): string {
    const pad = width - text.length;
    if (pad <= 0) return text.slice(0, width);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

function bracketCenter(text: string, width: number, arrows: boolean): string {
    const inner = center(text, width - 2);
    return arrows ? `>${inner}<` : ` ${inner} `;
}

const columnSeparator = SHOW_COLUMN_SEPARATORS ? '|' : ' ';

interface SelectionCaretProps { selected: boolean; }
function SelectionCaret(selectionCaretProps: SelectionCaretProps): React.ReactElement {
    const colorToUse = selectionCaretProps.selected ? 'cyan' : undefined;
    const selectionCaret = selectionCaretProps.selected ? '\u25B8 ' : '  ';
    return (
        <Text color={colorToUse} bold={selectionCaretProps.selected}>
            {selectionCaret}
        </Text>
    );
}

interface IssueNumProps { inum: number; selected: boolean; }
function IssueNum(issueNumProps: IssueNumProps): React.ReactElement {
    const colorToUse = issueNumProps.selected ? 'cyan' : undefined;
    const idLabel = center(`I-${issueNumProps.inum}`, COL.id);
    return (
        <Text color={colorToUse} bold={issueNumProps.selected}>
            {columnSeparator}{idLabel}
        </Text>
    );
}

interface UnreadMarkerProps { unread: boolean; }
function UnreadMarker(unreadMarkerProps: UnreadMarkerProps): React.ReactElement {
    const markerText = unreadMarkerProps.unread ? '\u2731' : ' ';
    const centeredMarker = center(markerText, COL.unread);
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color="yellow" bold>{centeredMarker}</Text>
        </>
    );
}

interface TitleProps { text: string; width: number; selected: boolean; showArrows: boolean; flashColor: string | undefined; }
function Title(titleProps: TitleProps): React.ReactElement {
    const colorToUse = titleProps.flashColor ?? (titleProps.selected ? 'cyan' : undefined);
    const isBold = titleProps.selected || titleProps.showArrows;
    const titleContent = bracketCenter(titleProps.text, titleProps.width, titleProps.showArrows);
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color={colorToUse} bold={isBold}>{titleContent}</Text>
        </>
    );
}

interface StatusProps { label: string; color: string | undefined; selected: boolean; }
function Status(statusProps: StatusProps): React.ReactElement {
    const centeredLabel = center(statusProps.label, COL.status);
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color={statusProps.color} bold={statusProps.selected}>{centeredLabel}</Text>
            <Text>{columnSeparator}</Text>
        </>
    );
}

export interface HomeViewProps {
    issues: Issue[];
    dependencies: Dependency[];
    unreadInums: Set<number>;
    terminalProps: TerminalProps;
    layoutProps: LayoutProps;
    onStatusHotkeyPressed?: (changedStatusProps: ChangedStatusProps) => void;
    onSelectedStatusChange?: (status: IssueStatus | undefined) => void;
}

/*
equivalent to:
const std::function<ReactElement(HomeViewProps>) HomeView = [](HomeViewProps homeViewProps)
{

}
*/
export const HomeView: React.FunctionComponent<HomeViewProps> = (homeViewProps: HomeViewProps) => {
    const [cursor, setCursor] = useState(0);
    const cursorRef = useRef(cursor);
    cursorRef.current = cursor;

    const [flashingBlockerInums, setFlashingBlockerInums] = useState<Set<number>>(new Set());
    const [flashOn, setFlashOn] = useState(false);

    const clampedCursor = homeViewProps.issues.length > 0
        ? Math.min(cursor, homeViewProps.issues.length - 1)
        : 0;
    const selectedIssueStatus = homeViewProps.issues.length > 0
        ? homeViewProps.issues[clampedCursor].status
        : undefined;

    useEffect(() => {
        if (flashingBlockerInums.size === 0) return;
        const id = setInterval(() => setFlashOn(f => !f), 500);
        return () => clearInterval(id);
    }, [flashingBlockerInums]);

    useEffect(() => {
        homeViewProps.onSelectedStatusChange?.(selectedIssueStatus);
    }, [selectedIssueStatus]);

    useInput((input, key) => {
        if (key.downArrow || key.upArrow) {
            setFlashingBlockerInums(new Set());
        }
        if (key.downArrow) {
            setCursor(c => Math.min(c + 1, homeViewProps.issues.length - 1));
        } else if (key.upArrow) {
            setCursor(c => Math.max(c - 1, 0));
        }

        if (!homeViewProps.onStatusHotkeyPressed || homeViewProps.issues.length === 0) return;
        const idx = Math.min(cursorRef.current, Math.max(0, homeViewProps.issues.length - 1));
        const selectedIssue = homeViewProps.issues[idx];
        if (input === 'a' || input === 'd' || input === 'r') {
            if (selectedIssue.status === IssueStatus.Blocked) {
                const blockerInums = homeViewProps.dependencies
                    .filter(d => d.blocked_inum === selectedIssue.inum)
                    .map(d => d.blocker_inum);
                setFlashingBlockerInums(new Set(blockerInums));
                setFlashOn(true);
                return;
            }
        }
        if (input === 'a') {
            if (selectedIssue.status === IssueStatus.Active) return;
            homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Active });
        } else if (input === 'd') {
            if (selectedIssue.status === IssueStatus.Deferred) return;
            homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Deferred });
        } else if (input === 'r') {
            if (selectedIssue.status === IssueStatus.Resolved) return;
            homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Resolved });
        }
    });

    if (homeViewProps.issues.length === 0) {
        return (
            <Box flexDirection="column">
                <Text dimColor>  No issues in this view.</Text>
            </Box>
        );
    }

    // 5 pipe/space separators between columns: |ID|Unread|Title|Status|
    const titleWidth = homeViewProps.terminalProps.columns - COL.cursor - COL.id - COL.unread - COL.status - 5;
    const headerPad = ''.padEnd(COL.cursor);
    const headerColumns = `|${center('ID', COL.id)}|${center('Unread', COL.unread)}|${center('Title', titleWidth)}|${center('Status', COL.status)}|`;

    return (
        <Box flexDirection="column">
            {/* header row */}
            <Box>
                <Text dimColor>{headerPad}</Text>
                <Text dimColor>{headerColumns}</Text>
            </Box>
            {/* issue rows */}
            {homeViewProps.issues.map((issue, i) => {
                const selected = i === clampedCursor;
                const isFlashing = flashingBlockerInums.has(issue.inum);
                const showArrows = isFlashing && flashOn;
                const innerWidth = titleWidth - 2;
                const titleText = issue.title.length > innerWidth
                    ? issue.title.slice(0, innerWidth - 3) + '...'
                    : issue.title;
                const unread = homeViewProps.unreadInums.has(issue.inum);
                const flashColor = showArrows ? 'red' : undefined;
                const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                const statusColor = statusToColor(issue.status);
                return (
                    <Box key={issue.inum}>
                        <SelectionCaret selected={selected} />
                        <IssueNum inum={issue.inum} selected={selected} />
                        <UnreadMarker unread={unread} />
                        <Title text={titleText} width={titleWidth} selected={selected} showArrows={showArrows} flashColor={flashColor} />
                        <Status label={statusLabel} color={statusColor} selected={selected} />
                    </Box>
                );
            })}
        </Box>
    );
};
