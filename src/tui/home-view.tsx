import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, ChangedStatusProps } from '../types.js';
import { IssueStatus, IssueStatusStringsMap } from '../types.js';
import { statusToColor } from './status-color.js';
import type { TerminalProps, LayoutProps } from './views.js';
import type { Shortcut } from './footer.js';
import { STATUS_SHORTCUTS, CONFIRM_TRASH_SHORTCUTS } from './footer.js';
import { KeyCombinations, matchesKeyCombination } from './hotkeys.js';
import { Header } from './header.js';
import { text } from 'stream/consumers';

const COL = {
    cursor: 2,
    id:     5,
    info:   8,
    status: 10,
} as const;

const SHOW_COLUMN_SEPARATORS = true;

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

function padToLength(str: string, maxLength: number): string {
    while( str.length < maxLength )
    {
        str = ' ' + str;
        if( str.length >= maxLength )
            break;
        str += ' ';
    }
    return str;
}

const columnSeparator = SHOW_COLUMN_SEPARATORS ? '|' : ' ';

interface TextColumnProps {
    text: string;
    selected: boolean;
    color: string | undefined;
    dimmed?: boolean;
}

function Column(columnProps: TextColumnProps): React.ReactElement {
    const color = columnProps.dimmed && !columnProps.color ? 'gray' : columnProps.color;
    return (
        <Text color={color} bold={columnProps.selected} dimColor={columnProps.dimmed}>
            {columnProps.text}
        </Text>
    );
}

function PipedSeparatorColumn() : React.ReactElement {
    let columnProps: TextColumnProps = {
        text: '|',
        selected: false,
        color: 'gray',
    }
    return Column(columnProps);
}

function BlankSeparatorColumn() : React.ReactElement {
    let columnProps: TextColumnProps = {
        text: ' ',
        selected: false,
        color: 'gray',
    };
    return Column(columnProps);
}

function TextWithSpaces(textColumnProps: TextColumnProps) : React.ReactElement {
    let columnProps: TextColumnProps = {
        ...textColumnProps,
        text: ' ' + textColumnProps.text + ' ',
    };
    return Column(columnProps);
}

interface CenteredTextInFixedWidthProps extends TextColumnProps {
    width: number;
}

function CenteredTextInFixedWidth(props: CenteredTextInFixedWidthProps) : React.ReactElement {
    return (
        <Box width={props.width} justifyContent="center">
            <TextWithSpaces text={props.text} selected={props.selected} color={props.color} />
        </Box>
    );
}

const enum HeaderColumns {
    ID, 
    Info,
    Title,
    Status,
};

const HeaderTitlesStringMap = new Map<HeaderColumns, string>([
    [HeaderColumns.ID, "ID#"],
    [HeaderColumns.Info, "Info"],
    [HeaderColumns.Title, "Title"],
    [HeaderColumns.Status, "Status"]
]);

function getTitleWidth(terminalProps: TerminalProps) : number 
{
    let numColumns = terminalProps.columns;
    const caretWidth = 1;
    const blankCharWidth = 1;
    const pipeCharWidth = 1;
    const idWidth = HeaderTitlesStringMap.get(HeaderColumns.ID)!.length + 2;
    const infoWidth = HeaderTitlesStringMap.get(HeaderColumns.Info)!.length + 2;
    const statusWidth = HeaderTitlesStringMap.get(HeaderColumns.Status)!.length + 2;
    const titleWidth = numColumns 
        - caretWidth 
        - pipeCharWidth 
        - idWidth 
        - pipeCharWidth 
        - infoWidth 
        - pipeCharWidth
        - statusWidth
        - pipeCharWidth
        - blankCharWidth;

    return titleWidth;
}

