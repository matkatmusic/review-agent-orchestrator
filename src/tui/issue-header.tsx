import React from 'react';
import { Text } from 'ink';
import type { Issue } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';

export const ISSUE_HEADER_LINE_COUNT = 5; // title + status + deps + hint + separator

export interface IssueHeaderProps {
    inum: number;
    issue: Issue;
    group: string;
    blockedByStr: string;
    blocksStr: string;
    columns: number;
    focusedField: number | null;
}

// Field indices (must match detail.tsx constants)
const FIELD_GROUP = 0;
const FIELD_BLOCKED_BY = 1;
const FIELD_BLOCKS = 2;

export class IssueHeader extends React.Component<IssueHeaderProps> {
    render() {
        const { inum, issue, group, blockedByStr, blocksStr, columns, focusedField } = this.props;

        const groupFocused = focusedField === FIELD_GROUP;
        const blockedByFocused = focusedField === FIELD_BLOCKED_BY;
        const blocksFocused = focusedField === FIELD_BLOCKS;

        return (
            <>
                <Text key="title" bold wrap="truncate">
                    I-{inum}: {issue.title}
                </Text>
                <Text key="status" wrap="truncate">
                    Status: <Text color="yellow">{IssueStatusStringsMap.get(issue.status) ?? issue.status}</Text>  |  Group: <Text inverse={groupFocused} bold={groupFocused}>{` ${group} `}</Text>
                </Text>
                <Text key="deps" wrap="truncate">
                    Blocked by: <Text inverse={blockedByFocused} bold={blockedByFocused}>{` ${blockedByStr} `}</Text>  |  Blocks: <Text inverse={blocksFocused} bold={blocksFocused}>{` ${blocksStr} `}</Text>
                </Text>
                <Text key="hint" dimColor>(Tab to change Group, Blocked By, Blocks)</Text>
                <Text key="sep" dimColor>{'─'.repeat(columns)}</Text>
            </>
        );
    }
}
