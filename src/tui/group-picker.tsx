import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import TextInput from 'ink-text-input';
import type { Container } from '../types.js';

// ---- Types ----

export interface GroupPickerProps {
    containers: Container[];
    currentGroup: string;
    onSelect: (containerId: number) => void;
    onCreate: (name: string) => void;
    onClose: () => void;
}

// ---- Input bridge ----

function GroupPickerInputBridge({ onKey }: { onKey: (input: string, key: Key) => void }) {
    useInput(onKey);
    return null;
}

// ---- Component ----

export class GroupPicker extends React.Component<GroupPickerProps> {
    cursor: number;
    creating: boolean;
    newGroupName: string;

    constructor(props: GroupPickerProps) {
        super(props);
        this.cursor = 0;
        this.creating = false;
        this.newGroupName = '';
    }

    handleKey = (input: string, key: Key) => {
        if (this.creating) {
            // In create mode, only Esc is handled here — TextInput handles the rest
            if (key.escape) {
                this.creating = false;
                this.newGroupName = '';
                this.forceUpdate();
            }
            return;
        }

        if (key.escape) {
            this.props.onClose();
            return;
        }

        const maxIndex = this.props.containers.length; // 0 = create row, 1..N = containers

        if (key.upArrow || input === 'k') {
            this.cursor = Math.max(0, this.cursor - 1);
            this.forceUpdate();
        } else if (key.downArrow || input === 'j') {
            this.cursor = Math.min(maxIndex, this.cursor + 1);
            this.forceUpdate();
        } else if (key.return) {
            if (this.cursor === 0) {
                this.creating = true;
                this.newGroupName = '';
                this.forceUpdate();
            } else {
                const container = this.props.containers[this.cursor - 1];
                this.props.onSelect(container.id);
            }
        }
    };

    handleCreateChange = (value: string) => {
        this.newGroupName = value;
        this.forceUpdate();
    };

    handleCreateSubmit = (value: string) => {
        if (value.trim()) {
            this.props.onCreate(value.trim());
        }
    };

    render() {
        const { containers, currentGroup } = this.props;

        if (this.creating) {
            return (
                <Box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1}>
                    <Text bold>Create new group</Text>
                    <Box>
                        <Text>Name: </Text>
                        <TextInput
                            value={this.newGroupName}
                            onChange={this.handleCreateChange}
                            onSubmit={this.handleCreateSubmit}
                        />
                    </Box>
                    <Text dimColor>Create (enter)   Cancel (esc)</Text>
                </Box>
            );
        }

        return (
            <Box flexDirection="column" borderStyle="single" paddingLeft={1} paddingRight={1}>
                <GroupPickerInputBridge onKey={this.handleKey} />

                {/* Row 0: Create new group */}
                <Text>
                    <Text>{this.cursor === 0 ? '▸ ' : '  '}</Text>
                    <Text color="green">+ Create new group</Text>
                </Text>

                {/* Container rows */}
                {containers.map((c, i) => {
                    const rowIndex = i + 1;
                    const isCurrent = c.name === currentGroup;
                    return (
                        <Text key={c.id}>
                            <Text>{this.cursor === rowIndex ? '▸ ' : '  '}</Text>
                            <Text color={isCurrent ? 'yellow' : undefined}>
                                {c.name}{isCurrent ? ' •' : ''}
                            </Text>
                        </Text>
                    );
                })}
            </Box>
        );
    }
}
