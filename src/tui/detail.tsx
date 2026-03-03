import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Issue, Response as IssueResponse } from '../types.js';
import { HEADER_LINES } from './header.js';

// ---- Types ----

interface ConversationLine {
    type: 'author-header' | 'body' | 'separator';
    author: 'user' | 'agent';
    text: string;
}

export interface DetailViewProps {
    inum: number;
    issue: Issue;
    responses: IssueResponse[];
    blockedBy: number[];
    blocks: number[];
    group: string;
    columns: number;
    rows: number;
    onBack?: () => void;
    onSend?: (message: string) => void;
}

// ---- Layout constants ----

const ISSUE_HEADER_LINES = 4; // title, status|group, deps, separator
const INPUT_AREA_LINES = 3;   // separator, input prompt, footer

const TYPE_TAG_REGEX = /^\((\w+)\)/;

// ---- Helpers ----

export function buildConversationLines(responses: IssueResponse[]): ConversationLine[] {
    const lines: ConversationLine[] = [];
    for (const resp of responses) {
        const timeStr = resp.created_at.replace('T', ' ').replace('Z', '');
        lines.push({
            type: 'author-header',
            author: resp.author,
            text: `[${resp.author}] ${timeStr}`,
        });
        for (const bodyLine of resp.body.split('\n')) {
            lines.push({ type: 'body', author: resp.author, text: bodyLine });
        }
        lines.push({ type: 'separator', author: resp.author, text: '' });
    }
    return lines;
}

function renderLine(line: ConversationLine, key: number): React.ReactNode {
    if (line.type === 'separator') {
        return <Text key={key}> </Text>;
    }

    if (line.type === 'author-header') {
        const color = line.author === 'user' ? 'cyan' : 'green';
        return <Text key={key} color={color} bold>{line.text}</Text>;
    }

    // Body line
    const color = line.author === 'user' ? 'cyan' : 'green';

    // Highlight (type) tags in agent responses
    if (line.author === 'agent') {
        const typeMatch = line.text.match(TYPE_TAG_REGEX);
        if (typeMatch) {
            return (
                <Text key={key}>
                    <Text color="yellow" bold>({typeMatch[1]})</Text>
                    <Text color={color}>{line.text.slice(typeMatch[0].length)}</Text>
                </Text>
            );
        }
    }

    return <Text key={key} color={color}>{line.text}</Text>;
}

// ---- Component ----

export function DetailView({
    inum,
    issue,
    responses,
    blockedBy,
    blocks,
    group,
    columns,
    rows,
    onSend,
}: DetailViewProps) {
    const [scrollOffset, setScrollOffset] = useState(0);
    const [inputValue, setInputValue] = useState('');

    const conversationLines = useMemo(
        () => buildConversationLines(responses),
        [responses],
    );

    const conversationHeight = Math.max(
        1,
        rows - HEADER_LINES - ISSUE_HEADER_LINES - INPUT_AREA_LINES,
    );
    const maxScroll = Math.max(0, conversationLines.length - conversationHeight);

    useInput((_input, key) => {
        if (key.upArrow) {
            setScrollOffset(prev => Math.max(0, prev - 1));
        } else if (key.downArrow) {
            setScrollOffset(prev => Math.min(maxScroll, prev + 1));
        }
    });

    const visibleLines = conversationLines.slice(
        scrollOffset,
        scrollOffset + conversationHeight,
    );

    const blockedByStr = blockedBy.length > 0
        ? blockedBy.map(n => `I-${n}`).join(', ')
        : '(none)';
    const blocksStr = blocks.length > 0
        ? blocks.map(n => `I-${n}`).join(', ')
        : '(none)';

    return (
        <Box flexDirection="column">
            {/* Issue info header */}
            <Text bold wrap="truncate">
                I-{inum}: {issue.title}
            </Text>
            <Text wrap="truncate">
                Status: <Text color="yellow">{issue.status}</Text>  |  Group: {group}
            </Text>
            <Text wrap="truncate">
                Blocked by: {blockedByStr}  |  Blocks: {blocksStr}
            </Text>
            <Text dimColor>{'─'.repeat(columns)}</Text>

            {/* Scrollable conversation */}
            <Box flexDirection="column" height={conversationHeight}>
                {visibleLines.map((line, i) => renderLine(line, i))}
            </Box>

            {/* Input area */}
            <Text dimColor>{'─'.repeat(columns)}</Text>
            <Box>
                <Text color="cyan">&gt; </Text>
                <TextInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={(value: string) => {
                        if (value.trim()) {
                            onSend?.(value.trim());
                        }
                        setInputValue('');
                    }}
                />
            </Box>

            {/* Footer shortcuts */}
            <Text dimColor wrap="truncate">
                [Enter] Send  [Esc] Back  [d] Defer  [r] Resolve  [b] Block  [w] Rebase  [s] Show pane  [↑↓] Scroll
            </Text>
        </Box>
    );
}

// ---- Mock data for Phase 1 (no DB) ----

export interface DetailMockData {
    issue: Issue;
    responses: IssueResponse[];
    blockedBy: number[];
    blocks: number[];
    group: string;
}

export const MOCK_DETAIL_DATA: Record<number, DetailMockData> = {
    1: {
        issue: {
            inum: 1,
            title: 'Implement authentication module',
            description: 'Add JWT-based auth with refresh token rotation',
            status: 'Active',
            created_at: '2025-01-15T10:00:00Z',
            resolved_at: null,
            issue_revision: 3,
            agent_last_read_at: '2025-01-15T12:00:00Z',
            user_last_viewed_at: '2025-01-15T11:00:00Z',
        },
        responses: [
            {
                id: 1, inum: 1, author: 'user',
                body: 'Please implement JWT authentication with refresh token rotation.',
                created_at: '2025-01-15T10:05:00Z',
            },
            {
                id: 2, inum: 1, author: 'agent',
                body: '(analysis) Examining the existing auth setup and planning JWT implementation.\n\nKey areas:\n1. Token generation and signing\n2. Refresh token rotation\n3. Token revocation list',
                created_at: '2025-01-15T10:10:00Z',
            },
            {
                id: 3, inum: 1, author: 'user',
                body: 'Looks good. Also handle token revocation on password change.',
                created_at: '2025-01-15T11:00:00Z',
            },
            {
                id: 4, inum: 1, author: 'agent',
                body: '(implementation) Added token revocation endpoint and integrated with password change flow.\n\nChanges:\n- src/auth/jwt.ts: Token generation\n- src/auth/refresh.ts: Rotation logic\n- src/auth/revoke.ts: Revocation list',
                created_at: '2025-01-15T11:30:00Z',
            },
            {
                id: 5, inum: 1, author: 'agent',
                body: '(question) Should refresh tokens have a maximum lifetime, or should they be valid indefinitely as long as they are rotated?',
                created_at: '2025-01-15T11:35:00Z',
            },
        ],
        blockedBy: [],
        blocks: [2],
        group: 'Sprint 1',
    },
    2: {
        issue: {
            inum: 2,
            title: 'Fix database connection pooling',
            description: 'Connection pool exhaustion under load',
            status: 'Blocked',
            created_at: '2025-01-14T09:00:00Z',
            resolved_at: null,
            issue_revision: 1,
            agent_last_read_at: null,
            user_last_viewed_at: null,
        },
        responses: [],
        blockedBy: [1],
        blocks: [],
        group: 'Inbox',
    },
};
