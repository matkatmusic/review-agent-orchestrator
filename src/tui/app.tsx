import React from 'react';
import { Box, Text } from 'ink';
import { type View, ViewType } from './views.js';
import { Header, HEADER_LINES } from './header.js';
import { Footer } from './footer.js';
import { NewIssue } from './newissue.js';
import type { NewIssueData } from './newissue.js';
import { Dashboard } from './dashboard.js';
import { MOCK_ISSUES, MOCK_UNREAD_INUMS, MOCK_MAX_AGENTS, MOCK_DETAIL_DATA, MOCK_CONTAINERS } from './mock-data.js';
import { DetailView } from './detail.js';
import { AgentStatus } from './agent-status.js';
import { BlockingMap } from './blocking-map.js';
import { GroupView, GROUP_MODE_INITIAL } from './group-view.js';
import type { GroupMode } from './group-view.js';
import { IssueStatus } from '../types.js';

// [Phase A] Commented out — views now handle all their own keys via handleGlobalKey.
// No App-level useInput needed. See keypress_handling.txt Step A.2.
//
// import type { ViewType } from './views.js';
//
// const VIEW_OWNED_KEYS: Record<ViewType, ReadonlySet<string>> = {
//     Dashboard:   new Set(['n', 'a', 'd', 'r', 'j', 'k', 'return', 'tab']),
//     Detail:      new Set(['escape', 'return', 'd', 'r', 'b', 'w', 's']),
//     NewIssue:    new Set(['return', 'tab', 'escape', 'n', 'a', 'b', 'd', 'g', 'j', 'k', 'p', 'q', 'r', 's', 'w']),
//     AgentStatus: new Set(['j', 'k', 'return']),
//     BlockingMap: new Set(['j', 'k', 'b', 'return']),
//     GroupView:   new Set(['j', 'k', 'n', 'p', 'g', 'return', 'escape']),
// };

function pushViewOntoStack(viewStack: View[], view: View): View[] {
    //creates a new array by unpacking 'prev' to the front of the new array, and appending 'view' to the end.
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

interface AppProps {
    initialView?: View;
    onExit?: () => void;
    columns?: number;
    rows?: number;
}

class App extends React.Component<AppProps> {
    viewStack: View[];
    groupMode: GroupMode;

    constructor(props: AppProps) {
        super(props);
        this.viewStack = [props.initialView ?? { type: ViewType.Detail, inum: 1 }];
        this.groupMode = GROUP_MODE_INITIAL;
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

    //navigate to a new view by pushing it onto the view stack
    navigateToView(view: View) {
        this.viewStack = pushViewOntoStack(this.viewStack, view);
        this.forceUpdate();
    }

    //go back to the previous view by popping the top of the view stack
    goBackToPreviousView() {
        if (this.viewStack.length > 1) {
            this.viewStack = popViewFromStack(this.viewStack);
            this.forceUpdate();
        }
    }

    setGroupMode(mode: GroupMode) {
        this.groupMode = mode;
        this.forceUpdate();
    }

    render() {
        let content: React.ReactNode;
        switch (this.currentView.type) {
            case ViewType.Dashboard:
                content = (
                    <Dashboard
                        issues={MOCK_ISSUES}
                        unreadInums={MOCK_UNREAD_INUMS}
                        maxAgents={MOCK_MAX_AGENTS}
                        onSelect={(inum) => this.navigateToView({ type: ViewType.Detail, inum })}
                        onNewIssue={() => this.navigateToView({ type: ViewType.NewIssue })}
                        onActivate={() => {}}
                        onDefer={() => {}}
                        onResolve={() => {}}
                        onQuit={() => this.props.onExit?.()}
                    />
                );
                break;
            case ViewType.Detail: {
                const mockData = MOCK_DETAIL_DATA[this.currentView.inum];
                if (mockData) {
                    content = (
                        <DetailView
                            inum={this.currentView.inum}
                            issue={mockData.issue}
                            responses={mockData.responses}
                            blockedBy={mockData.blockedBy}
                            blocks={mockData.blocks}
                            group={mockData.group}
                            columns={this.columns}
                            rows={this.rows}
                            containers={MOCK_CONTAINERS}
                            onBack={() => this.goBackToPreviousView()}
                            onQuit={() => this.props.onExit?.()}
                        />
                    );
                } else {
                    content = <Text color="red">Issue I-{this.currentView.inum} not found</Text>;
                }
                break;
            }
            // case 'NewIssue':
            //     content = (
            //         <NewIssue
            //             onCreated={(_data: NewIssueData) => {
            //                 // Phase 2 will wire this to DB — for now just navigate back
            //                 this.goBackToPreviousView();
            //             }}
            //             onCancel={() => this.goBackToPreviousView()}
            //         />
            //     );
            //     break;
            // case 'AgentStatus':
            //     content = <AgentStatus />;
            //     break;
            // case 'BlockingMap':
            //     content = <BlockingMap onNavigate={(view) => this.navigateToView(view)} />;
            //     break;
            // case 'GroupView':
            //     content = (
            //         <GroupView
            //             onBack={() => this.goBackToPreviousView()}
            //             onSelectIssue={(inum) => this.navigateToView({ type: 'Detail', inum })}
            //             groupMode={this.groupMode}
            //             onGroupModeChange={(mode) => this.setGroupMode(mode)}
            //         />
            //     );
            //     break;
        }

        return (
            <Box flexDirection="column">
                <Header
                    currentView={this.currentView}
                    columns={this.columns}
                    activeAgents={MOCK_ISSUES.filter(i => i.status === IssueStatus.Active).length}
                    unreadCount={MOCK_UNREAD_INUMS.size}
                />
                {content}
                <Footer viewType={this.currentView.type} />
            </Box>
        );
    }
}

export { App };
