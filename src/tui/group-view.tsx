import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue } from '../types.js';
import {IssueStatus, IssueStatusStringsMap} from "../types.js"
import type { View } from './views.js';
import { statusToColor } from './status-color.js';
import { MOCK_CONTAINERS, MOCK_CONTAINER_ISSUES } from './mock-data.js';

// ---- Progress bar ----

function progressBar(resolved: number, total: number, width: number = 10): string {
    if (total === 0) return '\u2591'.repeat(width);
    const filled = Math.min(Math.round((resolved / total) * width), width);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ---- Types ----

export type GroupMode =
    | { mode: 'list'; cursor: number }
    | { mode: 'issues'; containerId: number; cursor: number; listCursor: number };

export const GROUP_MODE_INITIAL: GroupMode = { mode: 'list', cursor: 0 };

export interface GroupViewProps {
    onBack?: () => void;
    onSelectIssue?: (inum: number) => void;
    onNavigate?: (view: View) => void;
    onQuit?: () => void;
    /** Externally managed state — preserved across navigation */
    groupMode?: GroupMode;
    onGroupModeChange?: (mode: GroupMode) => void;
}

// ---- Component ----

export function GroupView({ onBack, onSelectIssue, onNavigate, onQuit, groupMode, onGroupModeChange }: GroupViewProps) {
    const [internalState, setInternalState] = useState<GroupMode>(GROUP_MODE_INITIAL);
    const state = groupMode ?? internalState;
    const setState = useCallback((updater: GroupMode | ((prev: GroupMode) => GroupMode)) => {
        if (onGroupModeChange) {
            // External state: apply updater function against current state
            if (typeof updater === 'function') {
                onGroupModeChange(updater(groupMode ?? GROUP_MODE_INITIAL));
            } else {
                onGroupModeChange(updater);
            }
        } else {
            setInternalState(updater);
        }
    }, [onGroupModeChange, groupMode]);

    const containers = MOCK_CONTAINERS;

    const containerData = useMemo(() => {
        return containers.map(c => {
            const issues = MOCK_CONTAINER_ISSUES[c.id] ?? [];
            const resolved = issues.filter(i => i.status === IssueStatus.Resolved).length;
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
                    onSelectIssue?.(currentIssues[state.cursor]!.inum);
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
                        const sColor = statusToColor(issue.status);
                        return (
                            <Box key={issue.inum}>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    {selected ? ' \u25B8 ' : '   '}
                                </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected}>
                                    I-{String(issue.inum).padStart(3)}
                                </Text>
                                <Text>  </Text>
                                <Text color={sColor}>{IssueStatusStringsMap.get(issue.status)?.padEnd(9)}</Text>
                                <Text>  </Text>
                                <Text color={selected ? 'cyan' : undefined} bold={selected} wrap="truncate">
                                    {issue.title.length > 40 ? issue.title.slice(0, 37) + '...' : issue.title}
                                </Text>
                            </Box>
                        );
                    })
                )}
            </Box>

        </Box>
    );
}
