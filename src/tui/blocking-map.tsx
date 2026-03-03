import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { View } from './views.js';
import type { Issue, Dependency } from '../types.js';
import { statusToColor } from './status-color.js';

// ── Mock Data (Phase 1 — static, replaced by DB queries in Phase 2.6) ──

const MOCK_ISSUES: Issue[] = [
    { inum: 1, title: 'Set up CI pipeline', description: '', status: 'Active', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 2, title: 'Design database schema', description: '', status: 'Awaiting', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 3, title: 'Implement auth module', description: '', status: 'Blocked', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 4, title: 'Write API endpoints', description: '', status: 'Blocked', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 5, title: 'Build data layer', description: '', status: 'Blocked', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 6, title: 'Integration testing', description: '', status: 'Blocked', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 7, title: 'Update README', description: '', status: 'Deferred', created_at: '', resolved_at: null, issue_revision: 0, agent_last_read_at: null, user_last_viewed_at: null },
];

// I-1 blocks I-3, I-4 | I-2 blocks I-5 | I-3 blocks I-6 | I-5 blocks I-6 (diamond on I-6)
const MOCK_DEPS: Dependency[] = [
    { blocker_inum: 1, blocked_inum: 3 },
    { blocker_inum: 1, blocked_inum: 4 },
    { blocker_inum: 2, blocked_inum: 5 },
    { blocker_inum: 3, blocked_inum: 6 },
    { blocker_inum: 5, blocked_inum: 6 },
];

// ── Tree Building ──

interface FlatRow {
    issue: Issue;
    prefix: string;  // ASCII tree connector prefix
    depth: number;
}

function buildFlatRows(issues: Issue[], deps: Dependency[]): FlatRow[] {
    const issueMap = new Map<number, Issue>();
    for (const issue of issues) issueMap.set(issue.inum, issue);

    // Build adjacency: blocker → list of blocked issues
    const childrenOf = new Map<number, number[]>();
    const hasParent = new Set<number>();
    const inGraph = new Set<number>();

    for (const dep of deps) {
        inGraph.add(dep.blocker_inum);
        inGraph.add(dep.blocked_inum);
        hasParent.add(dep.blocked_inum);
        const children = childrenOf.get(dep.blocker_inum) ?? [];
        children.push(dep.blocked_inum);
        childrenOf.set(dep.blocker_inum, children);
    }

    // Roots: in the graph but not blocked by anything
    const roots = [...inGraph].filter(inum => !hasParent.has(inum)).sort((a, b) => a - b);

    // Isolated issues: not in the dependency graph at all
    const isolated = issues.filter(i => !inGraph.has(i.inum));

    const rows: FlatRow[] = [];

    function walk(inum: number, prefixStr: string, depth: number, isLast: boolean, isRoot: boolean) {
        const issue = issueMap.get(inum);
        if (!issue) return;

        let connector: string;
        if (isRoot) {
            connector = '';
        } else if (isLast) {
            connector = '└── ';
        } else {
            connector = '├── ';
        }

        rows.push({ issue, prefix: prefixStr + connector, depth });

        const children = (childrenOf.get(inum) ?? []).sort((a, b) => a - b);
        for (let i = 0; i < children.length; i++) {
            const childIsLast = i === children.length - 1;
            let nextPrefix: string;
            if (isRoot) {
                nextPrefix = '';
            } else if (isLast) {
                nextPrefix = prefixStr + '    ';
            } else {
                nextPrefix = prefixStr + '│   ';
            }
            walk(children[i], nextPrefix, depth + 1, childIsLast, false);
        }
    }

    for (const rootInum of roots) {
        walk(rootInum, '', 0, false, true);
    }

    // Add isolated issues
    for (const issue of isolated) {
        rows.push({ issue, prefix: '', depth: 0 });
    }

    return rows;
}

// ── Component ──

interface BlockingMapProps {
    navigate: (view: View) => void;
}

function BlockingMapComponent({ navigate }: BlockingMapProps) {
    const flatRows = useMemo(() => buildFlatRows(MOCK_ISSUES, MOCK_DEPS), []);
    const [cursor, setCursor] = useState(0);

    // Separate graph rows from isolated for section labeling
    const graphInums = new Set<number>();
    for (const dep of MOCK_DEPS) {
        graphInums.add(dep.blocker_inum);
        graphInums.add(dep.blocked_inum);
    }
    const graphRowCount = flatRows.filter(r => graphInums.has(r.issue.inum)).length;
    const hasIsolated = flatRows.length > graphRowCount;

    useInput((input, key) => {
        if (input === 'j' || key.downArrow) {
            setCursor(prev => Math.min(prev + 1, flatRows.length - 1));
            return;
        }
        if (input === 'k' || key.upArrow) {
            setCursor(prev => Math.max(prev - 1, 0));
            return;
        }
        if (key.return) {
            const row = flatRows[cursor];
            if (row) {
                navigate({ type: 'Detail', inum: row.issue.inum });
            }
            return;
        }
    });

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold>Dependency Graph</Text>
            </Box>

            {flatRows.map((row, idx) => {
                const isSelected = idx === cursor;
                const isIsolated = !graphInums.has(row.issue.inum);

                // Insert section header before isolated issues
                const showIsolatedHeader = isIsolated && (idx === 0 || graphInums.has(flatRows[idx - 1].issue.inum));

                return (
                    <React.Fragment key={`${row.issue.inum}-${idx}`}>
                        {showIsolatedHeader && (
                            <Box marginTop={1}>
                                <Text dimColor>No dependencies:</Text>
                            </Box>
                        )}
                        <Box>
                            <Text>{isSelected ? '▸ ' : '  '}</Text>
                            <Text dimColor>{row.prefix}</Text>
                            <Text bold color={isSelected ? 'white' : undefined}>I-{row.issue.inum}</Text>
                            <Text> {row.issue.title} </Text>
                            <Text color={statusToColor(row.issue.status)}>[{row.issue.status}]</Text>
                        </Box>
                    </React.Fragment>
                );
            })}

            {flatRows.length === 0 && (
                <Box>
                    <Text dimColor>No issues or dependencies to display.</Text>
                </Box>
            )}

        </Box>
    );
}

export { BlockingMapComponent as BlockingMap };