function HeaderRow(terminalProps: TerminalProps) : React.ReactElement {
    // _|_ID_|_Status_|_Info_|_Title ... <window width - 3>_|_
    const titleWidth = getTitleWidth(terminalProps);

    const headerRowColor = 'gray';
    const idText = HeaderTitlesStringMap.get(HeaderColumns.ID)!;
    const statusText = HeaderTitlesStringMap.get(HeaderColumns.Status)!;
    const infoText = HeaderTitlesStringMap.get(HeaderColumns.Info)!;
    const titleText = HeaderTitlesStringMap.get(HeaderColumns.Title)!;
    // chars before title padding: 2 blanks + pipe + (id+2) + pipe + (status+2) + pipe + (info+2) + pipe + (title+2)
    // chars after title padding: pipe + blank
    const usedWidth = 2 + 1 + (idText.length + 2) + 1 + (statusText.length + 2) + 1 + (infoText.length + 2) + 1 + (titleText.length + 2) + 1 + 1;
    const titlePadding = Math.max(0, terminalProps.columns - usedWidth);
    return (
        <Box>
            <BlankSeparatorColumn/>
            <BlankSeparatorColumn/>
            <PipedSeparatorColumn/>
            <TextWithSpaces text={idText} selected={false} color={headerRowColor} />
            <PipedSeparatorColumn/>
            <TextWithSpaces text={statusText} selected={false} color={headerRowColor} />
            <PipedSeparatorColumn/>
            <TextWithSpaces text={infoText} selected={false} color={headerRowColor} />
            <PipedSeparatorColumn/>
            <TextWithSpaces text={titleText} selected={false} color={headerRowColor} />
            <Column text={' '.repeat(titlePadding)} selected={false} color={undefined}/>
            <PipedSeparatorColumn/>
            <BlankSeparatorColumn/>
        </Box>
    );
}

interface SelectionCaretProps { 
    selected: boolean; 
    confirmHighlight?: boolean; 
}

function SelectionCaret(selectionCaretProps: SelectionCaretProps) : React.ReactElement {
    const columnProps: TextColumnProps = {
        text: selectionCaretProps.selected ? '> ' : '  ',
        selected: selectionCaretProps.selected,
        color: selectionCaretProps.confirmHighlight ? 'red' : 'cyan',
    };
    return Column(columnProps);
}

interface IssueNumProps {
    inum: number;
    selected: boolean;
    dimmed?: boolean;
}

function IssueNum(issueNumProps: IssueNumProps) : React.ReactElement {
    const textColumnProps: TextColumnProps = {
        text: `I-${issueNumProps.inum}`,
        selected: issueNumProps.selected,
        color: issueNumProps.selected ? 'cyan' : undefined,
        dimmed: issueNumProps.dimmed,
    };
    return TextWithSpaces(textColumnProps);
}

interface InfoMarkerProps {
    unread: boolean;
    blockingFlash: boolean;
    needsInput: boolean;
    blockedBySelectedFlash: boolean;
    dimmed?: boolean;
}

function InfoMarker(infoMarkerProps: InfoMarkerProps) : React.ReactElement {
    const maxLength = HeaderTitlesStringMap.get(HeaderColumns.Info)!.length;
    let str = '';
    if( infoMarkerProps.unread )
        str += "*";
    if( infoMarkerProps.needsInput )
        str += "i";

    str = padToLength(str, maxLength);

    const textColumnProps : TextColumnProps = {
        text: str,
        selected: false,
        color: 'yellow',
        dimmed: infoMarkerProps.dimmed,
    };
    return TextWithSpaces(textColumnProps);
}

interface FlashingTextProps {
    text: string;
    color: string;
    bold: boolean;
}

function FlashingText(props: FlashingTextProps): React.ReactElement {
    return (
        <Text color={props.color} bold={props.bold}>{props.text}</Text>
    );
}

interface StatusProps { 
    label: string; 
    color: string | undefined; 
    selected: boolean; 
}

