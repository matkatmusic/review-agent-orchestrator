#!/usr/bin/env node
import React, { useState } from 'react';
import { render } from 'ink';
import { DB } from '../db.js';
import { loadConfig } from '../config.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Dashboard from './dashboard.js';
import Detail from './detail.js';
import Create from './create.js';

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
            return (
                <Detail
                    db={db}
                    qnum={screen.qnum}
                    onBack={() => setScreen({ type: 'dashboard' })}
                />
            );
        case 'create':
            return (
                <Create
                    db={db}
                    onCreated={(qnum) => setScreen({ type: 'detail', qnum })}
                    onBack={() => setScreen({ type: 'dashboard' })}
                />
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

    process.on('SIGINT', () => {
        db.close();
        process.exit(0);
    });

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
