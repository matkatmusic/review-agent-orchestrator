import React, { useState, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { View } from './views.js';

export interface AgentStatusEntry {
    inum: number;
    title: string;
    paneId: string;
    alive: boolean;
    lastActivity: string;
}

export const MOCK_AGENTS: AgentStatusEntry[] = [
    { inum: 1, title: 'Fix login validation', paneId: '%42', alive: true, lastActivity: '2026-03-02T14:30:00Z' },
    { inum: 3, title: 'Add dark mode support', paneId: '%43', alive: true, lastActivity: '2026-03-02T14:28:00Z' },
    { inum: 5, title: 'Refactor auth module', paneId: '%44', alive: false, lastActivity: '2026-03-02T13:15:00Z' },
];

const CURSOR = '\u25B8';    // ▸
const ALIVE = '\u25CF';     // ● (filled circle)
const DEAD = '\u25CB';      // ○ (empty circle)

interface AgentStatusProps {
    agents?: AgentStatusEntry[];
    onFocusPane?: (paneId: string) => void;
    onNavigate?: (view: View) => void;
    onBack?: () => void;
    onQuit?: () => void;
}

const AgentStatusComponent: React.FC<AgentStatusProps> = ({
    agents,
    onFocusPane,
    onNavigate,
    onBack,
    onQuit,
}) => {
    const list = agents ?? MOCK_AGENTS;
    const [cursor, setCursor] = useState(0);

    useInput((input, key) => {
        if (key.downArrow || input === 'j') {
            setCursor(prev => Math.min(prev + 1, list.length - 1));
            return;
        }
        if (key.upArrow || input === 'k') {
            setCursor(prev => Math.max(prev - 1, 0));
            return;
        }
        if (key.return && list.length > 0) {
            onFocusPane?.(list[cursor].paneId);
            return;
        }
    });

    if (list.length === 0) {
        return (
            <Box flexDirection="column">
                <Box marginTop={1} justifyContent="center">
                    <Text dimColor>No active agents</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            {/* Column headers */}
            <Box>
                <Text bold>
                    {'  '}
                    {'Inum'.padEnd(8)}
                    {'Title'.padEnd(30)}
                    {'Pane'.padEnd(8)}
                    {'Status'.padEnd(8)}
                    {'Last Activity'}
                </Text>
            </Box>

            {/* Agent rows */}
            {list.map((agent, idx) => {
                const selected = idx === cursor;
                const marker = selected ? CURSOR : ' ';
                const statusIcon = agent.alive ? ALIVE : DEAD;
                const time = agent.lastActivity.slice(11, 16);

                return (
                    <Box key={agent.inum}>
                        <Text color={selected ? 'cyan' : undefined}>
                            {marker}{' '}
                        </Text>
                        <Text color={selected ? 'cyan' : undefined}>
                            {`I-${agent.inum}`.padEnd(8)}
                        </Text>
                        <Text color={selected ? 'cyan' : undefined}>
                            {agent.title.length > 28
                                ? agent.title.slice(0, 27) + '\u2026'
                                : agent.title.padEnd(30)}
                        </Text>
                        <Text color={selected ? 'cyan' : undefined}>
                            {agent.paneId.padEnd(8)}
                        </Text>
                        <Text color={agent.alive ? 'green' : 'red'}>
                            {(statusIcon + ' ').padEnd(8)}
                        </Text>
                        <Text color={selected ? 'cyan' : undefined}>
                            {time}
                        </Text>
                    </Box>
                );
            })}

        </Box>
    );
};

export const AgentStatus = memo(AgentStatusComponent);
