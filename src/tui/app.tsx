#!/usr/bin/env node
import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import { DB } from '../db.js';
import { loadConfig } from '../config.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Dashboard from './dashboard.js';

type Screen =
    | { type: 'dashboard' }
    | { type: 'detail'; qnum: number }
    | { type: 'create' };

interface AppProps {
    db: DB;
}

function App({ db }: AppProps) {
    const [screen, setScreen] = useState<Screen>({ type: 'dashboard' });

    switch (screen.type) {
        case 'dashboard':
            return (
                <Dashboard
                    db={db}
                    onOpenDetail={(qnum) => setScreen({ type: 'detail', qnum })}
                    onNewQuestion={() => setScreen({ type: 'create' })}
                />
            );
        case 'detail':
            // Placeholder — Stage 14 will implement detail.tsx
            return (
                <Box flexDirection="column">
                    <Text>Question Detail: Q{screen.qnum} (not yet implemented)</Text>
                    <Text dimColor>Press any key to go back.</Text>
                </Box>
            );
        case 'create':
            // Placeholder — Stage 15 will implement create.tsx
            return (
                <Box flexDirection="column">
                    <Text>New Question (not yet implemented)</Text>
                    <Text dimColor>Press any key to go back.</Text>
                </Box>
            );
    }
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

    const dbPath = join(config.projectRoot, config.questionsDir, 'questions.db');
    const schemaPath = join(getSubmoduleDir(), 'templates', 'schema.sql');

    const db = new DB(dbPath);
    try {
        db.open();
        db.migrate(schemaPath);
    } catch (err) {
        console.error(`[tui] Failed to open database: ${err}`);
        process.exit(1);
    }

    const instance = render(<App db={db} />);

    instance.waitUntilExit().then(() => {
        db.close();
    });
}

const isDirectRun = process.argv[1]?.endsWith('app.js');
if (isDirectRun) {
    main();
}

export { App };
