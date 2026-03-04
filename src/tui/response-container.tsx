import React from 'react';
import { Box, Text } from 'ink';
import type { Response as IssueResponse } from '../types.js';
import { AuthorType, AuthorTypeStringsMap, ResponseType, ResponseTypeStringsMap } from '../types.js';

export interface ResponseContainerProps {
    response: IssueResponse;
    columns: number;
    selected: boolean;
}

export class ResponseContainer extends React.Component<ResponseContainerProps> {
    /**
     * Compute total terminal lines this container occupies:
     * 1 (top border) + bodyLines + 1 (bottom border) + 1 (separator)
     */
    static computeLineCount(body: string, columns: number): number {
        const innerWidth = Math.max(10, columns - 4);
        let bodyLines = 0;
        for (const rawLine of body.split('\n')) {
            bodyLines += Math.max(1, Math.ceil(rawLine.length / innerWidth));
        }
        return 1 + bodyLines + 1 + 1;
    }

    render() {
        const { response, columns, selected } = this.props;
        const color = response.author === AuthorType.User ? 'cyan' : 'green';
        const innerWidth = Math.max(10, columns - 4);
        const timeStr = response.created_at.replace('T', ' ').replace('Z', '');
        const authorStr = AuthorTypeStringsMap.get(response.author)!;
        const typeStr = ResponseTypeStringsMap.get(response.type)!;

        // Header content for width calculation
        const headerContent = ` ${authorStr} - ${typeStr} - ${timeStr} `;
        const fillLen = Math.max(0, innerWidth - headerContent.length);

        // Word-wrap body at innerWidth
        const bodyLines: string[] = [];
        for (const rawLine of response.body.split('\n')) {
            let remaining = rawLine;
            do {
                bodyLines.push(remaining.slice(0, innerWidth));
                remaining = remaining.slice(innerWidth);
            } while (remaining.length > 0);
        }

        return (
            <Box flexDirection="column" flexShrink={0}>
                {/* Top border: ┌─ Author - Type - timestamp ───┐ */}
                <Text>
                    <Text color={selected ? 'white' : color} bold={selected}>{'┌─ '}{authorStr}{' - '}</Text>
                    <Text color={'yellow'} bold>{typeStr}</Text>
                    <Text color={selected ? 'white' : color} bold={selected}>{' - '}{timeStr}{' '}{'─'.repeat(fillLen)}{'─┐'}</Text>
                </Text>

                {/* Body lines: │ text │ */}
                {bodyLines.map((line, i) => {
                    const padLen = Math.max(0, innerWidth - line.length);
                    return (
                        <Text key={i}>
                            <Text color={selected ? 'white' : color} bold={selected}>{'│ '}</Text>
                            <Text color={color}>{line}{' '.repeat(padLen)}</Text>
                            <Text color={selected ? 'white' : color} bold={selected}>{' │'}</Text>
                        </Text>
                    );
                })}

                {/* Bottom border: └───────────────┘ */}
                <Text color={selected ? 'white' : color} bold={selected}>{'└─'}{'─'.repeat(innerWidth)}{'─┘'}</Text>

                {/* Separator */}
                <Text>{' '}</Text>
            </Box>
        );
    }
}
