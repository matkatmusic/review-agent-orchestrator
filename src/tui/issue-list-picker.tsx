import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import type { Issue } from '../types.js';
import { IssueStatusStringsMap } from '../types.js';
import { statusToColor } from './status-color.js';

// ---- Types ----

export interface IssueListPickerProps {
    title: string;
    issues: Issue[];
    selected: Set<number>;
    onToggle: (inum: number) => void;
    onClose: () => void;
}

// ---- Input bridge ----

function IssueListInputBridge({ onKey }: { onKey: (input: string, key: Key) => void }) {
    useInput(onKey);
    return null;
}

// ---- Component ----

export class IssueListPicker extends React.Component<IssueListPickerProps> {
    cursor: number;

    constructor(props: IssueListPickerProps) {
        super(props);
        const firstSelected = props.issues.findIndex(i => props.selected.has(i.inum));
        this.cursor = firstSelected >= 0 ? firstSelected : 0;
    }

    handleKey = (input: string, key: Key) => {
        if (key.escape) {
            this.props.onClose();
            return;
        }

        const maxIndex = this.props.issues.length - 1;

        if (key.upArrow || input === 'k') {
            this.cursor = Math.max(0, this.cursor - 1);
            this.forceUpdate();
        } else if (key.downArrow || input === 'j') {
            this.cursor = Math.min(maxIndex, this.cursor + 1);
            this.forceUpdate();
        } else if (key.return && this.props.issues.length > 0) {
            const issue = this.props.issues[this.cursor];
            this.props.onToggle(issue.inum);
        }
    };

    render() {
        const { title, issues, selected } = this.props;

        return (
            <Box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1}>
                <IssueListInputBridge onKey={this.handleKey} />
                <Text bold>{title}</Text>
                {issues.length === 0 ? (
                    <Text dimColor>  No other issues.</Text>
                ) : (
                    issues.map((issue, i) => {
                        const focused = i === this.cursor;
                        const checked = selected.has(issue.inum);
                        const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
                        const sColor = statusToColor(issue.status);
                        return (
                            <Box key={issue.inum}>
                                <Text color={focused ? 'cyan' : undefined}>
                                    {focused ? '▸ ' : '  '}
                                </Text>
                                <Text color={checked ? 'green' : 'gray'}>
                                    {checked ? '[x] ' : '[ ] '}
                                </Text>
                                <Text bold={focused} color={focused ? 'cyan' : undefined}>
                                    {`I-${issue.inum}`.padEnd(6)}
                                </Text>
                                <Text bold={focused} color={focused ? 'cyan' : undefined}>
                                    {issue.title.length > 30
                                        ? issue.title.slice(0, 27) + '...'
                                        : issue.title.padEnd(30)}
                                </Text>
                                <Text> </Text>
                                <Text color={sColor}>{statusLabel}</Text>
                            </Box>
                        );
                    })
                )}
                <Text dimColor>Toggle (enter)   Done (esc)</Text>
            </Box>
        );
    }
}
