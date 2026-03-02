#!/usr/bin/env node
import React, { useState, useCallback, useEffect } from 'react';
import { render, Box, Text, useStdout } from 'ink';
import { DB } from '../db.js';
import { loadConfig } from '../config.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import Dashboard from './dashboard.js';
import Detail from './detail.js';
import Create from './create.js';
import Header from './header.js';
import type { HeaderContext } from './header.js';

type Screen =
    | { type: 'dashboard' }
    | { type: 'detail'; qnum: number }
    | { type: 'create' };

const HEADER_LINES = 3;
const FOOTER_LINES = 1;
const DEFAULT_ROWS = 24;

function getGitBranch(cwd: string): string {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
        return '(no branch)';
    }
}

interface AppProps {
    db: DB;
    projectRoot: string;
}

function App({ db, projectRoot }: AppProps) {
    const { stdout } = useStdout();
    const rows = stdout.rows ?? DEFAULT_ROWS;
    const columns = stdout.columns ?? 80;

    const [screen, setScreen] = useState<Screen>({ type: 'dashboard' });
    const [headerCtx, setHeaderCtx] = useState<HeaderContext>({ type: 'none' });
    const [branch, setBranch] = useState(() => getGitBranch(projectRoot));

    const contentHeight = Math.max(1, rows - HEADER_LINES - FOOTER_LINES);

    // Refresh branch periodically in case of checkout
    useEffect(() => {
        const timer = setInterval(() => setBranch(getGitBranch(projectRoot)), 10000);
        return () => clearInterval(timer);
    }, [projectRoot]);

    const goToDashboard = useCallback(() => {
        setScreen({ type: 'dashboard' });
        setHeaderCtx({ type: 'none' });
    }, []);

    const goToDetail = useCallback((qnum: number) => {
        setScreen({ type: 'detail', qnum });
    }, []);

    const goToCreate = useCallback(() => {
        setScreen({ type: 'create' });
        setHeaderCtx({ type: 'new-question' });
    }, []);

    let content: React.ReactNode;
    switch (screen.type) {
        case 'dashboard':
            content = (
                <Dashboard
                    db={db}
                    onOpenDetail={goToDetail}
                    onNewQuestion={goToCreate}
                    onSelectionChange={setHeaderCtx}
                />
            );
            break;
        case 'detail':
            content = (
                <Detail
                    db={db}
                    qnum={screen.qnum}
                    onBack={goToDashboard}
                    onHeaderUpdate={setHeaderCtx}
                    contentHeight={contentHeight}
                />
            );
            break;
        case 'create':
            content = (
                <Create
                    db={db}
                    onCreated={goToDetail}
                    onBack={goToDashboard}
                />
            );
            break;
    }

    return (
        <Box flexDirection="column" height={rows}>
            <Header context={headerCtx} columns={columns} />
            <Box flexDirection="column" height={contentHeight} overflowY="hidden">
                {content}
            </Box>
            <Box height={FOOTER_LINES}>
                <Text dimColor> {projectRoot}  ({branch})</Text>
            </Box>
        </Box>
    );
}

// --- CLI entry point ---

function getSubmoduleDir(): string {
    const __filename = fileURLToPath(import.meta.url);
    // dist/tui/app.js → dist/ → submodule root
    return dirname(dirname(dirname(__filename)));
}

function main() {
    const projectRoot = process.argv[2] || undefined;
    let config;
    try {
        config = loadConfig(projectRoot);
    } catch (err) {
        console.error(`[tui] Failed to load config: ${err}`);
        process.exit(1);
    }

    const dbPath = join(config.projectRoot, 'questions.db');
    const schemaPath = join(getSubmoduleDir(), 'templates', 'schema.sql');

    const db = new DB(dbPath);
    try {
        db.open();
        db.migrate(schemaPath);
    } catch (err) {
        console.error(`[tui] Failed to open database: ${err}`);
        process.exit(1);
    }

    process.on('SIGINT', () => {
        db.close();
        process.exit(0);
    });

    const instance = render(<App db={db} projectRoot={config.projectRoot} />);

    instance.waitUntilExit().then(() => {
        db.close();
    });
}

const isDirectRun = process.argv[1]?.endsWith('app.js');
if (isDirectRun) {
    main();
}

export { App };
export type { HeaderContext };
