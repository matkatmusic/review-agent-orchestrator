import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { type View, ViewType } from './views.js';
import type { Issue, Dependency } from '../types.js';
import { statusToColor } from './status-color.js';
import { MOCK_ISSUES, MOCK_DEPS } from './mock-data.js';

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
    onNavigate: (view: View) => void;
    onBack?: () => void;
    onQuit?: () => void;
}

function BlockingMapComponent({ onNavigate, onBack, onQuit }: BlockingMapProps) {
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
                onNavigate({ type: ViewType.Detail, inum: row.issue.inum });
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
