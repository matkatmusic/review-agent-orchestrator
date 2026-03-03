import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import type { View } from './views.js';
import { Header, HEADER_LINES } from './header.js';
import { Footer } from './footer.js';
import { NewIssue } from './create.js';
import type { NewIssueData } from './create.js';
import { Dashboard } from './dashboard.js';
import { MOCK_ISSUES, MOCK_UNREAD_INUMS, MOCK_MAX_AGENTS } from './mock-data.js';
import { DetailView, MOCK_DETAIL_DATA } from './detail.js';
import { AgentStatus } from './agent-status.js';
import { BlockingMap } from './blocking-map.js';
import { GroupView } from './group-view.js';

interface AppProps {
    initialView?: View;
    onExit?: () => void;
}

function App({ initialView, onExit }: AppProps) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const columns = (stdout as import('node:tty').WriteStream)?.columns ?? 80;
    const rows = (stdout as import('node:tty').WriteStream)?.rows ?? 24;
    const [viewStack, setViewStack] = useState<View[]>([initialView ?? { type: 'Dashboard' }]);
    const currentView = viewStack[viewStack.length - 1];

    const navigate = useCallback((view: View) => {
        setViewStack(prev => [...prev, view]);
    }, []);

    const goBack = useCallback(() => {
        setViewStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }, []);

    // Disable global shortcuts when a view with its own input handling is active
    const viewOwnsInput = currentView.type === 'NewIssue';

    useInput((input, key) => {
        // Views with text input handle their own character keys.
        // Only Esc (back) is handled at the App level for those views.
        if (currentView.type === 'Detail') {
            if (key.escape) {
                goBack();
            }
            return;
        }

        if (input === 'q') {
            onExit?.();
            exit();
            return;
        }

        if (key.escape) {
            goBack();
            return;
        }

        // When Dashboard is active, it handles its own shortcuts (n, Enter,
        // a, d, r, j, k, Tab, arrows). Only global nav shortcuts that
        // Dashboard does NOT handle are forwarded here.
        if (currentView.type === 'Dashboard') {
            switch (input) {
                case 's':
                    navigate({ type: 'AgentStatus' });
                    break;
                case 'b':
                    navigate({ type: 'BlockingMap' });
                    break;
                case 'g':
                    navigate({ type: 'GroupView' });
                    break;
            }
            return;
        }

        // Placeholder shortcuts for other views (refined as views are built)
        switch (input) {
            case 'n':
                navigate({ type: 'NewIssue' });
                break;
            case 's':
                navigate({ type: 'AgentStatus' });
                break;
            case 'b':
                navigate({ type: 'BlockingMap' });
                break;
            case 'g':
                navigate({ type: 'GroupView' });
                break;
        }
    }, { isActive: !viewOwnsInput });

    let content: React.ReactNode;
    switch (currentView.type) {
        case 'Dashboard':
            content = (
                <Dashboard
                    issues={MOCK_ISSUES}
                    unreadInums={MOCK_UNREAD_INUMS}
                    maxAgents={MOCK_MAX_AGENTS}
                    onSelect={(inum) => navigate({ type: 'Detail', inum })}
                    onNewIssue={() => navigate({ type: 'NewIssue' })}
                    onActivate={() => {}}
                    onDefer={() => {}}
                    onResolve={() => {}}
                />
            );
            break;
        case 'Detail': {
            const mockData = MOCK_DETAIL_DATA[currentView.inum];
            if (mockData) {
                content = (
                    <DetailView
                        inum={currentView.inum}
                        issue={mockData.issue}
                        responses={mockData.responses}
                        blockedBy={mockData.blockedBy}
                        blocks={mockData.blocks}
                        group={mockData.group}
                        columns={columns}
                        rows={rows}
                        onBack={goBack}
                    />
                );
            } else {
                content = <Text color="red">Issue I-{currentView.inum} not found</Text>;
            }
            break;
        }
        case 'NewIssue':
            content = (
                <NewIssue
                    onCreated={(_data: NewIssueData) => {
                        // Phase 2 will wire this to DB — for now just navigate back
                        goBack();
                    }}
                    onCancel={goBack}
                />
            );
            break;
        case 'AgentStatus':
            content = <AgentStatus />;
            break;
        case 'BlockingMap':
            content = <BlockingMap navigate={navigate} />;
            break;
        case 'GroupView':
            content = <GroupView onBack={goBack} onNavigate={(inum) => navigate({ type: 'Detail', inum })} />;
            break;
    }

    return (
        <Box flexDirection="column">
            <Header currentView={currentView} columns={columns} />
            {content}
            <Footer viewType={currentView.type} />
        </Box>
    );
}

export { App };
