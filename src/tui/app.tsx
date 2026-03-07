import React from 'react';
import { Box, Text } from 'ink';
import { type View, ViewType } from './views.js';
import { Header, HEADER_LINES } from './header.js';
import { Footer } from './footer.js';
import { NewIssue } from './newissue.js';
import type { NewIssueData } from './newissue.js';
import { HomeView } from './home-view.js';
import { MOCK_ISSUES, MOCK_UNREAD_INUMS, MOCK_MAX_AGENTS, MOCK_DETAIL_DATA, MOCK_CONTAINERS } from './mock-data.js';
import { DetailView } from './detail.js';
import { AgentStatus } from './agent-status.js';
import { BlockingMap } from './blocking-map.js';
import { GroupView, GROUP_MODE_INITIAL } from './group-view.js';
import type { GroupMode } from './group-view.js';
import { IssueStatus } from '../types.js';
import { IssueListPicker } from './issue-list-picker.js';

function pushViewOntoStack(viewStack: View[], view: View): View[] {
    let newStack: View[] = [];
    for (let i = 0; i < viewStack.length; i++) {
        newStack.push(viewStack[i]);
    }
    newStack.push(view);
    return newStack;
}

function popViewFromStack(viewStack: View[]) : View[] {
    let newStack: View[] = [];
    for (let i = 0; i < viewStack.length - 1; i++) {
        newStack.push(viewStack[i]);
    }
    return newStack;
}

function clearScreen(): void {
    process.stdout.write('\x1B[2J\x1B[H');
}

interface AppProps {
    initialView?: View;
    onExit?: () => void;
    columns?: number;
    rows?: number;
}

class App extends React.Component<AppProps> {
    viewStack: View[];
    groupMode: GroupMode;
    threadInfo: { inThread: boolean; threadResolved?: boolean; selectedHasReplies?: boolean };
    savedSelectedMessage: Map<number, number>;
    focusedFooterIndex: number | null;

    constructor(props: AppProps) {
        super(props);
        this.viewStack = [props.initialView ?? { type: ViewType.Home }];
        this.groupMode = GROUP_MODE_INITIAL;
        this.threadInfo = { inThread: false };
        this.savedSelectedMessage = new Map();
        this.focusedFooterIndex = null;
    }

    get currentView(): View {
        return this.viewStack[this.viewStack.length - 1];
    }

    get columns(): number {
        return this.props.columns ?? 80;
    }

    get rows(): number {
        return this.props.rows ?? 24;
    }

    navigateToView(view: View) {
        clearScreen();
        this.focusedFooterIndex = null;
        this.viewStack = pushViewOntoStack(this.viewStack, view);
        this.forceUpdate();
    }

    replaceCurrentView(view: View) {
        clearScreen();
        this.focusedFooterIndex = null;
        this.viewStack[this.viewStack.length - 1] = view;
        this.viewStack = [...this.viewStack];
        this.forceUpdate();
    }

    goBackToPreviousView() {
        if (this.viewStack.length > 1) {
            clearScreen();
            this.focusedFooterIndex = null;
            this.viewStack = popViewFromStack(this.viewStack);
            this.forceUpdate();
        }
    }

    goHome() {
        clearScreen();
        this.focusedFooterIndex = null;
        this.viewStack = [{ type: ViewType.Home }];
        this.forceUpdate();
    }

    saveSelectedAndGoBack(inum: number, selectedMessage: number) {
        this.savedSelectedMessage.set(inum, selectedMessage);
        this.goBackToPreviousView();
    }

    saveSelectedAndGoHome(inum: number, selectedMessage: number) {
        this.savedSelectedMessage.set(inum, selectedMessage);
        this.goHome();
    }

    setGroupMode(mode: GroupMode) {
        this.groupMode = mode;
        this.forceUpdate();
    }

