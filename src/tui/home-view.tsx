import React from 'react';
import { Box, Text } from 'ink';
import type { Issue } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';
import { statusToColor } from './status-color.js';

export interface HomeViewProps {
    issues: Issue[];
    unreadInums: Set<number>;
}

export const HomeView: React.FC<HomeViewProps> = ({ issues, unreadInums }) => {
    if (issues.length === 0) {
        return (
            <Box flexDirection="column">
                <Text dimColor>  No issues in this view.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            {issues.map((issue) => {
                const unread = unreadInums.has(issue.inum);
                const sColor = statusToColor(issue.status);
                const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                const title = issue.title.length > 40
                    ? issue.title.slice(0, 37) + '...'
                    : issue.title.padEnd(40);
                return (
                    <Box key={issue.inum}>
                        <Text>{'   '}</Text>
                        <Text>{`I-${issue.inum}`.padEnd(6)}</Text>
                        <Text>  </Text>
                        <Text>{title}</Text>
                        <Text> </Text>
                        <Text color="yellow" bold>{unread ? '\u2731' : ' '}</Text>
                        <Text>  </Text>
                        <Text color={sColor}>{statusLabel.padEnd(10)}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
