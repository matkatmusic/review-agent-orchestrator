import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Issue, Response as IssueResponse } from '../types.js';
import type { View } from './views.js';
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
    onNavigate?: (view: View) => void;
    onQuit?: () => void;
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
    onBack,
    onSend,
    onNavigate,
    onQuit,
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
        if (key.escape) {
            onBack?.();
            return;
        }
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

    // TODO: Make "Blocked by" and "Blocks" issue numbers navigable.
    // Pressing Tab could cycle focus between: text input → blocked-by links → blocks links.
    // When focused on a dependency link, arrow keys select an inum and Enter navigates to it.
    // Alternative: left/right arrows cycle through dependency inums in the header while
    // up/down continue to scroll conversation.

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

        </Box>
    );
}

