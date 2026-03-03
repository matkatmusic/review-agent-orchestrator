import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Container, Issue, IssueStatus } from '../types.js';

// ---- Mock data (Phase 1 — static, no DB) ----

const MOCK_ISSUES: Issue[] = [
    { inum: 1, title: 'Set up project scaffolding', description: '', status: 'Resolved', created_at: '', resolved_at: '2025-01-01', issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 2, title: 'Implement auth module', description: '', status: 'Active', created_at: '', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 3, title: 'Write database schema', description: '', status: 'Awaiting', created_at: '', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 4, title: 'Design API endpoints', description: '', status: 'Blocked', created_at: '', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 5, title: 'Add CI pipeline', description: '', status: 'Deferred', created_at: '', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 6, title: 'Deploy staging environment', description: '', status: 'Active', created_at: '', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 7, title: 'Create user dashboard', description: '', status: 'Resolved', created_at: '', resolved_at: '2025-01-15', issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
];

const MOCK_CONTAINERS: Container[] = [
    { id: 1, name: 'Inbox', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
    { id: 2, name: 'Backend Sprint 1', type: 'sprint', parent_id: null, description: 'Core backend work', status: 'Open', created_at: '', closed_at: null },
    { id: 3, name: 'Frontend', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
    { id: 4, name: 'Backlog', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
];

// Map container IDs to their issues (sorted by status priority, then inum)
const MOCK_CONTAINER_ISSUES: Record<number, Issue[]> = {
    1: [MOCK_ISSUES[1]!, MOCK_ISSUES[2]!, MOCK_ISSUES[0]!],          // Inbox: Active, Awaiting, Resolved
    2: [MOCK_ISSUES[5]!, MOCK_ISSUES[3]!, MOCK_ISSUES[4]!],          // Sprint 1: Active, Blocked, Deferred
    3: [MOCK_ISSUES[6]!],                                             // Frontend: Resolved
};

// ---- Status colors ----

function statusColor(status: IssueStatus): string {
    switch (status) {
        case 'Active': return 'green';
        case 'Awaiting': return 'yellow';
        case 'Blocked': return 'red';
        case 'Deferred': return 'gray';
        case 'Resolved': return 'blue';
    }
}

// ---- Progress bar ----

function progressBar(resolved: number, total: number, width: number = 10): string {
    if (total === 0) return '\u2591'.repeat(width);
    const filled = Math.min(Math.round((resolved / total) * width), width);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ---- Types ----

type GroupMode =
    | { mode: 'list'; cursor: number }
    | { mode: 'issues'; containerId: number; cursor: number; listCursor: number };

export interface GroupViewProps {
    onBack?: () => void;
    onNavigate?: (inum: number) => void;
}

// ---- Component ----

export function GroupView({ onBack, onNavigate }: GroupViewProps) {
    const [state, setState] = useState<GroupMode>({ mode: 'list', cursor: 0 });

    const containers = MOCK_CONTAINERS;

    const containerData = useMemo(() => {
        return containers.map(c => {
            const issues = MOCK_CONTAINER_ISSUES[c.id] ?? [];
            const resolved = issues.filter(i => i.status === 'Resolved').length;
            return { container: c, issues, resolved, total: issues.length };
        });
    }, []); // static mock data — never changes

    const containerId = state.mode === 'issues' ? state.containerId : null;

    // Current issues when drilled in
    const currentIssues = useMemo(() => {
        if (containerId === null) return [];
        return MOCK_CONTAINER_ISSUES[containerId] ?? [];
    }, [containerId]);

    const currentContainer = useMemo(() => {
        if (containerId === null) return null;
        return containers.find(c => c.id === containerId) ?? null;
    }, [containerId]);

    useInput((input, key) => {
        if (state.mode === 'list') {
            // ---- Container list mode ----
            if (key.downArrow || input === 'j') {
                setState(s => {
                    if (s.mode !== 'list') return s;
                    return { ...s, cursor: Math.min(s.cursor + 1, containerData.length - 1) };
                });
                return;
            }
            if (key.upArrow || input === 'k') {
                setState(s => {
                    if (s.mode !== 'list') return s;
                    return { ...s, cursor: Math.max(s.cursor - 1, 0) };
                });
                return;
            }
            if (key.return) {
                setState(s => {
                    if (s.mode !== 'list') return s;
                    const selected = containerData[s.cursor];
                    if (!selected) return s;
                    return { mode: 'issues', containerId: selected.container.id, cursor: 0, listCursor: s.cursor };
                });
                return;
            }
            if (key.escape) {
                onBack?.();
                return;
            }
        } else {
            // ---- Issue list mode (drilled in) ----
            if (key.downArrow || input === 'j' || input === 'n') {
                setState(s => {
                    if (s.mode !== 'issues') return s;
                    const issues = MOCK_CONTAINER_ISSUES[s.containerId] ?? [];
                    return { ...s, cursor: Math.min(s.cursor + 1, issues.length - 1) };
                });
                return;
            }
            if (key.upArrow || input === 'k' || input === 'p') {
                setState(s => {
                    if (s.mode !== 'issues') return s;
                    return { ...s, cursor: Math.max(s.cursor - 1, 0) };
                });
                return;
            }
            if (key.return) {
                if (currentIssues.length > 0 && currentIssues[state.cursor]) {
                    onNavigate?.(currentIssues[state.cursor]!.inum);
                }
                return;
            }
            if (key.escape) {
                setState(s => {
                    if (s.mode !== 'issues') return s;
                    return { mode: 'list', cursor: s.listCursor };
                });
                return;
            }
        }
    });

    // ---- Render ----

    if (state.mode === 'list') {
        return (
            <Box flexDirection="column">
                <Box marginBottom={1}>
                    <Text bold> Groups & Sprints </Text>
                    <Text dimColor>({containerData.length} containers)</Text>
                </Box>

                <Box flexDirection="column">
                    {containerData.length === 0 ? (
                        <Text dimColor>  No containers.</Text>
                    ) : (
                        containerData.map((data, i) => {
                            const selected = i === state.cursor;
                            const { container: c, resolved, total } = data;
                            const bar = progressBar(resolved, total);
                            return (
                                <Box key={c.id}>
                                    <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                        {selected ? ' \u25B8 ' : '   '}
                                    </Text>
                                    <Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">
                                        {c.name.length > 25 ? c.name.slice(0, 22) + '...' : c.name.padEnd(25)}
                                    </Text>
                                    <Text>  </Text>
                                    <Text dimColor>{c.type.padEnd(6)}</Text>
                                    <Text>  </Text>
                                    <Text color="green">{bar}</Text>
                                    <Text>  </Text>
                                    <Text>{`${resolved}/${total}`.padStart(5)}</Text>
                                </Box>
                            );
                        })
                    )}
                </Box>

                <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                    <Text dimColor>
                        {' [Enter] View issues  [\u2191\u2193] Navigate  [Esc] Back '}
                    </Text>
                </Box>
            </Box>
        );
    }

    // ---- Issue list (drilled in) ----

    const { resolved: contResolved, total: contTotal } = containerData.find(d => d.container.id === state.containerId) ?? { resolved: 0, total: 0 };

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold> {currentContainer?.name ?? 'Unknown'} </Text>
                <Text dimColor>({currentContainer?.type ?? 'group'})</Text>
                <Text>  </Text>
                <Text>{contResolved}/{contTotal} resolved</Text>
            </Box>

            <Box flexDirection="column">
                {currentIssues.length === 0 ? (
                    <Text dimColor>  No issues in this container.</Text>
                ) : (
                    currentIssues.map((issue, i) => {
                        const selected = i === state.cursor;
                        const sColor = statusColor(issue.status);
                        return (
                            <Box key={issue.inum}>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {selected ? ' \u25B8 ' : '   '}
                                </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    I-{String(issue.inum).padStart(3)}
                                </Text>
                                <Text>  </Text>
                                <Text color={sColor}>{issue.status.padEnd(9)}</Text>
                                <Text>  </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">
                                    {issue.title.length > 40 ? issue.title.slice(0, 37) + '...' : issue.title}
                                </Text>
                            </Box>
                        );
                    })
                )}
            </Box>

            <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
                <Text dimColor>
                    {' [Enter] View  [n] Next  [p] Prev  [\u2191\u2193] Navigate  [Esc] Back '}
                </Text>
            </Box>
        </Box>
    );
}
