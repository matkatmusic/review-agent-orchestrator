import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { DB } from '../db.js';
import { createQuestion } from '../questions.js';
import { addBlocker } from '../dependencies.js';

export interface CreateProps {
    db: DB;
    onCreated: (qnum: number) => void;
    onBack: () => void;
}

const FIELDS = ['title', 'description', 'group', 'blockedBy'] as const;
type Field = (typeof FIELDS)[number];

const LABELS: Record<Field, string> = {
    title: 'Title',
    description: 'Description',
    group: 'Group (optional)',
    blockedBy: 'Blocked by (optional, e.g. 1,3,5)',
};

export default function Create({ db, onCreated, onBack }: CreateProps) {
    const [values, setValues] = useState<Record<Field, string>>({
        title: '',
        description: '',
        group: '',
        blockedBy: '',
    });
    const [activeField, setActiveField] = useState(0);
    const [error, setError] = useState('');

    const currentField = FIELDS[activeField]!;

    function setValue(field: Field, val: string) {
        setValues(prev => ({ ...prev, [field]: val }));
    }

    function submit() {
        const title = values.title.trim();
        const description = values.description.trim();
        const group = values.group.trim() || undefined;
        const blockedByStr = values.blockedBy.trim();

        if (!title) {
            setError('Title is required');
            setActiveField(0);
            return;
        }
        if (!description) {
            setError('Description is required');
            setActiveField(1);
            return;
        }

        // Parse blocked-by field
        let blockerNums: number[] = [];
        if (blockedByStr) {
            const parts = blockedByStr.split(',').map(s => s.trim().replace(/^Q/i, ''));
            for (const p of parts) {
                if (!p) continue;
                const n = parseInt(p, 10);
                if (isNaN(n) || n <= 0) {
                    setError(`Invalid blocker: "${p}"`);
                    setActiveField(3);
                    return;
                }
                blockerNums.push(n);
            }
        }

        setError('');
        const qnum = createQuestion(db, title, description, group);

        for (const blocker of blockerNums) {
            try {
                addBlocker(db, qnum, blocker);
            } catch {
                // Skip invalid blockers (e.g. nonexistent qnum fails FK)
            }
        }

        onCreated(qnum);
    }

    useInput((input, key) => {
        if (key.escape) {
            onBack();
            return;
        }
        if (key.return) {
            submit();
            return;
        }
        if (key.tab) {
            if (key.shift) {
                setActiveField(i => (i - 1 + FIELDS.length) % FIELDS.length);
            } else {
                setActiveField(i => (i + 1) % FIELDS.length);
            }
            setError('');
            return;
        }
    });

    return (
        <Box flexDirection="column">
            {FIELDS.map((field, i) => {
                const active = i === activeField;
                return (
                    <Box key={field} marginBottom={0}>
                        <Text color={active ? 'cyan' : undefined} bold={active}>
                            {active ? ' \u25B8 ' : '   '}
                        </Text>
                        <Text color={active ? 'cyan' : undefined} bold={active}>
                            {LABELS[field]}:{' '}
                        </Text>
                        {active ? (
                            <TextInput
                                value={values[field]}
                                onChange={(val) => setValue(field, val)}
                                focus={true}
                            />
                        ) : (
                            <Text dimColor={!values[field]}>
                                {values[field] || '(empty)'}
                            </Text>
                        )}
                    </Box>
                );
            })}

            {error && (
                <Box marginTop={1}>
                    <Text color="red">   {error}</Text>
                </Box>
            )}

            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                <Text dimColor>
                    {' [Tab] Next field  [Shift+Tab] Prev field  [Enter] Create  [Esc] Cancel '}
                </Text>
            </Box>
        </Box>
    );
}
