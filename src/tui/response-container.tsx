import React from 'react';
import { Box, Text } from 'ink';
import type { Response } from '../types.js';
import { AuthorType, AuthorTypeStringsMap, ResponseTypeStringsMap } from '../types.js';

export interface ResponseContainerProps {
    response: Response;
    columns: number;
    selected: boolean;
    hasNewReplies: boolean;
    threadResolved?: boolean;
}

/** Count nodes in a reply chain. */
function countReplies(node: Response): number {
    let count = 0;
    let r = node.reply;
    while (r) {
        count++;
        r = r.response;
    }
    return count;
}

export class ResponseContainer extends React.Component<ResponseContainerProps> {
    static computeLineCount(body: string, columns: number): number {
        const innerWidth = Math.max(10, columns - 4);
        let bodyLines = 0;
        for (const rawLine of body.split('\n')) {
            bodyLines += Math.max(1, Math.ceil(rawLine.length / innerWidth));
        }
        return 1 + bodyLines + 1 + 1;
    }

    private renderTopBorder(innerWidth: number, color: string, selected: boolean): React.ReactNode {
        const { response, hasNewReplies, threadResolved } = this.props;
        const replyCount = countReplies(response);
        const borderColor = selected ? 'white' : color;

        if( response.is_continuation )
        {
            if( replyCount === 0 || selected )
            {
                // Plain dashes (no header badge when selected — bottom border shows it)
                return (
                    <Text color={borderColor} bold={selected}>
                        {'┌─'}{'─'.repeat(innerWidth)}{'─┐'}
                    </Text>
                );
            }

            // ┌─────────── [3 replies] ─┐  or  [3 replies ✓] when resolved
            const resolvedMark = threadResolved ? ' \u2713' : '';
            const replyLabel = ` [${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}${resolvedMark}] `;
            const badgeColor = threadResolved ? undefined : (hasNewReplies ? 'red' : borderColor);
            const leftDashes = Math.max(0, innerWidth - replyLabel.length);
            return (
                <Text>
                    <Text color={borderColor} bold={selected}>{'┌─'}{'─'.repeat(leftDashes)}</Text>
                    <Text color={badgeColor} dimColor={!!threadResolved} bold={hasNewReplies || selected}>{replyLabel}</Text>
                    <Text color={borderColor} bold={selected}>{'─┐'}</Text>
                </Text>
            );
        }

        // Non-continuation: full header with author, type, timestamp
        const authorStr = AuthorTypeStringsMap.get(response.content.author)!;
        const typeStr = ResponseTypeStringsMap.get(response.content.type)!;
        const timeStr = response.content.timestamp.replace('T', ' ').replace('Z', '');

        if (selected) {
            // Selected: author only, no type or timestamp
            const headerContent = ` ${authorStr} `;
            const fillLen = Math.max(0, innerWidth - headerContent.length);
            return (
                <Text color={borderColor} bold>
                    {'┌─ '}{authorStr}{' '}{'─'.repeat(fillLen)}{'─┐'}
                </Text>
            );
        }

        if (replyCount > 0) {
            // Unselected with replies: right-align reply badge in header
            const resolvedMark = threadResolved ? ' \u2713' : '';
            const replyBadge = hasNewReplies
                ? `[${replyCount} new ${replyCount === 1 ? 'reply' : 'replies'}${resolvedMark}]`
                : `[${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}${resolvedMark}]`;
            const leftContent = ` ${authorStr} - ${typeStr} - ${timeStr} `;
            const rightContent = ` ${replyBadge} `;
            const fillLen = Math.max(0, innerWidth - leftContent.length - rightContent.length);
            const badgeColor = threadResolved
                ? undefined
                : (hasNewReplies ? 'red' : borderColor);
            return (
                <Text>
                    <Text color={borderColor}>{'┌─ '}{authorStr}{' - '}</Text>
                    <Text color={'yellow'} bold>{typeStr}</Text>
                    <Text color={borderColor}>{' - '}{timeStr}{' '}{'─'.repeat(fillLen)}</Text>
                    <Text color={badgeColor} dimColor={!!threadResolved} bold={hasNewReplies && !threadResolved}>{rightContent}</Text>
                    <Text color={borderColor}>{'─┐'}</Text>
                </Text>
            );
        }

        // Unselected, no replies: full header
        const headerContent = ` ${authorStr} - ${typeStr} - ${timeStr} `;
        const fillLen = Math.max(0, innerWidth - headerContent.length);
        return (
            <Text>
                <Text color={borderColor}>{'┌─ '}{authorStr}{' - '}</Text>
                <Text color={'yellow'} bold>{typeStr}</Text>
                <Text color={borderColor}>{' - '}{timeStr}{' '}{'─'.repeat(fillLen)}{'─┐'}</Text>
            </Text>
        );
    }

