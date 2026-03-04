import React from 'react';
import { render, useStdout } from 'ink';
import { App } from './app.js';

//thin functional wrapper that extracts terminal dimensions
//and passes them as props to the class component
function AppWrapper() {
    const { stdout } = useStdout();
    const columns = (stdout as import('node:tty').WriteStream)?.columns ?? 80;
    const rows = (stdout as import('node:tty').WriteStream)?.rows ?? 24;
    return <App columns={columns} rows={rows} />;
}

const instance = render(<AppWrapper />);
await instance.waitUntilExit();
