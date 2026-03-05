import React from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import type { Issue } from '../types.js';
import { IssueStatus } from "../types.js"
import { IssueStatusStringsMap } from '../types.js';
import { type View, ViewType } from './views.js';
import { statusToColor } from './status-color.js';
import { handleGlobalKey } from './global-keys.js';

type StatusCounts = Record<IssueStatus, number>;

function computeCounts(issues: Issue[]): StatusCounts {
    //declares an instance of StatusCounts, with all counts initialized to 0
    const counts = {} as StatusCounts;
    //enums are not iterable in Typescript.
    //but a map (of <enum, string>) is iterable.
    // IssueStatusStringsMap is such a map.
    // this is how we can get each enum value and iterate over it.
    for (const key of IssueStatusStringsMap.keys()) {
        counts[key] = 0;
    }
    //iterates through the issues and increments the count for each status
    for (const issue of issues) {
        counts[issue.status]++;
    }
    return counts;
}

function getNextStatus(currentStatus: IssueStatus, direction: 1 | -1): IssueStatus {
    const count = IssueStatusStringsMap.size;
    let newIndex = currentStatus + direction;
    //newIndex could be negative, so add 'count' to it.
    newIndex += count;
    //now newIndex is always positive, so we can use modulo to wrap around.
    return newIndex % count;
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
    onNavigate?: (view: View) => void;
    onBack?: () => void;
    onQuit?: () => void;
}

// Functional bridge — registers useInput and forwards keypresses to the class component.
function DashboardInputBridge({ onKey }: { onKey: (input: string, key: Key) => void }) {
    useInput(onKey);
    return null;
}

export class Dashboard extends React.Component<DashboardProps> {
    useStatusFilter: boolean;
    statusFilter: IssueStatus;
    cursor: number;

    constructor(props: DashboardProps) {
        super(props);
        this.useStatusFilter = false;
        this.statusFilter = IssueStatus.Active;
        this.cursor = 0;
    }

    cycleTab(direction: 1 | -1) {
        const statusCount = IssueStatusStringsMap.size;
        if (!this.useStatusFilter) {
            // Currently showing all — enter filtered mode
            this.useStatusFilter = true;
            this.statusFilter = direction === 1 ? 0 : statusCount - 1;
        } else {
            // Check if cycling would wrap around — if so, go back to "All"
            let wouldWrap = (direction === 1 && this.statusFilter === statusCount - 1)
                         || (direction === -1 && this.statusFilter === 0);
            if (wouldWrap) {
                this.useStatusFilter = false;
            } else {
                this.statusFilter = getNextStatus(this.statusFilter, direction);
            }
        }
        this.cursor = 0;
        this.forceUpdate();
    }

    moveCursor(direction: 1 | -1, listLength: number) {
        if (direction === 1) {
            this.cursor = Math.min(this.cursor + 1, listLength - 1);
        } else {
            this.cursor = Math.max(this.cursor - 1, 0);
        }
        this.forceUpdate();
    }

    private selectedInum(): number | undefined {
        const clampedCursor = Math.min(this.cursor, Math.max(0, this.filteredLength - 1));
        return this.filteredIssues[clampedCursor]?.inum;
    }

    handleKey = (input: string, key: Key) => {
        if (key.downArrow || input === 'j') {
            this.moveCursor(1, this.filteredLength);
        } else if (key.upArrow || input === 'k') {
            this.moveCursor(-1, this.filteredLength);
        } else if (key.tab) {
            this.cycleTab(key.shift ? -1 : 1);
        } else if (key.return) {
            const inum = this.selectedInum();
            if (inum !== undefined) this.props.onSelect(inum);
        } else if (input === 'a') {
            const inum = this.selectedInum();
            if (inum !== undefined) this.props.onActivate(inum);
        } else if (input === 'd') {
            const inum = this.selectedInum();
            if (inum !== undefined) this.props.onDefer(inum);
        } else if (input === 'r') {
            const inum = this.selectedInum();
            if (inum !== undefined) this.props.onResolve(inum);
        } else if (input === 'n') {
            this.props.onNewIssue();
        } else {
            handleGlobalKey(input, key, ViewType.Home, {
                onBack: this.props.onBack,
                onQuit: this.props.onQuit,
                onNavigate: this.props.onNavigate,
            });
        }
    };

    // Stashed between render passes so handleKey can reference it.
    private filteredLength = 0;
    private filteredIssues: Issue[] = [];

    render() {
        const { issues, unreadInums, maxAgents, onSelect, onNewIssue } = this.props;

        const counts = computeCounts(issues);
        const activeCount = counts[IssueStatus.Active];
        const atCapacity = activeCount >= maxAgents;

        let filtered: Issue[];
        if (!this.useStatusFilter) {
            filtered = issues;
        } else {
            const sf = this.statusFilter;
            filtered = issues.filter(function(i: Issue) { return i.status === sf; });
        }

        this.filteredLength = filtered.length;
        this.filteredIssues = filtered;

        const clampedCursor = Math.min(this.cursor, Math.max(0, filtered.length - 1));

        return (
            <Box flexDirection="column">
                <DashboardInputBridge onKey={this.handleKey} />
                {/* Status tabs */}
                <Box gap={2} marginBottom={1}>
                    <Text key="All" bold={!this.useStatusFilter} inverse={!this.useStatusFilter}>
                        {` All (${issues.length}) `}
                    </Text>
                    {[...IssueStatusStringsMap.entries()].map(([status, label]) => {
                        const active = this.useStatusFilter && status === this.statusFilter;
                        return (
                            <Text key={status} bold={active} inverse={active}>
                                {` ${label} (${counts[status]}) `}
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
                            const statusLabel = IssueStatusStringsMap.get(issue.status) ?? '';
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
                                    <Text color={sColor}>{statusLabel.padEnd(10)}</Text>
                                </Box>
                            );
                        })
                    )}
                </Box>

            </Box>
        );
    }
}
