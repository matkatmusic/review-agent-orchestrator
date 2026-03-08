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
import { resetMockData, loadMockData } from './mock-store.js';

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
    { render, useStdout, useInput, useApp },
    { AppShell },
    { ViewType },
    { HomeView },
] = await Promise.all([
    import('react'),
    import('ink'),
    import('./app-shell.js'),
    import('./views.js'),
    import('./home-view.js'),
]);

import type { View } from './views.js';
import type { WriteStream } from 'node:tty';

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export function AppWrapper() {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const stream = stdout as WriteStream | undefined;

    // Phase 1: minimal input handler keeps Ink alive in raw mode.
    // Phase 2 replaces this with full navigation key handling.
    useInput((input, key) => {
        if (input === 'q') exit();
    });

    const [dims, setDims] = useState({
        columns: stream?.columns ?? DEFAULT_COLUMNS,
        rows: stream?.rows ?? DEFAULT_ROWS,
    });

    const [store] = useState(() => loadMockData());

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

    const currentView: View = { type: ViewType.Home };

    return (
        <AppShell
            columns={dims.columns}
            rows={dims.rows}
            currentView={currentView}
            maxAgents={store.maxAgents}
            unreadCount={store.unreadInums.size}
        >
            {(_setFooterOptions, terminal, layout) => (
                <HomeView
                    issues={store.issues}
                    unreadInums={store.unreadInums}
                    terminal={terminal}
                    layout={layout}
                />
            )}
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