function Status(textColumnProps: TextColumnProps) : React.ReactElement {
    const maxWidth = HeaderTitlesStringMap.get(HeaderColumns.Status)!.length + 2;
    const paddedProps: TextColumnProps = {
        ...textColumnProps,
        text: padToLength(textColumnProps.text, maxWidth),
    };
    return Column(paddedProps);
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
    onSelect?: (inum: number) => void;
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
    const [manualBlockerFlash, setManualBlockerFlash] = useState(false);
    const [flashBold, setFlashBold] = useState(true);
    const [confirmTrashInum, setConfirmTrashInum] = useState<number | null>(null);
    const [dimUnrelated, setDimUnrelated] = useState(false);

    const clampedCursor = homeViewProps.issues.length > 0
        ? Math.min(cursor, homeViewProps.issues.length - 1)
        : 0;
    const selectedIssueStatus = homeViewProps.issues.length > 0
        ? homeViewProps.issues[clampedCursor].status
        : undefined;

    const blockedByCurrentIssue = useMemo(() => {
        if (manualBlockerFlash || homeViewProps.issues.length === 0) return new Set<number>();
        const issue = homeViewProps.issues[clampedCursor];
        const s = new Set<number>();
        for (const iss of homeViewProps.issues) {
            if (iss.blocked_by.includes(issue.inum) && iss.status !== IssueStatus.Resolved) s.add(iss.inum);
        }
        return s;
    }, [clampedCursor, homeViewProps.issues, manualBlockerFlash]);

    useEffect(() => {
        if (blockedByCurrentIssue.size === 0 && flashingBlockerInums.size === 0) { setFlashBold(true); return; }
        const id = setInterval(() => setFlashBold(b => !b), 500);
        return () => clearInterval(id);
    }, [blockedByCurrentIssue, flashingBlockerInums]);

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
                : "Info: (*) unread, (i) needs input"
        );
        return () => homeViewProps.setHeaderSubtitleOverride?.(undefined);
    }, [confirmTrashInum]);

    function flashBlockers(inum: number) {
        const issue = homeViewProps.issues.find(i => i.inum === inum);
        if (!issue) return;
        setFlashingBlockerInums(new Set(issue.blocked_by));
        setManualBlockerFlash(true);
    }

    function autoFlashForIndex(idx: number) {
        if (homeViewProps.issues.length === 0) return;
        const issue = homeViewProps.issues[idx];
        if (hasUnresolvedBlockers(issue.inum)) {
            setFlashingBlockerInums(new Set(issue.blocked_by));
        } else {
            setFlashingBlockerInums(new Set());
        }
        setManualBlockerFlash(false);
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
        // process.stderr.write(`input=${JSON.stringify(input)} key=${JSON.stringify(key)}\n`); 
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

        if (key.return && homeViewProps.onSelect && homeViewProps.issues.length > 0) {
            const idx = Math.min(cursorRef.current, Math.max(0, homeViewProps.issues.length - 1));
            homeViewProps.onSelect(homeViewProps.issues[idx].inum);
            return;
        }

        if (matchesKeyCombination(KeyCombinations.SHIFT_D, input, key)) {
            setDimUnrelated(d => !d);
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

    const titleWidth = getTitleWidth(homeViewProps.terminalProps);
    
    return (
        <Box flexDirection="column">
            {/* header row */}
            <Box>
                <HeaderRow {...homeViewProps.terminalProps}/>
            </Box>
            {/* issue rows */}
            {homeViewProps.issues.map((issue, i) => {
                const selected = i === clampedCursor;
                const isConfirmTarget = confirmTrashInum === issue.inum;
                const unread = homeViewProps.unreadInums.has(issue.inum);
                const isBlocker = flashingBlockerInums.has(issue.inum);
                const isBlockedBySelected = blockedByCurrentIssue.has(issue.inum);
                const flashSuffix = isBlockedBySelected ? ' <- Blocks'
                    : isBlocker ? ' <- Blocked By'
                    : undefined;
                const suffixLen = flashSuffix ? flashSuffix.length : 0;
                const innerWidth = titleWidth - 1 - suffixLen; // 1 for leading space
                const titleText = issue.title.length > innerWidth
                    ? issue.title.slice(0, innerWidth - 3) + '...'
                    : issue.title;
                const anyHighlightActive = blockedByCurrentIssue.size > 0 || flashingBlockerInums.size > 0;
                const isDimmed = dimUnrelated && anyHighlightActive && !isBlockedBySelected && !isBlocker && !selected;
                const flashColor = isConfirmTarget ? 'red' : undefined;
                const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                const statusColor = isConfirmTarget ? 'red' : statusToColor(issue.status);
                return (
                    <Box key={issue.inum}>
                        <SelectionCaret selected={selected}/>
                        <PipedSeparatorColumn/>
                        <IssueNum inum={issue.inum} selected={selected} dimmed={isDimmed} />
                        <PipedSeparatorColumn/>
                        <Status text={statusLabel} color={statusColor} selected={selected} dimmed={isDimmed} />
                        <PipedSeparatorColumn/>
                        <InfoMarker unread={unread} blockingFlash={isBlocker} needsInput={false} blockedBySelectedFlash={isBlockedBySelected} dimmed={isDimmed} />
                        <PipedSeparatorColumn/>
                        <TextWithSpaces text={titleText} selected={selected} color={flashColor ?? (selected ? 'cyan' : undefined)} dimmed={isDimmed} />
                        {flashSuffix && <FlashingText text={flashSuffix} color="red" bold={flashBold} />}
                        <BlankSeparatorColumn/>
                        <BlankSeparatorColumn/>
                    </Box>
                );
            })}
        </Box>
    );
};
