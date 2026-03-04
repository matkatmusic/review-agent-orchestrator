import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import TextInput from 'ink-text-input';
import type { Issue, Response as IssueResponse, Container } from '../types.js';
import type { View } from './views.js';
import { HEADER_LINES } from './header.js';
import { GroupPicker } from './group-picker.js';

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
    containers?: Container[];
    onBack?: () => void;
    onSend?: (message: string) => void;
    onNavigate?: (view: View) => void;
    onQuit?: () => void;
    onGroupChange?: (containerId: number) => void;
    onGroupCreate?: (name: string) => void;
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

// ---- Input bridge ----

function DetailInputBridge({ onKey }: { onKey: (input: string, key: Key) => void }) {
    useInput(onKey);
    return null;
}

// ---- Component ----

export class DetailView extends React.Component<DetailViewProps> {
    scrollOffset: number;
    inputValue: string;
    groupPickerOpen: boolean;
    private conversationLines: ConversationLine[];
    private lastResponses: IssueResponse[] | null;

    constructor(props: DetailViewProps) {
        super(props);
        this.scrollOffset = 0;
        this.inputValue = '';
        this.groupPickerOpen = false;
        this.conversationLines = buildConversationLines(props.responses);
        this.lastResponses = props.responses;
    }

    get conversationHeight(): number {
        return Math.max(
            1,
            this.props.rows - HEADER_LINES - ISSUE_HEADER_LINES - INPUT_AREA_LINES,
        );
    }

    get maxScroll(): number {
        return Math.max(0, this.conversationLines.length - this.conversationHeight);
    }

    handleKey = (input: string, key: Key) => {
        // When group picker is open, it handles its own input
        if (this.groupPickerOpen) return;

        if (key.escape) {
            this.props.onBack?.();
            return;
        }
        if (input === 'g' && this.props.containers) {
            this.groupPickerOpen = true;
            this.forceUpdate();
            return;
        }
        if (key.upArrow) {
            this.scrollOffset = Math.max(0, this.scrollOffset - 1);
            this.forceUpdate();
        } else if (key.downArrow) {
            this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + 1);
            this.forceUpdate();
        }
    };

    handleInputChange = (value: string) => {
        this.inputValue = value;
        this.forceUpdate();
    };

    handleInputSubmit = (value: string) => {
        if (value.trim()) {
            this.props.onSend?.(value.trim());
        }
        this.inputValue = '';
        this.forceUpdate();
    };

    render() {
        const { inum, issue, responses, blockedBy, blocks, group, columns, containers } = this.props;

        // Recompute conversation lines if responses changed (memoization)
        if (responses !== this.lastResponses) {
            this.conversationLines = buildConversationLines(responses);
            this.lastResponses = responses;
        }

        const visibleLines = this.conversationLines.slice(
            this.scrollOffset,
            this.scrollOffset + this.conversationHeight,
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

        // Total content height below the App header (conversation + input + issue header)
        const contentHeight = this.props.rows - HEADER_LINES;

        if (this.groupPickerOpen && containers) {
            return (
                <Box flexDirection="column" height={contentHeight} justifyContent="center" alignItems="center">
                    <DetailInputBridge onKey={this.handleKey} />
                    <GroupPicker
                        containers={containers}
                        currentGroup={group}
                        onSelect={(containerId) => {
                            this.props.onGroupChange?.(containerId);
                            this.groupPickerOpen = false;
                            this.forceUpdate();
                        }}
                        onCreate={(name) => {
                            this.props.onGroupCreate?.(name);
                            this.groupPickerOpen = false;
                            this.forceUpdate();
                        }}
                        onClose={() => {
                            this.groupPickerOpen = false;
                            this.forceUpdate();
                        }}
                    />
                </Box>
            );
        }

        return (
            <Box flexDirection="column">
                <DetailInputBridge onKey={this.handleKey} />
                {/* Issue info header */}
                <Text bold wrap="truncate">
                    I-{inum}: {issue.title}
                </Text>
                <Text wrap="truncate">
                    Status: <Text color="yellow">{issue.status}</Text>  |  Group: {group}{containers ? ' [g]' : ''}
                </Text>
                <Text wrap="truncate">
                    Blocked by: {blockedByStr}  |  Blocks: {blocksStr}
                </Text>
                <Text dimColor>{'─'.repeat(columns)}</Text>

                {/* Scrollable conversation */}
                <Box flexDirection="column" height={this.conversationHeight}>
                    {visibleLines.map((line, i) => renderLine(line, i))}
                </Box>

                {/* Input area */}
                <Text dimColor>{'─'.repeat(columns)}</Text>
                <Box>
                    <Text color="cyan">&gt; </Text>
                    <TextInput
                        value={this.inputValue}
                        onChange={this.handleInputChange}
                        onSubmit={this.handleInputSubmit}
                    />
                </Box>

            </Box>
        );
    }
}
