import React, { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { DB } from '../db.js';
import type { Question } from '../types.js';
import { listAll, listByStatus, updateStatus } from '../questions.js';
import { hasUnreadAgentResponse } from '../responses.js';

const STATUSES = ['All', 'Active', 'Awaiting', 'Deferred', 'Resolved'] as const;
type StatusFilter = (typeof STATUSES)[number];

interface StatusCounts {
    Active: number;
    Awaiting: number;
    Deferred: number;
    Resolved: number;
    total: number;
    unread: number;
}

function getCounts(db: DB): StatusCounts {
    const all = listAll(db);
    let unread = 0;
    for (const q of all) {
        if (hasUnreadAgentResponse(db, q.qnum)) unread++;
    }
    return {
        Active: all.filter(q => q.status === 'Active').length,
        Awaiting: all.filter(q => q.status === 'Awaiting').length,
        Deferred: all.filter(q => q.status === 'Deferred').length,
        Resolved: all.filter(q => q.status === 'Resolved').length,
        total: all.length,
        unread,
    };
}

function getFilteredQuestions(db: DB, filter: StatusFilter): Question[] {
    if (filter === 'All') return listAll(db);
    return listByStatus(db, filter);
}

export interface DashboardProps {
    db: DB;
    onOpenDetail: (qnum: number) => void;
    onNewQuestion: () => void;
}

export default function Dashboard({ db, onOpenDetail, onNewQuestion }: DashboardProps) {
    const { exit } = useApp();
    const [filter, setFilter] = useState<StatusFilter>('All');
    const [cursor, setCursor] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = () => setRefreshKey(k => k + 1);

    const counts = useMemo(() => getCounts(db), [refreshKey]);
    const questions = useMemo(() => getFilteredQuestions(db, filter), [filter, refreshKey]);

    // Build unread set for marker display
    const unreadSet = useMemo(() => {
        const set = new Set<number>();
        for (const q of questions) {
            if (hasUnreadAgentResponse(db, q.qnum)) set.add(q.qnum);
        }
        return set;
    }, [questions, refreshKey]);

    // Clamp cursor when list changes
    const clampedCursor = Math.min(cursor, Math.max(0, questions.length - 1));
    if (clampedCursor !== cursor) setCursor(clampedCursor);

    useInput((input, key) => {
        if (input === 'q') {
            exit();
            return;
        }
        if (key.tab) {
            const idx = STATUSES.indexOf(filter);
            const next = key.shift
                ? STATUSES[(idx - 1 + STATUSES.length) % STATUSES.length]!
                : STATUSES[(idx + 1) % STATUSES.length]!;
            setFilter(next);
            setCursor(0);
            return;
        }
        if (key.upArrow) {
            setCursor(c => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow) {
            setCursor(c => Math.min(questions.length - 1, c + 1));
            return;
        }
        if (key.return) {
            if (questions.length > 0 && questions[clampedCursor]) {
                onOpenDetail(questions[clampedCursor]!.qnum);
            }
            return;
        }
        if (input === 'n') {
            onNewQuestion();
            return;
        }
        if (input === 'd') {
            if (questions.length > 0 && questions[clampedCursor]) {
                const q = questions[clampedCursor]!;
                if (q.status !== 'Deferred' && q.status !== 'Resolved') {
                    updateStatus(db, q.qnum, 'Deferred');
                    refresh();
                }
            }
            return;
        }
        if (input === 'r') {
            if (questions.length > 0 && questions[clampedCursor]) {
                const q = questions[clampedCursor]!;
                if (q.status !== 'Resolved') {
                    updateStatus(db, q.qnum, 'Resolved');
                    refresh();
                }
            }
            return;
        }
        if (input === 'a') {
            if (questions.length > 0 && questions[clampedCursor]) {
                const q = questions[clampedCursor]!;
                if (q.status === 'Deferred' || q.status === 'Resolved') {
                    updateStatus(db, q.qnum, 'Awaiting');
                    refresh();
                }
            }
            return;
        }
        // Refresh on 'R' (shift+r is capital R)
        if (input === 'R') {
            refresh();
            return;
        }
    });

    return (
        <Box flexDirection="column">
            {/* Header */}
            <Box marginBottom={1}>
                <Text bold> Question Review </Text>
                <Text dimColor>({counts.total} questions)</Text>
            </Box>

            {/* Status tabs */}
            <Box gap={2} marginBottom={1}>
                {STATUSES.map(s => {
                    const active = s === filter;
                    const count = s === 'All' ? counts.total : counts[s];
                    return (
                        <Text key={s} bold={active} inverse={active}>
                            {' '}{s} ({count}){' '}
                        </Text>
                    );
                })}
                {counts.unread > 0 && (
                    <Text color="yellow" bold> {'\u2731'} {counts.unread} new </Text>
                )}
            </Box>

            {/* Question list */}
            <Box flexDirection="column">
                {questions.length === 0 ? (
                    <Text dimColor>  No questions in this view.</Text>
                ) : (
                    questions.map((q, i) => {
                        const selected = i === clampedCursor;
                        const marker = unreadSet.has(q.qnum) ? '\u2731' : ' ';
                        const statusColor = statusToColor(q.status);
                        return (
                            <Box key={q.qnum}>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {selected ? ' \u25B8 ' : '   '}
                                </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    Q{String(q.qnum).padStart(3)}
                                </Text>
                                <Text>  </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {q.title.length > 40 ? q.title.slice(0, 37) + '...' : q.title.padEnd(40)}
                                </Text>
                                <Text> </Text>
                                <Text color="yellow" bold>{marker}</Text>
                                <Text>  </Text>
                                <Text color={statusColor}>{q.status.padEnd(8)}</Text>
                                {q.group && <Text dimColor>  [{q.group}]</Text>}
                            </Box>
                        );
                    })
                )}
            </Box>

            {/* Status bar */}
            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                <Text dimColor>
                    {' [Enter] View  [n] New  [d] Defer  [a] Activate  [r] Resolve  [Tab] Filter  [R] Refresh  [q] Quit '}
                </Text>
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
