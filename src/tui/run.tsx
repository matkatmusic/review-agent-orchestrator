import React, { useState, useEffect, useCallback } from 'react';
import { render, useStdout, useApp } from 'ink';
import { App } from './app.js';
import { ViewType } from './views.js';

//thin functional wrapper that extracts terminal dimensions
//and passes them as props to the class component
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
