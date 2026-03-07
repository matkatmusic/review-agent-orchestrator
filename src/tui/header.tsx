import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { type View, ViewType, ViewTypeStringsMap } from './views.js';

export const HEADER_LINES = 3;

export interface HeaderProps {
    currentView: View;
    columns: number;
    activeAgents?: number;
    maxAgents?: number;
    unreadCount?: number;
    threadInfo?: { inThread: boolean };
}

const assertNever = (x: never): never => {
    throw new Error(`Unhandled view: ${JSON.stringify(x)}`);
};

function getViewLabel(view: View, threadInfo?: { inThread: boolean }): string {
    if (view.type === ViewType.Detail) {
        if (threadInfo?.inThread) return `I-${view.inum}`;
        return `I-${view.inum} Detail`;
    }
    return ViewTypeStringsMap.get(view.type) ?? String(view.type);
}

function getSubtitle(view: View, threadInfo?: { inThread: boolean }): string {
    switch (view.type) {
        case ViewType.Home:
            return 'All issues and orchestration state';
        case ViewType.Detail:
            // if (threadInfo?.inThread) return `Thread on I-${view.inum}`;
            if (threadInfo?.inThread) return '(add a response)';
            return '';
        case ViewType.NewIssue:
            return 'Create a new issue';
        case ViewType.AgentStatus:
            return 'Active agent sessions and pane status';
        case ViewType.BlockingMap:
            return 'Dependency and blocking relationships';
        case ViewType.GroupView:
            return 'Issues grouped by container';
        case ViewType.IssuePicker:
            return view.mode === 'blockedBy' ? 'Select blocking issues' : 'Select blocked issues';
        default:
            return assertNever(view);
    }
}

function centeredRule(label: string, width: number): string {
    const padded = ` ${label} `;
    const dashCount = Math.max(0, width - padded.length);
    const left = Math.floor(dashCount / 2);
    const right = dashCount - left;
    return '\u2500'.repeat(left) + padded + '\u2500'.repeat(right);
}

const HeaderComponent: React.FC<HeaderProps> = ({
    currentView,
    columns,
    activeAgents,
    maxAgents,
    unreadCount,
    threadInfo,
}) => {
    const title = `Review Agent Orchestrator - ${getViewLabel(currentView, threadInfo)}`;
    const line1 = centeredRule(title, columns);

    const statusParts: string[] = [];
    if (activeAgents !== undefined) {
        const agentLabel = maxAgents !== undefined ? `Agents: ${activeAgents}/${maxAgents}` : `Agents: ${activeAgents}`;
        statusParts.push(agentLabel);
    }
    if (unreadCount !== undefined) statusParts.push(`Unread: ${unreadCount}`);
    const line2 = statusParts.length > 0 ? statusParts.join('  |  ') : ' ';

    const line3 = getSubtitle(currentView, threadInfo);

    return (
        <Box flexDirection="column" height={HEADER_LINES}>
            <Text bold wrap="truncate">{line1}</Text>
            <Text wrap="truncate">{line2}</Text>
            <Text dimColor wrap="truncate">{line3}</Text>
        </Box>
    );
};

export const Header = memo(HeaderComponent);
