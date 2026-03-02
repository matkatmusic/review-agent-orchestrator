import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { DB } from '../db.js';
import type { Question } from '../types.js';
import { listAll, updateStatus, deleteQuestion } from '../questions.js';
import { getUnreadQnums } from '../responses.js';
import { getValidActions } from './status-actions.js';
import { statusToColor } from './status-color.js';
import type { HeaderContext } from './header.js';

const STATUSES = ['All', 'Active', 'Awaiting', 'Deferred', 'User_Deferred', 'Resolved'] as const;
type StatusFilter = (typeof STATUSES)[number];

interface StatusCounts {
    Active: number;
    Awaiting: number;
    Deferred: number;
    User_Deferred: number;
    Resolved: number;
    total: number;
    unread: number;
}

function getCounts(questions: Question[], unreadSet: Set<number>): StatusCounts {
    const counts: StatusCounts = {
        Active: 0, Awaiting: 0, Deferred: 0, User_Deferred: 0, Resolved: 0,
        total: questions.length, unread: 0,
    };
    for (const q of questions) {
        if (q.status in counts) counts[q.status as keyof Omit<StatusCounts, 'total' | 'unread'>]++;
        if (unreadSet.has(q.qnum)) counts.unread++;
    }
    return counts;
}

export interface DashboardProps {
    db: DB;
    onOpenDetail: (qnum: number) => void;
    onNewQuestion: () => void;
    onSelectionChange?: (ctx: HeaderContext) => void;
}

export default function Dashboard({ db, onOpenDetail, onNewQuestion, onSelectionChange }: DashboardProps) {
    const { exit } = useApp();
    const [filter, setFilter] = useState<StatusFilter>('All');
    const [cursor, setCursor] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = () => setRefreshKey(k => k + 1);

    // Auto-refresh every 3 seconds to pick up external DB changes (daemon, agents)
    useEffect(() => {
        const timer = setInterval(refresh, 3000);
        return () => clearInterval(timer);
    }, []);

    // Single bulk query for unread markers (replaces N+1 per-question queries)
    const unreadSet = useMemo(() => getUnreadQnums(db), [refreshKey]);
    const allQuestions = useMemo(() => listAll(db), [refreshKey]);
    const counts = useMemo(() => getCounts(allQuestions, unreadSet), [allQuestions, unreadSet]);
    const questions = useMemo(() => {
        if (filter === 'All') return allQuestions;
        return allQuestions.filter(q => q.status === filter);
    }, [allQuestions, filter]);

    // Clamp cursor when list shrinks (e.g. after status change or polling refresh)
    const clampedCursor = Math.min(cursor, Math.max(0, questions.length - 1));
    useEffect(() => {
        if (clampedCursor !== cursor) setCursor(clampedCursor);
    }, [clampedCursor, cursor]);

    // Dashboard shows just the title bar — no question details in the header
    useEffect(() => {
        if (onSelectionChange) onSelectionChange({ type: 'none' });
    }, [onSelectionChange]);

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
                if (q.status !== 'Deferred' && q.status !== 'User_Deferred' && q.status !== 'Resolved') {
                    updateStatus(db, q.qnum, 'User_Deferred');
                    refresh();
                }
            }
            return;
        }
        if (input === 'r' || input === 'R') {
            refresh();
            return;
        }
        if (input === 'a') {
            if (questions.length > 0 && questions[clampedCursor]) {
                const q = questions[clampedCursor]!;
                if (q.status === 'Awaiting') {
                    updateStatus(db, q.qnum, 'Active');
                    refresh();
                } else if (q.status === 'Deferred' || q.status === 'User_Deferred' || q.status === 'Resolved') {
                    updateStatus(db, q.qnum, 'Awaiting');
                    refresh();
                }
            }
            return;
        }
        if (input === 'x') {
            if (questions.length > 0 && questions[clampedCursor]) {
                deleteQuestion(db, questions[clampedCursor]!.qnum);
                refresh();
            }
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
                        const sColor = statusToColor(q.status);
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
                                <Text color={sColor}>{q.status.padEnd(8)}</Text>
                                {q.group && <Text dimColor>  [{q.group}]</Text>}
                            </Box>
                        );
                    })
                )}
            </Box>

            {/* Status bar */}
            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                <Text dimColor>
                    {(() => {
                        const selected = questions.length > 0 ? questions[clampedCursor] : undefined;
                        const actionHints = selected
                            ? getValidActions(selected.status).filter(a => a.key !== 'r').map(a => `[${a.key}] ${a.label}`).join('  ')
                            : '';
                        return ` [Enter] View  [n] New  ${actionHints}${actionHints ? '  ' : ''}[x] Delete  [Tab] Filter  [r] Refresh  [q] Quit `;
                    })()}
                </Text>
            </Box>
        </Box>
    );
}
