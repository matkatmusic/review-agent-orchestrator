import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { View, TerminalProps } from './views.js';
import { ViewType } from './views.js';

interface ConfirmModalViewProps {
    view: Extract<View, { type: ViewType.ConfirmModal }>;
    terminalProps: TerminalProps;
}

export const ConfirmModalView: React.FC<ConfirmModalViewProps> = (props: ConfirmModalViewProps) => {
    useInput((input, key) => {
        const confirmKey = props.view.hotKeys[0];
        if (confirmKey && input === confirmKey.key) {
            props.view.onConfirm();
        } else if (key.escape) {
            props.view.onCancel();
        }
    });

    return (
        <Box justifyContent="center" alignItems="center" width={props.terminalProps.columns} height={props.terminalProps.rows}>
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
    );
};
