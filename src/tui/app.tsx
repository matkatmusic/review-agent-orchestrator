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
    threadInfo: { inThread: boolean };
    savedSelectedMessage: Map<number, number>;

    constructor(props: AppProps) {
        super(props);
        this.viewStack = [props.initialView ?? { type: ViewType.Home }];
        this.groupMode = GROUP_MODE_INITIAL;
        this.threadInfo = { inThread: false };
        this.savedSelectedMessage = new Map();
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
        this.viewStack = pushViewOntoStack(this.viewStack, view);
        this.forceUpdate();
    }

    replaceCurrentView(view: View) {
        clearScreen();
        this.viewStack[this.viewStack.length - 1] = view;
        this.viewStack = [...this.viewStack];
        this.forceUpdate();
    }

    goBackToPreviousView() {
        if (this.viewStack.length > 1) {
            clearScreen();
            this.viewStack = popViewFromStack(this.viewStack);
            this.forceUpdate();
        }
    }

    goHome() {
        clearScreen();
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
                            userLastViewedAt={mockData.issue.user_last_viewed_at}
                            initialSelectedMessage={this.savedSelectedMessage.get(inum)}
                            onBack={(sel) => this.saveSelectedAndGoBack(inum, sel)}
                            onHome={(sel) => this.saveSelectedAndGoHome(inum, sel)}
                            onSend={(msg) => { /* TODO: wire to backend */ }}
                            onNavigateIssue={(inumTo) => this.replaceCurrentView({ type: ViewType.Detail, inum: inumTo })}
                            onQuit={() => this.props.onExit?.()}
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
        }

        return (
            <Box flexDirection="column">
                <Header
                    currentView={this.currentView}
                    columns={this.columns}
                    activeAgents={MOCK_ISSUES.filter(i => i.status === IssueStatus.Active).length}
                    unreadCount={MOCK_UNREAD_INUMS.size}
                    threadInfo={this.threadInfo}
                />
                {content}
                <Footer viewType={this.currentView.type} inThread={this.threadInfo.inThread} />
            </Box>
        );
    }
}

export { App };
