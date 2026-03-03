import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

export interface NewIssueData {
    title: string;
    description: string;
    group: string;
    blockedBy: string;
}

interface NewIssueProps {
    onCreated: (data: NewIssueData) => void;
    onCancel: () => void;
}

const FIELDS = ['Title', 'Description', 'Group', 'Blocked by'] as const;
const FIELD_COUNT = FIELDS.length;

function validateBlockedBy(value: string): boolean {
    if (!value.trim()) return true; // optional field
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    return parts.every(p => {
        const stripped = p.replace(/^I/i, '');
        return /^\d+$/.test(stripped);
    });
}

function NewIssue({ onCreated, onCancel }: NewIssueProps) {
    const [activeField, setActiveField] = useState(0);
    const [values, setValues] = useState<Record<number, string>>({
        0: '',
        1: '',
        2: '',
        3: '',
    });
    const [error, setError] = useState<string | null>(null);

    const setValue = useCallback((fieldIndex: number, value: string) => {
        setValues(prev => ({ ...prev, [fieldIndex]: value }));
    }, []);

    const handleSubmit = useCallback(() => {
        const title = values[0].trim();
        const description = values[1].trim();
        const group = values[2].trim();
        const blockedBy = values[3].trim();

        if (!title) {
            setError('Title is required');
            return;
        }
        if (!description) {
            setError('Description is required');
            return;
        }
        if (!validateBlockedBy(blockedBy)) {
            setError('Invalid blocker format — use comma-separated issue numbers (e.g. 1,3,5)');
            return;
        }

        onCreated({ title, description, group, blockedBy });
    }, [values, onCreated]);

    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }

        if (key.return) {
            handleSubmit();
            return;
        }

        if (key.tab) {
            setError(null);
            if (key.shift) {
                setActiveField(prev => (prev - 1 + FIELD_COUNT) % FIELD_COUNT);
            } else {
                setActiveField(prev => (prev + 1) % FIELD_COUNT);
            }
            return;
        }
    });

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box marginBottom={1}>
                <Text bold>New Issue</Text>
            </Box>

            {FIELDS.map((label, i) => (
                <Box key={label} flexDirection="row" marginBottom={i < FIELD_COUNT - 1 ? 0 : 0}>
                    <Text color={activeField === i ? 'cyan' : undefined}>
                        {activeField === i ? '▸ ' : '  '}
                    </Text>
                    <Text color={activeField === i ? 'cyan' : 'white'} bold={activeField === i}>
                        {label}:{' '}
                    </Text>
                    {activeField === i ? (
                        <TextInput
                            value={values[i]}
                            onChange={(val) => setValue(i, val)}
                            focus={true}
                        />
                    ) : (
                        <Text dimColor={!values[i]}>
                            {values[i] || (i >= 2 ? '(optional)' : '')}
                        </Text>
                    )}
                </Box>
            ))}

            {error && (
                <Box marginTop={1}>
                    <Text color="red">{error}</Text>
                </Box>
            )}

        </Box>
    );
}

export { NewIssue };
