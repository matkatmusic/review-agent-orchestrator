import React from 'react';
import { render, useStdout, useApp } from 'ink';
import { App } from './app.js';
import { ViewType } from './views.js';

//thin functional wrapper that extracts terminal dimensions
//and passes them as props to the class component
function AppWrapper() {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const columns = (stdout as import('node:tty').WriteStream)?.columns ?? 80;
    const rows = (stdout as import('node:tty').WriteStream)?.rows ?? 24;
    return <App columns={columns} rows={rows} onExit={exit} initialView={{ type: ViewType.Detail, inum: 1 }} />;
}

const instance = render(<AppWrapper />);
await instance.waitUntilExit();
