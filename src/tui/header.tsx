import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { type View, ViewType, ViewTypeStringsMap } from './views.js';

export const HEADER_LINES = 3;
export const HEADER_SINGLE_ROW_LINES = 1;

export interface HeaderProps {
    currentView: View;
    columns: number;
    activeAgents?: number;
    maxAgents?: number;
    unreadCount?: number;
    threadInfo?: { inThread: boolean };
    subtitleOverride?: string;
    singleRow?: boolean;
}

const assertNever = (x: never): never => {
    throw new Error(`Unhandled view: ${JSON.stringify(x)}`);
};

function getViewLabel(view: View, threadInfo?: { inThread: boolean }): string {
    if (view.type === ViewType.Detail) {
        if (threadInfo?.inThread) return `I-${view.inum}`;
        return `I-${view.inum} Detail`;
    }
    if (view.type === ViewType.ConfirmModal) {
        return ViewTypeStringsMap.get(view.originViewType) ?? String(view.originViewType);
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
        case ViewType.Trash:
            return 'Trashed issues pending deletion';
        case ViewType.ConfirmModal:
            return '';
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

const HeaderComponent: React.FC<HeaderProps> = (headerProps: HeaderProps) => {
    const title = `Review Agent Orchestrator - ${getViewLabel(headerProps.currentView, headerProps.threadInfo)}`;
    const line1 = centeredRule(title, headerProps.columns);

    if (headerProps.singleRow) {
        return (
            <Box flexDirection="column" height={HEADER_SINGLE_ROW_LINES}>
                <Text bold wrap="truncate">{line1}</Text>
            </Box>
        );
    }

    const statusParts: string[] = [];
    if (headerProps.activeAgents !== undefined) {
        const agentLabel = headerProps.maxAgents !== undefined ? `Agents: ${headerProps.activeAgents}/${headerProps.maxAgents}` : `Agents: ${headerProps.activeAgents}`;
        statusParts.push(agentLabel);
    }
    if (headerProps.unreadCount !== undefined) statusParts.push(`Unread: ${headerProps.unreadCount}`);
    const line2 = statusParts.length > 0 ? statusParts.join('  |  ') : ' ';

    const line3 = headerProps.subtitleOverride ?? getSubtitle(headerProps.currentView, headerProps.threadInfo);

    return (
        <Box flexDirection="column" height={HEADER_LINES}>
            <Text bold wrap="truncate">{line1}</Text>
            <Text wrap="truncate">{line2}</Text>
            <Text dimColor wrap="truncate">{line3}</Text>
        </Box>
    );
};

export const Header = memo(HeaderComponent);
