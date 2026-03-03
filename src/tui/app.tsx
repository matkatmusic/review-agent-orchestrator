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
import { GroupView, GROUP_MODE_INITIAL } from './group-view.js';
import type { GroupMode } from './group-view.js';

// Keys each view handles internally. The App-level handler will not
// process any key listed here for the active view, preventing conflicts.
import type { ViewType } from './views.js';

const VIEW_OWNED_KEYS: Record<ViewType, ReadonlySet<string>> = {
    Dashboard:   new Set(['n', 'a', 'd', 'r', 'j', 'k', 'return', 'tab']),
    Detail:      new Set(['return', 'd', 'r', 'b', 'w', 's']),
    NewIssue:    new Set(['return', 'tab', 'escape', 'n', 'a', 'b', 'd', 'g', 'j', 'k', 'p', 'q', 'r', 's', 'w']),
    AgentStatus: new Set(['j', 'k', 'return']),
    BlockingMap: new Set(['j', 'k', 'b', 'return']),
    GroupView:   new Set(['j', 'k', 'n', 'p', 'g', 'return', 'escape']),
};

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
    const [groupMode, setGroupMode] = useState<GroupMode>(GROUP_MODE_INITIAL);

    const navigate = useCallback((view: View) => {
        setViewStack(prev => [...prev, view]);
    }, []);

    const goBack = useCallback(() => {
        setViewStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }, []);

    useInput((input, key) => {
        const ownedKeys = VIEW_OWNED_KEYS[currentView.type];

        // Check owned keys FIRST — if the view handles this key, skip it here.
        // This prevents App from stealing keys that views need internally
        // (e.g. Esc in GroupView for issues→list, or 'n' in GroupView for next).
        if (key.escape && ownedKeys.has('escape')) return;
        if (key.return && ownedKeys.has('return')) return;
        if (key.tab && ownedKeys.has('tab')) return;
        if (input && ownedKeys.has(input)) return;

        // Global keys — only reached if the current view doesn't own them
        if (key.escape) {
            goBack();
            return;
        }

        if (input === 'q') {
            onExit?.();
            exit();
            return;
        }

        // Global navigation shortcuts — only reached if the view doesn't own the key
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
    });

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
            content = (
                <GroupView
                    onBack={goBack}
                    onNavigate={(inum) => navigate({ type: 'Detail', inum })}
                    groupMode={groupMode}
                    onGroupModeChange={setGroupMode}
                />
            );
            break;
    }

    return (
        <Box flexDirection="column">
            <Header
                currentView={currentView}
                columns={columns}
                activeAgents={MOCK_ISSUES.filter(i => i.status === 'Active').length}
                unreadCount={MOCK_UNREAD_INUMS.size}
            />
            {content}
            <Footer viewType={currentView.type} />
        </Box>
    );
}

export { App };
