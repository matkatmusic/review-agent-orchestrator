import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, ChangedStatusProps } from '../types.js';
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

export interface HomeViewProps {
    issues: Issue[];
    unreadInums: Set<number>;
    terminalProps: TerminalProps;
    layoutProps: LayoutProps;
    onStatusHotkeyPressed?: (changedStatusProps: ChangedStatusProps) => void;
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

    useInput((input, key) => {
        if (key.downArrow) {
            setCursor(c => Math.min(c + 1, homeViewProps.issues.length - 1));
        } else if (key.upArrow) {
            setCursor(c => Math.max(c - 1, 0));
        }

        if (!homeViewProps.onStatusHotkeyPressed || homeViewProps.issues.length === 0) return;
        const idx = Math.min(cursorRef.current, Math.max(0, homeViewProps.issues.length - 1));
        const selectedIssue = homeViewProps.issues[idx];
        if (input === 'a') homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Active });
        else if (input === 'd') homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Deferred });
        else if (input === 'r') homeViewProps.onStatusHotkeyPressed({ inum: selectedIssue.inum, newStatus: IssueStatus.Resolved });
    });

    if (homeViewProps.issues.length === 0) {
        return (
            <Box flexDirection="column">
                <Text dimColor>  No issues in this view.</Text>
            </Box>
        );
    }

    const clampedCursor = Math.min(cursor, Math.max(0, homeViewProps.issues.length - 1));

    // 5 pipe/space separators between columns: |ID|Unread|Title|Status|
    const titleWidth = homeViewProps.terminalProps.columns - COL.cursor - COL.id - COL.unread - COL.status - 5;
    const sep = SHOW_COLUMN_SEPARATORS ? '|' : ' ';

    return (
        <Box flexDirection="column">
            {/* header row */}
            <Box>
                <Text dimColor>{''.padEnd(COL.cursor)}</Text>
                <Text dimColor>|{center('ID', COL.id)}|{center('Unread', COL.unread)}|{center('Title', titleWidth)}|{center('Status', COL.status)}|</Text>
            </Box>
            {/* issue rows */}
            {homeViewProps.issues.map((issue, i) => {
                const selected = i === clampedCursor;
                const unread = homeViewProps.unreadInums.has(issue.inum);
                const sColor = statusToColor(issue.status);
                const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                const titleText = issue.title.length > titleWidth
                    ? issue.title.slice(0, titleWidth - 3) + '...'
                    : issue.title;
                return (
                    <Box key={issue.inum}>
                        <Text color={selected ? 'cyan' : undefined} bold={selected}>
                            {selected ? '\u25B8 ' : '  '}
                        </Text>
                        <Text color={selected ? 'cyan' : undefined} bold={selected}>
                            {sep}{center(`I-${issue.inum}`, COL.id)}
                        </Text>
                        <Text>{sep}</Text>
                        <Text color="yellow" bold>{center(unread ? '\u2731' : ' ', COL.unread)}</Text>
                        <Text>{sep}</Text>
                        <Text color={selected ? 'cyan' : undefined} bold={selected}>
                            {center(titleText, titleWidth)}
                        </Text>
                        <Text>{sep}</Text>
                        <Text color={sColor} bold={selected}>{center(statusLabel, COL.status)}</Text>
                        <Text>{sep}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
