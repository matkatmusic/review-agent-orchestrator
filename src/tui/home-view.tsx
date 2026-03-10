import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, ChangedStatusProps } from '../types.js';
import { IssueStatus, IssueStatusStringsMap } from '../types.js';
import { statusToColor } from './status-color.js';
import type { TerminalProps, LayoutProps } from './views.js';
import type { Shortcut } from './footer.js';
import { STATUS_SHORTCUTS, CONFIRM_TRASH_SHORTCUTS } from './footer.js';

const COL = {
    cursor: 2,
    id:     5,
    info:   8,
    status: 10,
} as const;

const SHOW_COLUMN_SEPARATORS = false;

function center(text: string, width: number): string {
    const pad = width - text.length;
    if (pad <= 0) return text.slice(0, width);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + text + ' '.repeat(pad - left);
}

function padCenter(text: string, width: number): string {
    const inner = center(text, width - 2);
    return ` ${inner} `;
}

const columnSeparator = SHOW_COLUMN_SEPARATORS ? '|' : ' ';

interface SelectionCaretProps { selected: boolean; confirmHighlight?: boolean; }
function SelectionCaret(selectionCaretProps: SelectionCaretProps): React.ReactElement {
    const colorToUse = selectionCaretProps.confirmHighlight ? 'red' : selectionCaretProps.selected ? 'cyan' : undefined;
    const selectionCaret = selectionCaretProps.selected ? '\u25B8 ' : '  ';
    return (
        <Text color={colorToUse} bold={selectionCaretProps.selected}>
            {selectionCaret}
        </Text>
    );
}

interface IssueNumProps { inum: number; selected: boolean; confirmHighlight?: boolean; }
function IssueNum(issueNumProps: IssueNumProps): React.ReactElement {
    const colorToUse = issueNumProps.confirmHighlight ? 'red' : issueNumProps.selected ? 'cyan' : undefined;
    const idLabel = center(`I-${issueNumProps.inum}`, COL.id);
    return (
        <Text color={colorToUse} bold={issueNumProps.selected}>
            {columnSeparator}{idLabel}
        </Text>
    );
}

interface InfoMarkerProps { unread: boolean; blockingFlash: boolean; needsInput: boolean; blockedBySelectedFlash: boolean; }
function InfoMarker(infoMarkerProps: InfoMarkerProps): React.ReactElement {
    if (infoMarkerProps.blockedBySelectedFlash || infoMarkerProps.blockingFlash) {
        return (<><Text>{columnSeparator}</Text><Text>{'       '}</Text></>);
    }
    const unreadChar = infoMarkerProps.unread ? '*' : ' ';
    const needsInputChar = infoMarkerProps.needsInput ? 'i' : ' ';
    const markerText = ` ${unreadChar}   ${needsInputChar} `;
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color="yellow" bold>{markerText}</Text>
        </>
    );
}

