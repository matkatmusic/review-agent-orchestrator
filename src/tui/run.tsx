/**
 * TUI entry point.
 *
 * --resetMockData flag must be processed BEFORE mock-data.ts is imported,
 * so we use dynamic imports for everything that transitively loads mock data.
 */

import { resetMockData } from './mock-store.js';

if (process.argv.includes('--resetMockData')) {
    resetMockData();
    console.log('Mock data reset to defaults.');
}

// Dynamic imports — these load mock-data.ts which reads from the (now reset) JSON
const [
    { default: React, useState, useEffect, useCallback },
    { render, useStdout, useApp },
    { App },
    { ViewType },
] = await Promise.all([
    import('react'),
    import('ink'),
    import('./app.js'),
    import('./views.js'),
]);

function AppWrapper() {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const stream = stdout as import('node:tty').WriteStream | undefined;
    const [dims, setDims] = useState({
        columns: stream?.columns ?? 80,
        rows: stream?.rows ?? 24,
    });

    const onResize = useCallback(() => {
        if (stream) {
            process.stdout.write('\x1B[2J\x1B[H');
            setDims({ columns: stream.columns, rows: stream.rows });
        }
    }, [stream]);

    useEffect(() => {
        if (stream) {
            stream.on('resize', onResize);
            return () => { stream.off('resize', onResize); };
        }
    }, [stream, onResize]);

    return <App columns={dims.columns} rows={dims.rows} onExit={exit} initialView={{ type: ViewType.Detail, inum: 1 }} />;
}

const instance = render(<AppWrapper />);
await instance.waitUntilExit();
