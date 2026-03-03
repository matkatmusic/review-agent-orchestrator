import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, IssueStatus } from '../types.js';
import { statusToColor } from './status-color.js';

const STATUS_TABS = ['All', 'Active', 'Awaiting', 'Blocked', 'Deferred', 'Resolved'] as const;
type StatusFilter = (typeof STATUS_TABS)[number];

interface StatusCounts {
    Active: number;
    Awaiting: number;
    Blocked: number;
    Deferred: number;
    Resolved: number;
}

function computeCounts(issues: Issue[]): StatusCounts {
    const counts: StatusCounts = { Active: 0, Awaiting: 0, Blocked: 0, Deferred: 0, Resolved: 0 };
    for (const issue of issues) {
        counts[issue.status]++;
    }
    return counts;
}

export interface DashboardProps {
    issues: Issue[];
    unreadInums: Set<number>;
    maxAgents: number;
    onSelect: (inum: number) => void;
    onNewIssue: () => void;
    onActivate: (inum: number) => void;
    onDefer: (inum: number) => void;
    onResolve: (inum: number) => void;
}

export function Dashboard({
    issues,
    unreadInums,
    maxAgents,
    onSelect,
    onNewIssue,
    onActivate,
    onDefer,
    onResolve,
}: DashboardProps) {
    const [filter, setFilter] = useState<StatusFilter>('All');
    const [cursor, setCursor] = useState(0);

    const counts = useMemo(() => computeCounts(issues), [issues]);
    const activeCount = counts.Active;
    const atCapacity = activeCount >= maxAgents;

    const filtered = useMemo(() => {
        if (filter === 'All') return issues;
        return issues.filter(i => i.status === filter);
    }, [issues, filter]);

    // Clamp cursor when list changes
    const clampedCursor = Math.min(cursor, Math.max(0, filtered.length - 1));

    const cycleTab = useCallback((direction: 1 | -1) => {
        setFilter(prev => {
            const idx = STATUS_TABS.indexOf(prev);
            const next = STATUS_TABS[(idx + direction + STATUS_TABS.length) % STATUS_TABS.length]!;
            return next;
        });
        setCursor(0);
    }, []);

    useInput((input, key) => {
        // Tab switching
        if (key.tab) {
            cycleTab(key.shift ? -1 : 1);
            return;
        }

        // Cursor navigation
        if (key.downArrow || input === 'j') {
            setCursor(c => Math.min(filtered.length - 1, c + 1));
            return;
        }
        if (key.upArrow || input === 'k') {
            setCursor(c => Math.max(0, c - 1));
            return;
        }

        // Actions
        if (key.return) {
            if (filtered.length > 0 && filtered[clampedCursor]) {
                onSelect(filtered[clampedCursor]!.inum);
            }
            return;
        }

        if (input === 'n') {
            onNewIssue();
            return;
        }

        if (input === 'a') {
            if (filtered.length > 0 && filtered[clampedCursor]) {
                onActivate(filtered[clampedCursor]!.inum);
            }
            return;
        }

        if (input === 'd') {
            if (filtered.length > 0 && filtered[clampedCursor]) {
                onDefer(filtered[clampedCursor]!.inum);
            }
            return;
        }

        if (input === 'r') {
            if (filtered.length > 0 && filtered[clampedCursor]) {
                onResolve(filtered[clampedCursor]!.inum);
            }
            return;
        }
    });

    return (
        <Box flexDirection="column">
            {/* Status tabs */}
            <Box gap={2} marginBottom={1}>
                {STATUS_TABS.map(tab => {
                    const active = tab === filter;
                    const count = tab === 'All' ? issues.length : counts[tab];
                    return (
                        <Text key={tab} bold={active} inverse={active}>
                            {` ${tab} (${count}) `}
                        </Text>
                    );
                })}
                {atCapacity && (
                    <Text color="red" bold> Agents full ({activeCount}/{maxAgents}) </Text>
                )}
            </Box>

            {/* Issue list */}
            <Box flexDirection="column">
                {filtered.length === 0 ? (
                    <Text dimColor>  No issues in this view.</Text>
                ) : (
                    filtered.map((issue, i) => {
                        const selected = i === clampedCursor;
                        const unread = unreadInums.has(issue.inum);
                        const sColor = statusToColor(issue.status);
                        return (
                            <Box key={issue.inum}>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {selected ? ' \u25B8 ' : '   '}
                                </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {`I-${issue.inum}`.padEnd(6)}
                                </Text>
                                <Text>  </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {issue.title.length > 40
                                        ? issue.title.slice(0, 37) + '...'
                                        : issue.title.padEnd(40)}
                                </Text>
                                <Text> </Text>
                                <Text color="yellow" bold>{unread ? '\u2731' : ' '}</Text>
                                <Text>  </Text>
                                <Text color={sColor}>{issue.status.padEnd(10)}</Text>
                            </Box>
                        );
                    })
                )}
            </Box>

            {/* Footer shortcuts */}
            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                <Text dimColor>
                    {' [Enter] View  [n] New  [a] Activate  [d] Defer  [r] Resolve  [s] Show pane  [q] Quit '}
                </Text>
            </Box>
        </Box>
    );
}