interface TitleProps { text: string; width: number; selected: boolean; flashColor: string | undefined; flashPrefix: string | undefined; }
function Title(titleProps: TitleProps): React.ReactElement {
    if (titleProps.flashPrefix) {
        const inner = titleProps.width - 2;
        const combined = titleProps.flashPrefix + titleProps.text;
        const displayText = combined.length > inner ? combined.slice(0, inner) : combined;
        const content = padCenter(displayText, titleProps.width);
        return (<><Text>{columnSeparator}</Text><Text color="red" bold>{content}</Text></>);
    }
    const colorToUse = titleProps.flashColor ?? (titleProps.selected ? 'cyan' : undefined);
    const titleContent = padCenter(titleProps.text, titleProps.width);
    return (
        <>
            <Text>{columnSeparator}</Text>
            <Text color={colorToUse} bold={titleProps.selected}>{titleContent}</Text>
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
    unreadInums: Set<number>;
    maxAgents: number;
    terminalProps: TerminalProps;
    layoutProps: LayoutProps;
    onStatusHotkeyPressed?: (changedStatusProps: ChangedStatusProps) => void;
    setFooterShortcuts?: (shortcuts: readonly Shortcut[]) => void;
    onTrashIssue?: (inum: number) => void;
    setHeaderSubtitleOverride?: (s: string | undefined) => void;
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
    const [flashingBlockedInums, setFlashingBlockedInums] = useState<Set<number>>(new Set());
    const [flashOn, setFlashOn] = useState(false);
    const [confirmTrashInum, setConfirmTrashInum] = useState<number | null>(null);

    const clampedCursor = homeViewProps.issues.length > 0
        ? Math.min(cursor, homeViewProps.issues.length - 1)
        : 0;
    const selectedIssueStatus = homeViewProps.issues.length > 0
        ? homeViewProps.issues[clampedCursor].status
        : undefined;

    useEffect(() => {
        if (flashingBlockerInums.size === 0 && flashingBlockedInums.size === 0) return;
        const id = setInterval(() => setFlashOn(f => !f), 500);
        return () => clearInterval(id);
    }, [flashingBlockerInums, flashingBlockedInums]);

    useEffect(() => {
        if (!homeViewProps.setFooterShortcuts) return;
        if (confirmTrashInum !== null) {
            homeViewProps.setFooterShortcuts(CONFIRM_TRASH_SHORTCUTS);
        } else if (selectedIssueStatus !== undefined) {
            homeViewProps.setFooterShortcuts(STATUS_SHORTCUTS[selectedIssueStatus]);
        }
    }, [selectedIssueStatus, confirmTrashInum]);

    useEffect(() => {
        if (!homeViewProps.setHeaderSubtitleOverride) return;
        homeViewProps.setHeaderSubtitleOverride(
            confirmTrashInum !== null
                ? "Confirm delete with 'x', Esc to cancel"
                : "Info: '*' unread  'i' needs input"
        );
        return () => homeViewProps.setHeaderSubtitleOverride?.(undefined);
    }, [confirmTrashInum]);

    function flashBlockers(inum: number) {
        const issue = homeViewProps.issues.find(i => i.inum === inum);
        if (!issue) return;
        setFlashingBlockerInums(new Set(issue.blocked_by));
        setFlashingBlockedInums(new Set());
        setFlashOn(true);
    }

    function autoFlashForIndex(idx: number) {
        if (homeViewProps.issues.length === 0) return;
        const issue = homeViewProps.issues[idx];
        if (hasUnresolvedBlockers(issue.inum)) {
            setFlashingBlockerInums(new Set(issue.blocked_by));
            setFlashOn(true);
        } else {
            setFlashingBlockerInums(new Set());
        }
        const blockedBySelected = new Set<number>();
        for (const iss of homeViewProps.issues) {
            if (iss.blocked_by.includes(issue.inum) && iss.status !== IssueStatus.Resolved) {
                blockedBySelected.add(iss.inum);
            }
        }
        setFlashingBlockedInums(blockedBySelected);
        if (blockedBySelected.size > 0) setFlashOn(true);
    }

    function hasUnresolvedBlockers(inum: number): boolean {
        const issue = homeViewProps.issues.find(i => i.inum === inum);
        if (!issue) return false;
        return issue.blocked_by.some(blockerInum => {
            const blocker = homeViewProps.issues.find(i => i.inum === blockerInum);
            return blocker !== undefined && blocker.status !== IssueStatus.Resolved;
        });
    }

    useInput((input, key) => {
        // Confirmation state machine for trash
        if (confirmTrashInum !== null) {
            if (input === 'x') {
                homeViewProps.onTrashIssue?.(confirmTrashInum);
                setConfirmTrashInum(null);
            } else if (key.escape) {
                setConfirmTrashInum(null);
            }
            return;
        }
        if (input === 'x' && homeViewProps.issues.length > 0) {
            const idx = Math.min(cursorRef.current, Math.max(0, homeViewProps.issues.length - 1));
            setConfirmTrashInum(homeViewProps.issues[idx].inum);
            return;
        }

        if (key.downArrow) {
            const newIdx = Math.min(cursorRef.current + 1, homeViewProps.issues.length - 1);
            setCursor(newIdx);
            cursorRef.current = newIdx;
            autoFlashForIndex(newIdx);
        } else if (key.upArrow) {
            const newIdx = Math.max(cursorRef.current - 1, 0);
            setCursor(newIdx);
            cursorRef.current = newIdx;
            autoFlashForIndex(newIdx);
        }

        if (!homeViewProps.onStatusHotkeyPressed || homeViewProps.issues.length === 0) return;
        const idx = Math.min(cursorRef.current, Math.max(0, homeViewProps.issues.length - 1));
        const selectedIssue = homeViewProps.issues[idx];
        const status = selectedIssue.status;

        if (input === 'e') {
            if (status === IssueStatus.Blocked) {
                flashBlockers(selectedIssue.inum);
            } else if (status === IssueStatus.Deferred) {
                if (hasUnresolvedBlockers(selectedIssue.inum)) {
                    flashBlockers(selectedIssue.inum);
                } else {
                    homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.InQueue });
                }
            } else if (status === IssueStatus.Resolved) {
                // Phase 3: open Detail, enqueue on submit. Stub: direct enqueue.
                homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.InQueue });
            }
        } else if (input === 'd') {
            if (status === IssueStatus.Active || status === IssueStatus.InQueue) {
                homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Deferred });
            }
        } else if (input === 'r') {
            if (status === IssueStatus.Blocked) {
                flashBlockers(selectedIssue.inum);
            } else if (status === IssueStatus.Active || status === IssueStatus.InQueue || status === IssueStatus.Deferred) {
                homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Resolved });
            }
        } else if (input === 'f') {
            if (status === IssueStatus.InQueue) {
                // Phase 2: capacity gate + swap modal. Stub: direct activate.
                homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Active });
            }
        } else if (input === 'b') {
            if (status === IssueStatus.Blocked) {
                flashBlockers(selectedIssue.inum);
            }
        }
    });

    if (homeViewProps.issues.length === 0) {
        return (
            <Box flexDirection="column">
                <Text dimColor>  No issues in this view.</Text>
            </Box>
        );
    }

    // 5 pipe/space separators between columns: |ID|Info|Title|Status|
    const titleWidth = homeViewProps.terminalProps.columns - COL.cursor - COL.id - COL.info - COL.status - 5;
    const headerPad = ''.padEnd(COL.cursor);
    const headerColumns = `${columnSeparator}${center('ID', COL.id)}${columnSeparator}${center('Info', COL.info)}${columnSeparator}${center('Title', titleWidth)}${columnSeparator}${center('Status', COL.status)}${columnSeparator}`;

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
                const isConfirmTarget = confirmTrashInum === issue.inum;
                const innerWidth = titleWidth - 2;
                const titleText = issue.title.length > innerWidth
                    ? issue.title.slice(0, innerWidth - 3) + '...'
                    : issue.title;
                const unread = homeViewProps.unreadInums.has(issue.inum);
                const isBlockingFlash = flashingBlockerInums.has(issue.inum) && flashOn;
                const isBlockedBySelectedFlash = flashingBlockedInums.has(issue.inum) && flashOn;
                const flashPrefix = isBlockedBySelectedFlash ? 'Blocks -> '
                    : isBlockingFlash ? 'Blocked By -> '
                    : undefined;
                const flashColor = isConfirmTarget ? 'red' : undefined;
                const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                const statusColor = isConfirmTarget ? 'red' : statusToColor(issue.status);
                return (
                    <Box key={issue.inum}>
                        <SelectionCaret selected={selected} confirmHighlight={isConfirmTarget} />
                        <IssueNum inum={issue.inum} selected={selected} confirmHighlight={isConfirmTarget} />
                        <InfoMarker unread={unread} blockingFlash={isBlockingFlash} needsInput={false} blockedBySelectedFlash={isBlockedBySelectedFlash} />
                        <Title text={titleText} width={titleWidth} selected={selected} flashColor={flashColor} flashPrefix={flashPrefix} />
                        <Status label={statusLabel} color={statusColor} selected={selected} />
                    </Box>
                );
            })}
        </Box>
    );
};