    private renderBottomBorder(innerWidth: number, color: string, selected: boolean): React.ReactNode {
        const replyCount = countReplies(this.props.response);
        const borderColor = selected ? 'white' : color;

        if( !selected )
        {
            // Not selected: plain dashes
            return (
                <Text color={borderColor} bold={selected}>
                    {'└─'}{'─'.repeat(innerWidth)}{'─┘'}
                </Text>
            );
        }

        if (replyCount === 0) {
            // └──────────── reply to this ─┘
            const label = ' reply to this ';
            const leftDashes = Math.max(0, innerWidth - label.length);
            return (
                <Text color={borderColor} bold={selected}>
                    {'└─'}{'─'.repeat(leftDashes)}{label}{'─┘'}
                </Text>
            );
        }

        // └─────────── view replies (N) ─┘  or  └─────────── view replies (N new) ─┘
        const { hasNewReplies, threadResolved } = this.props;
        const resolvedMark = threadResolved ? ' \u2713' : '';
        const label = hasNewReplies
            ? ` view replies (${replyCount} new${resolvedMark}) `
            : ` view replies (${replyCount}${resolvedMark}) `;
        const leftDashes = Math.max(0, innerWidth - label.length);
        return (
            <Text color={borderColor} bold={selected}>
                {'└─'}{'─'.repeat(leftDashes)}{label}{'─┘'}
            </Text>
        );
    }

    render() {
        const { response, columns, selected, threadResolved } = this.props;
        const dimResolved = !!threadResolved && !selected;
        const color = response.content.author === AuthorType.User ? 'cyan' : 'green';
        const innerWidth = Math.max(10, columns - 4);

        // Word-wrap body at innerWidth
        const bodyLines: string[] = [];
        for (const rawLine of response.content.body.split('\n')) {
            let remaining = rawLine;
            do {
                bodyLines.push(remaining.slice(0, innerWidth));
                remaining = remaining.slice(innerWidth);
            } while (remaining.length > 0);
        }

        const borderColor = selected ? 'white' : color;

        return (
            <Box flexDirection="column" flexShrink={0}>
                {/* Top border */}
                {dimResolved
                    ? <Text dimColor>{this.renderTopBorder(innerWidth, color, selected)}</Text>
                    : this.renderTopBorder(innerWidth, color, selected)}

                {/* Body lines: │ text │ */}
                {bodyLines.map((line, i) => {
                    const padLen = Math.max(0, innerWidth - line.length);
                    return (
                        <Text key={i} dimColor={dimResolved}>
                            <Text color={borderColor} bold={selected}>{'│ '}</Text>
                            <Text color={color}>{line}{' '.repeat(padLen)}</Text>
                            <Text color={borderColor} bold={selected}>{' │'}</Text>
                        </Text>
                    );
                })}

                {/* Bottom border */}
                {dimResolved
                    ? <Text dimColor>{this.renderBottomBorder(innerWidth, color, selected)}</Text>
                    : this.renderBottomBorder(innerWidth, color, selected)}

                {/* Separator */}
                <Text>{' '}</Text>
            </Box>
        );
    }
}
