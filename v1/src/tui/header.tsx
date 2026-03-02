import React from 'react';
import { Box, Text } from 'ink';
import { statusToColor } from './status-color.js';
import type { QuestionStatus } from '../types.js';

export type HeaderContext =
    | { type: 'question'; qnum: number; status: QuestionStatus; blockers: number[]; description: string }
    | { type: 'new-question' }
    | { type: 'none' };

interface HeaderProps {
    context: HeaderContext;
    columns: number;
}

export default function Header({ context, columns }: HeaderProps) {
    // Line 1: centered title with dashes
    const title = ' Review Agent Orchestrator ';
    const dashCount = Math.max(0, columns - title.length);
    const leftDashes = Math.floor(dashCount / 2);
    const rightDashes = dashCount - leftDashes;
    const rule = '\u2500'.repeat(leftDashes) + title + '\u2500'.repeat(rightDashes);

    // Lines 2-3 depend on context
    let line2: React.ReactNode;
    let line3: React.ReactNode;

    if (context.type === 'question') {
        const blockersStr = context.blockers.length > 0
            ? context.blockers.map(b => `Q${b}`).join(', ')
            : '(none)';
        const color = statusToColor(context.status);
        line2 = (
            <Text>
                Q{context.qnum}       status: <Text color={color} bold>{context.status}</Text>     blocked by: [{blockersStr}]
            </Text>
        );
        const prefix = 'desc: ';
        const maxDescLen = Math.max(0, columns - prefix.length);
        const descOneLine = context.description.replace(/\n/g, ' ');
        const desc = descOneLine.length > maxDescLen
            ? descOneLine.slice(0, maxDescLen - 3) + '...'
            : descOneLine;
        line3 = <Text dimColor>desc: {desc}</Text>;
    } else if (context.type === 'new-question') {
        line2 = <Text bold>New Question</Text>;
        line3 = <Text dimColor>Fill in the fields below to create a new question</Text>;
    } else {
        line2 = <Text dimColor>(select a question to add responses to)</Text>;
        line3 = <Text> </Text>;
    }

    return (
        <Box flexDirection="column" height={3}>
            <Text>{rule}</Text>
            {line2}
            {line3}
        </Box>
    );
}
