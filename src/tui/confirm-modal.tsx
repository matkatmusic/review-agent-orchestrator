import React from 'react';
import { Box, Text } from 'ink';
import type { Issue } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';
import type { View, TerminalProps } from './views.js';
import { ViewType } from './views.js';
import { useInput } from 'ink';

function centeredRule(label: string, width: number): string {
    const text = ` ${label} `;
    const remaining = Math.max(0, width - text.length);
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return '─'.repeat(left) + text + '─'.repeat(right);
}

interface ConfirmModalViewProps {
    view: Extract<View, { type: ViewType.ConfirmModal }>;
    terminalProps: TerminalProps;
}

interface IssuePreviewProps {
    issue: Issue;
    columns: number;
}

export function IssuePreview(previewProps: IssuePreviewProps): React.ReactElement {
    const statusLabel = IssueStatusStringsMap.get(previewProps.issue.status) ?? '';
    const maxDescLines = 5;
    const descLines = previewProps.issue.description.split('\n').slice(0, maxDescLines);
    const maxLineWidth = previewProps.columns - 6; // 2 padding each side + 2 margin

    return (
        <Box flexDirection="column">
            <Text bold color="cyan">I-{previewProps.issue.inum}: {previewProps.issue.title}</Text>
            <Text dimColor>Status: {statusLabel}</Text>
            <Text> </Text>
            {descLines.map((line, i) => (
                <Text key={i} wrap="truncate">{line.length > maxLineWidth ? line.slice(0, maxLineWidth - 3) + '...' : line}</Text>
            ))}
        </Box>
    );
}

export const ConfirmModalView: React.FC<ConfirmModalViewProps> = (props: ConfirmModalViewProps) => {
    useInput((input, key) => {
        if (key.escape) {
            props.view.onCancel();
            return;
        }
        for (const h of props.view.hotKeys) {
            if (input === h.key) {
                h.action();
                return;
            }
        }
    });

    const hasPreview = props.view.preview !== undefined;
    const availableHeight = props.terminalProps.rows;
    const topHeight = hasPreview ? Math.max(7, Math.floor(availableHeight / 3)) : availableHeight;

    return (
        <Box flexDirection="column" height={availableHeight}>
            <Box justifyContent="center" alignItems="center" width={props.terminalProps.columns} height={topHeight}>
                <Box flexDirection="column" alignItems="center" borderStyle="single" paddingLeft={1} paddingRight={1}>
                    <Text> </Text>
                    <Text bold color="red">  {props.view.message}  </Text>
                    <Text> </Text>
                    <Box gap={2} justifyContent="center">
                        {props.view.hotKeys.map(h => (
                            <Text key={h.key}>
                                <Text>[</Text>
                                <Text color="cyan" bold>{h.key}</Text>
                                <Text>] {h.label}</Text>
                            </Text>
                        ))}
                    </Box>
                    <Text> </Text>
                </Box>
            </Box>
            {hasPreview && (
                <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
                    <Text dimColor>{centeredRule('Issue Preview', Math.max(0, props.terminalProps.columns - 4))}</Text>
                    {props.view.preview}
                </Box>
            )}
        </Box>
    );
};
