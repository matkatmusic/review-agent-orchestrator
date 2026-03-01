import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { DB } from '../db.js';
import type { Question, Response } from '../types.js';
import { getQuestion, updateStatus } from '../questions.js';
import { listResponses, addResponse, hasUnreadAgentResponse } from '../responses.js';
import { getBlockers, getBlocked } from '../dependencies.js';

const UNREAD = '\u2731'; // ✱

function formatTimestamp(iso: string): string {
    // "2026-02-28T20:31:00Z" → "2026-02-28 20:31"
    return iso.replace('T', ' ').replace(/:\d{2}Z?$/, '');
}

export interface DetailProps {
    db: DB;
    qnum: number;
    onBack: () => void;
}

export default function Detail({ db, qnum, onBack }: DetailProps) {
    const [inputValue, setInputValue] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [inputFocused, setInputFocused] = useState(false);

    const refresh = () => setRefreshKey(k => k + 1);

    const question = useMemo(() => getQuestion(db, qnum), [qnum, refreshKey]);
    const responses = useMemo(() => listResponses(db, qnum), [qnum, refreshKey]);
    const blockers = useMemo(() => getBlockers(db, qnum), [qnum, refreshKey]);
    const blocked = useMemo(() => getBlocked(db, qnum), [qnum, refreshKey]);
    const unread = useMemo(() => hasUnreadAgentResponse(db, qnum), [qnum, refreshKey]);

    useInput((input, key) => {
        // Esc is handled in both modes
        if (key.escape) {
            if (inputFocused) {
                if (inputValue.length > 0) {
                    setInputValue('');
                } else {
                    setInputFocused(false);
                }
            } else {
                onBack();
            }
            return;
        }

        // All other keys: only in command mode
        if (inputFocused) return;

        if (input === 'i' || key.return) {
            setInputFocused(true);
            return;
        }
        if (input === 'd') {
            if (question && question.status !== 'Deferred' && question.status !== 'Resolved') {
                updateStatus(db, qnum, 'Deferred');
                refresh();
            }
            return;
        }
        if (input === 'r') {
            if (question && question.status !== 'Resolved') {
                updateStatus(db, qnum, 'Resolved');
                refresh();
            }
            return;
        }
        if (input === 'a') {
            if (question && (question.status === 'Deferred' || question.status === 'Resolved')) {
                updateStatus(db, qnum, 'Awaiting');
                refresh();
            }
            return;
        }
    });

    const handleSubmit = (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return;
        addResponse(db, qnum, 'user', trimmed);
        setInputValue('');
        setInputFocused(false);
        refresh();
    };

    if (!question) {
        return (
            <Box flexDirection="column">
                <Text color="red">Question Q{qnum} not found.</Text>
                <Text dimColor>Press Esc to go back.</Text>
            </Box>
        );
    }

    const statusColor = statusToColor(question.status);
    const blockersStr = blockers.length > 0
        ? blockers.map(b => `Q${b.qnum}`).join(', ')
        : '(none)';
    const blockedStr = blocked.length > 0
        ? blocked.map(b => `Q${b.qnum}`).join(', ')
        : '(none)';

    return (
        <Box flexDirection="column">
            {/* Header */}
            <Box flexDirection="column" marginBottom={1}>
                <Text bold> Q{question.qnum}: {question.title} </Text>
                <Box gap={2}>
                    <Text>
                        Status: <Text color={statusColor} bold>{question.status}</Text>
                    </Text>
                    {question.group && (
                        <Text>
                            Group: <Text dimColor>{question.group}</Text>
                        </Text>
                    )}
                </Box>
                <Box gap={2}>
                    <Text>
                        Blocked by: <Text dimColor>{blockersStr}</Text>
                    </Text>
                    <Text>
                        Blocks: <Text dimColor>{blockedStr}</Text>
                    </Text>
                </Box>
            </Box>

            {/* Description */}
            {question.description && (
                <Box marginBottom={1} paddingLeft={1}>
                    <Text dimColor>{question.description}</Text>
                </Box>
            )}

            {/* Conversation */}
            <Box flexDirection="column">
                {responses.length === 0 ? (
                    <Text dimColor>  No responses yet.</Text>
                ) : (
                    responses.map((resp, i) => (
                        <ResponseBubble
                            key={resp.id}
                            response={resp}
                            isLatest={i === responses.length - 1}
                            unread={i === responses.length - 1 && unread}
                        />
                    ))
                )}
            </Box>

            {/* Input area */}
            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} flexDirection="column">
                {inputFocused ? (
                    <Box>
                        <Text color="cyan" bold>{'> '}</Text>
                        <TextInput
                            value={inputValue}
                            onChange={setInputValue}
                            onSubmit={handleSubmit}
                            focus={true}
                            placeholder="Type response..."
                        />
                    </Box>
                ) : (
                    <Text dimColor>  Press [i] or [Enter] to reply</Text>
                )}
            </Box>

            {/* Status bar */}
            <Box>
                <Text dimColor>
                    {inputFocused
                        ? ' [Enter] Send  [Esc] Cancel '
                        : ' [i/Enter] Reply  [Esc] Back  [d] Defer  [a] Activate  [r] Resolve '
                    }
                </Text>
            </Box>
        </Box>
    );
}

interface ResponseBubbleProps {
    response: Response;
    isLatest: boolean;
    unread: boolean;
}

function ResponseBubble({ response, isLatest, unread }: ResponseBubbleProps) {
    const isAgent = response.author === 'agent';
    const label = isAgent ? 'Agent' : 'You';
    const color = isAgent ? 'magenta' : 'green';
    const timestamp = formatTimestamp(response.created_at);
    const marker = isLatest && unread ? ` ${UNREAD}` : '';

    return (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
            <Box>
                <Text color={color} bold>{label}</Text>
                <Text dimColor>  {timestamp}{marker}</Text>
            </Box>
            <Box paddingLeft={2}>
                <Text wrap="wrap">{response.body}</Text>
            </Box>
        </Box>
    );
}

function statusToColor(status: string): string | undefined {
    switch (status) {
        case 'Active': return 'green';
        case 'Awaiting': return 'blue';
        case 'Deferred': return 'yellow';
        case 'Resolved': return 'gray';
        default: return undefined;
    }
}
