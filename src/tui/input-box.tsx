import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export const INPUT_AREA_LINES = 3; // separator + input prompt + (line from Box)

export interface InputBoxProps {
    value: string;
    focused: boolean;
    columns: number;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
}

export class InputBox extends React.Component<InputBoxProps> {
    render() {
        const { value, focused, columns, onChange, onSubmit } = this.props;

        return (
            <>
                <Text dimColor>{'─'.repeat(columns)}</Text>
                <Box>
                    <Text color="cyan">Enter response: {'> '}</Text>
                    <TextInput
                        value={value}
                        focus={focused}
                        onChange={onChange}
                        onSubmit={onSubmit}
                    />
                </Box>
            </>
        );
    }
}
