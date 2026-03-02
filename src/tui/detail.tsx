import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { DB } from '../db.js';
import type { Response } from '../types.js';
import { getQuestion, updateStatus } from '../questions.js';
import { listResponses, addResponse, hasUnreadAgentResponse } from '../responses.js';
import { getBlockers, getBlocked } from '../dependencies.js';
import { getValidActions } from './status-actions.js';
import type { HeaderContext } from './header.js';

const UNREAD = '\u2731'; // ✱
const LINES_PER_RESPONSE = 4;
const RESERVED_LINES = 5; // description + input area + status bar

function formatTimestamp(iso: string): string {
    return iso.replace('T', ' ').replace(/:\d{2}Z?$/, '');
}

export interface DetailProps {
    db: DB;
    qnum: number;
    onBack: () => void;
    onHeaderUpdate?: (ctx: HeaderContext) => void;
    contentHeight?: number;
}

export default function Detail({ db, qnum, onBack, onHeaderUpdate, contentHeight }: DetailProps) {
    const [inputValue, setInputValue] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [inputFocused, setInputFocused] = useState(false);

    const refresh = () => setRefreshKey(k => k + 1);

    // Auto-refresh every 3 seconds to pick up external DB changes (daemon, agents)
    useEffect(() => {
        const timer = setInterval(refresh, 3000);
        return () => clearInterval(timer);
    }, []);

    const question = useMemo(() => getQuestion(db, qnum), [qnum, refreshKey]);
    const responses = useMemo(() => listResponses(db, qnum), [qnum, refreshKey]);
    const blockers = useMemo(() => getBlockers(db, qnum), [qnum, refreshKey]);
    const blocked = useMemo(() => getBlocked(db, qnum), [qnum, refreshKey]);
    const unread = useMemo(() => hasUnreadAgentResponse(db, qnum), [qnum, refreshKey]);

    // Report question context to the persistent header
    useEffect(() => {
        if (!onHeaderUpdate) return;
        if (question) {
            onHeaderUpdate({
                type: 'question',
                qnum: question.qnum,
                status: question.status,
                blockers: blockers.map(b => b.qnum),
                description: question.description,
            });
        } else {
            onHeaderUpdate({ type: 'none' });
        }
    }, [question, blockers, onHeaderUpdate]);

    useInput((input, key) => {
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
            if (question && question.status !== 'Deferred' && question.status !== 'User_Deferred' && question.status !== 'Resolved') {
                updateStatus(db, qnum, 'User_Deferred');
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
            if (question && question.status === 'Awaiting') {
                updateStatus(db, qnum, 'Active');
                refresh();
            } else if (question && (question.status === 'Deferred' || question.status === 'User_Deferred' || question.status === 'Resolved')) {
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

    // Slice responses to show only the most recent ones that fit
    const maxVisible = contentHeight
        ? Math.max(1, Math.floor((contentHeight - RESERVED_LINES) / LINES_PER_RESPONSE))
        : responses.length;
    const visibleResponses = responses.slice(-maxVisible);
    const hiddenCount = responses.length - visibleResponses.length;

    return (
        <Box flexDirection="column">
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
                    <>
                        {hiddenCount > 0 && (
                            <Text dimColor>  ... {hiddenCount} earlier response(s) hidden ...</Text>
                        )}
                        {visibleResponses.map((resp, i) => {
                            const globalIdx = hiddenCount + i;
                            const isLast = globalIdx === responses.length - 1;
                            return (
                                <ResponseBubble
                                    key={resp.id}
                                    response={resp}
                                    isLatest={isLast}
                                    unread={isLast && unread}
                                />
                            );
                        })}
                    </>
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
                        : ` [i/Enter] Reply  [Esc] Back  ${getValidActions(question.status).map(a => `[${a.key}] ${a.label}`).join('  ')} `
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