    render() {
        let content: React.ReactNode;
        switch (this.currentView.type) {
            case ViewType.Home:
                content = (
                    <HomeView
                        issues={MOCK_ISSUES}
                        unreadInums={MOCK_UNREAD_INUMS}
                        maxAgents={MOCK_MAX_AGENTS}
                        onSelect={(inum) => this.navigateToView({ type: ViewType.Detail, inum })}
                        onNewIssue={() => this.navigateToView({ type: ViewType.NewIssue })}
                        onActivate={() => {}}
                        onDefer={() => {}}
                        onResolve={() => {}}
                        onNavigate={(view) => this.navigateToView(view)}
                        onBack={() => this.goBackToPreviousView()}
                        onQuit={() => this.props.onExit?.()}
                    />
                );
                break;
            case ViewType.Detail: {
                const mockData = MOCK_DETAIL_DATA[this.currentView.inum];
                if (mockData) {
                    const inum = this.currentView.inum;
                    content = (
                        <DetailView
                            inum={inum}
                            issue={mockData.issue}
                            rootResponse={mockData.rootResponse}
                            blockedBy={mockData.blockedBy}
                            blocks={mockData.blocks}
                            group={mockData.group}
                            columns={this.columns}
                            rows={this.rows}
                            containers={MOCK_CONTAINERS}
                            allIssues={MOCK_ISSUES}
                            unreadInums={MOCK_UNREAD_INUMS}
                            userLastViewedAt={mockData.issue.user_last_viewed_at}
                            initialSelectedMessage={this.savedSelectedMessage.get(inum)}
                            onBack={(sel) => this.saveSelectedAndGoBack(inum, sel)}
                            onHome={(sel) => this.saveSelectedAndGoHome(inum, sel)}
                            onSend={() => {}}
                            onNavigateIssue={(inumTo) => this.replaceCurrentView({ type: ViewType.Detail, inum: inumTo })}
                            onOpenPicker={(mode) => this.navigateToView({ type: ViewType.IssuePicker, mode, inum })}
                            onQuit={() => this.props.onExit?.()}
                            onFooterFocusChange={(index) => {
                                this.focusedFooterIndex = index;
                                this.forceUpdate();
                            }}
                            onThreadStateChange={(info) => {
                                this.threadInfo = info;
                                this.forceUpdate();
                            }}
                        />
                    );
                } else {
                    content = <Text color="red">Issue I-{this.currentView.inum} not found</Text>;
                }
                break;
            }
            case ViewType.IssuePicker: {
                const pickerView = this.currentView;
                const mockData = MOCK_DETAIL_DATA[pickerView.inum];
                if (mockData) {
                    const otherIssues = MOCK_ISSUES.filter(i => i.inum !== pickerView.inum);
                    const selectedSet = new Set(
                        pickerView.mode === 'blockedBy' ? mockData.blockedBy : mockData.blocks
                    );
                    content = (
                        <Box flexDirection="column" height={this.rows - HEADER_LINES}>
                            <IssueListPicker
                                title={pickerView.mode === 'blockedBy' ? 'Blocked by' : 'Blocks'}
                                issues={otherIssues}
                                selected={selectedSet}
                                unreadInums={MOCK_UNREAD_INUMS}
                                onToggle={(toggledInum) => {
                                    const arr = pickerView.mode === 'blockedBy'
                                        ? mockData.blockedBy
                                        : mockData.blocks;
                                    const idx = arr.indexOf(toggledInum);
                                    if (idx >= 0) {
                                        arr.splice(idx, 1);
                                    } else {
                                        arr.push(toggledInum);
                                    }
                                    this.forceUpdate();
                                }}
                                onClose={() => this.goBackToPreviousView()}
                                onViewIssue={(viewInum) => this.navigateToView({ type: ViewType.Detail, inum: viewInum })}
                            />
                        </Box>
                    );
                } else {
                    content = <Text color="red">Issue I-{pickerView.inum} not found</Text>;
                }
                break;
            }
        }

        return (
            <Box flexDirection="column" height={this.rows}>
                <Header
                    currentView={this.currentView}
                    columns={this.columns}
                    activeAgents={MOCK_ISSUES.filter(i => i.status === IssueStatus.Active).length}
                    unreadCount={MOCK_UNREAD_INUMS.size}
                    threadInfo={this.threadInfo}
                />
                {content}
                <Footer viewType={this.currentView.type} inThread={this.threadInfo.inThread} threadResolved={this.threadInfo.threadResolved} focusedIndex={this.focusedFooterIndex} columns={this.columns} />
            </Box>
        );
    }
}

export { App };
