/**
 * TUI entry point.
 *
 * --resetMockData flag must be processed BEFORE mock-data.ts is imported,
 * so we use dynamic imports for everything that transitively loads mock data.
 *
 * Phase 1: Renders AppShell with a hardcoded ViewType.Home view.
 * Phase 2 replaces the hardcoded view with NavigationContext's useNavigation().
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetMockData } from './mock-store.js';
import { IssueStatus } from '../types.js';

export function processResetFlag(): void {
    if (process.argv.includes('--resetMockData')) {
        resetMockData();
        console.log('Mock data reset to defaults.');
    }
}

// Execute flag processing before any dynamic imports
processResetFlag();

// Dynamic imports — these load mock-data.ts which reads from the (now reset) JSON
const [
    { default: React, useState, useEffect, useCallback },
    { render, useStdout, useInput, useApp, Text },
    { AppShell },
    { ViewType },
    { HomeView },
    { TrashView },
    { useMockStore },
    { DetailView },
    { handleGlobalKey },
] = await Promise.all([
    import('react'),
    import('ink'),
    import('./app-shell.js'),
    import('./views.js'),
    import('./home-view.js'),
    import('./trash-view.js'),
    import('./use-mock-store.js'),
    import('./detail.js'),
    import('./global-keys.js'),
]);

import type { View } from './views.js';
import type { WriteStream } from 'node:tty';

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export function AppWrapper() {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const stream = stdout as WriteStream | undefined;

    const [dims, setDims] = useState({
        columns: stream?.columns ?? DEFAULT_COLUMNS,
        rows: stream?.rows ?? DEFAULT_ROWS,
    });

    const mockStoreWithUpdater = useMockStore();

    // View stack navigation
    const [viewStack, setViewStack] = useState<View[]>([{ type: ViewType.Home }]);
    const [savedSelectedMessage] = useState(() => new Map<number, number>());
    const [threadInfo, setThreadInfo] = useState<{ inThread: boolean }>({ inThread: false });

    const currentView = viewStack[viewStack.length - 1];

    const navigateToView = useCallback((view: View) => {
        setViewStack(prev => [...prev, view]);
    }, []);

    const goBack = useCallback(() => {
        setViewStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
    }, []);

    const goHome = useCallback(() => {
        setViewStack([{ type: ViewType.Home }]);
    }, []);

    const replaceCurrentView = useCallback((view: View) => {
        setViewStack(prev => [...prev.slice(0, -1), view]);
    }, []);

    const saveSelectedAndGoBack = useCallback((inum: number, sel: number) => {
        savedSelectedMessage.set(inum, sel);
        setViewStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
    }, [savedSelectedMessage]);

    const saveSelectedAndGoHome = useCallback((inum: number, sel: number) => {
        savedSelectedMessage.set(inum, sel);
        setViewStack([{ type: ViewType.Home }]);
    }, [savedSelectedMessage]);

    // Global key handling — suppressed for Detail and Trash which have their own useInput
    useInput((input, key) => {
        if (currentView.type === ViewType.Detail || currentView.type === ViewType.Trash) return;
        handleGlobalKey(input, key, currentView.type, {
            onBack: goBack,
            onQuit: () => exit(),
            onNavigate: navigateToView,
        });
    });

    const onResize = useCallback(() => {
        if (stream) {
            setDims({ columns: stream.columns, rows: stream.rows });
        }
    }, [stream]);

    useEffect(() => {
        if (stream) {
            stream.on('resize', onResize);
            return () => { stream.off('resize', onResize); };
        }
    }, [stream, onResize]);

    const renderContent = (
        setFooterOptions: any,
        setFooterShortcuts: any,
        terminal: any,
        layout: any,
        setHeaderSubtitleOverride: any,
    ) => {
        if (currentView.type === ViewType.Home) {
            return (
                <HomeView
                    issues={mockStoreWithUpdater.mockDataStore.issues.filter(i => i.status !== IssueStatus.Trashed)}
                    unreadInums={mockStoreWithUpdater.mockDataStore.unreadInums}
                    maxAgents={mockStoreWithUpdater.mockDataStore.maxAgents}
                    terminalProps={terminal}
                    layoutProps={layout}
                    setFooterShortcuts={setFooterShortcuts}
                    setHeaderSubtitleOverride={setHeaderSubtitleOverride}
                    onStatusHotkeyPressed={mockStoreWithUpdater.updateIssueStatusCallback}
                    onTrashIssue={mockStoreWithUpdater.trashIssueCallback}
                    onSelect={(inum) => navigateToView({ type: ViewType.Detail, inum })}
                />
            );
        }

        if (currentView.type === ViewType.Detail) {
            const inum = currentView.inum;
            const mockData = mockStoreWithUpdater.mockDataStore.detailData[inum];
            if (!mockData) {
                return <Text color="red">Issue I-{inum} not found</Text>;
            }
            const allIssues = mockStoreWithUpdater.mockDataStore.issues;
            const blocks = allIssues.filter(i => i.blocked_by.includes(inum)).map(i => i.inum);
            return (
                <DetailView
                    inum={inum}
                    issue={mockData.issue}
                    rootResponse={mockData.rootResponse}
                    blockedBy={mockData.issue.blocked_by}
                    blocks={blocks}
                    group={''}
                    columns={dims.columns}
                    rows={dims.rows}
                    containers={[]}
                    allIssues={allIssues}
                    unreadInums={mockStoreWithUpdater.mockDataStore.unreadInums}
                    userLastViewedAt={mockData.issue.user_last_viewed_at}
                    initialSelectedMessage={savedSelectedMessage.get(inum)}
                    onBack={(sel) => saveSelectedAndGoBack(inum, sel)}
                    onHome={(sel) => saveSelectedAndGoHome(inum, sel)}
                    onSend={(message) => mockStoreWithUpdater.appendResponseCallback(inum, message)}
                    onNavigateIssue={(inumTo) => replaceCurrentView({ type: ViewType.Detail, inum: inumTo })}
                    onOpenPicker={(mode) => navigateToView({ type: ViewType.IssuePicker, mode, inum })}
                    onQuit={() => exit()}
                    onFooterFocusChange={() => {}}
                    onThreadStateChange={(info) => setThreadInfo(info)}
                />
            );
        }

        if (currentView.type === ViewType.Trash) {
            const trashedIssues = mockStoreWithUpdater.mockDataStore.issues.filter(
                i => i.status === IssueStatus.Trashed
            );
            return (
                <TrashView
                    issues={trashedIssues}
                    terminalProps={terminal}
                    layoutProps={layout}
                    setFooterShortcuts={setFooterShortcuts}
                    setHeaderSubtitleOverride={setHeaderSubtitleOverride}
                    onRestoreIssue={mockStoreWithUpdater.restoreIssueCallback}
                    onPermanentDelete={mockStoreWithUpdater.permanentDeleteCallback}
                    onEmptyTrash={mockStoreWithUpdater.emptyTrashCallback}
                />
            );
        }

        if (currentView.type === ViewType.NewIssue) {
            return <Text>New Issue (placeholder) — press Esc to go back</Text>;
        }

        if (currentView.type === ViewType.AgentStatus) {
            return <Text>Agent Status (placeholder) — press Esc to go back</Text>;
        }

        if (currentView.type === ViewType.BlockingMap) {
            return <Text>Blocking Map (placeholder) — press Esc to go back</Text>;
        }

        if (currentView.type === ViewType.GroupView) {
            return <Text>Group View (placeholder) — press Esc to go back</Text>;
        }

        if (currentView.type === ViewType.IssuePicker) {
            return <Text>Issue Picker (placeholder) — press Esc to go back</Text>;
        }

        return null;
    };

    return (
        <AppShell
            columns={dims.columns}
            rows={dims.rows}
            currentView={currentView}
            maxAgents={mockStoreWithUpdater.mockDataStore.maxAgents}
            unreadCount={mockStoreWithUpdater.mockDataStore.unreadInums.size}
            threadInfo={threadInfo}
        >
            {renderContent}
        </AppShell>
    );
}

function isDirectExecution(importMetaUrl: string, argvEntry?: string): boolean {
    if (!argvEntry) return false;
    return fileURLToPath(importMetaUrl) === resolve(argvEntry);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
    const instance = render(<AppWrapper />);
    await instance.waitUntilExit();
}
