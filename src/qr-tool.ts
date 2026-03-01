#!/usr/bin/env node
import { Command } from 'commander';
import { join } from 'node:path';
import { DB } from './db.js';
import { loadConfig, resolveProjectRoot } from './config.js';
import {
    cmdRead, cmdList, cmdInfo, cmdStatus,
    cmdRespond, cmdCreate, cmdBlockBy, cmdBlockByGroup, cmdAddToGroup,
} from './qr-tool-commands.js';

const program = new Command();

program
    .name('qr-tool')
    .description('Question Review CLI — read questions and submit actions')
    .version('2.0.0');

// Helper: open DB for read commands
function openDB(): DB {
    const root = resolveProjectRoot();
    const config = loadConfig(root);
    const dbPath = join(root, config.questionsDir, 'questions.db');
    const db = new DB(dbPath);
    db.open();
    db.migrate(join(root, 'review-agent-orchestrator', 'templates', 'schema.sql'));
    return db;
}

function getPendingDir(): string {
    const root = resolveProjectRoot();
    const config = loadConfig(root);
    return join(root, config.questionsDir, '.pending');
}

// ── Read commands ──

program
    .command('read <qnum>')
    .description('Show question + full response history')
    .action((qnumStr: string) => {
        const db = openDB();
        console.log(cmdRead(db, parseInt(qnumStr, 10)));
        db.close();
    });

program
    .command('list')
    .description('List questions')
    .option('-s, --status <status>', 'Filter by status')
    .option('-g, --group <group>', 'Filter by group')
    .action((opts: { status?: string; group?: string }) => {
        const db = openDB();
        console.log(cmdList(db, opts));
        db.close();
    });

program
    .command('info <qnum>')
    .description('Show question details + dependencies')
    .action((qnumStr: string) => {
        const db = openDB();
        console.log(cmdInfo(db, parseInt(qnumStr, 10)));
        db.close();
    });

program
    .command('status')
    .description('Show summary counts by status')
    .action(() => {
        const db = openDB();
        console.log(cmdStatus(db));
        db.close();
    });

// ── Write commands ──

program
    .command('respond <qnum> <body>')
    .description('Submit a response (writes to .pending/)')
    .action((qnumStr: string, body: string) => {
        console.log(cmdRespond(getPendingDir(), parseInt(qnumStr, 10), body));
    });

program
    .command('create <title> <description>')
    .description('Create a new question (writes to .pending/)')
    .option('-g, --group <name>', 'Assign to group')
    .action((title: string, description: string, opts: { group?: string }) => {
        console.log(cmdCreate(getPendingDir(), title, description, opts.group));
    });

program
    .command('block-by <blocked> <blocker>')
    .description('Add dependency (writes to .pending/)')
    .action((blockedStr: string, blockerStr: string) => {
        console.log(cmdBlockBy(getPendingDir(), parseInt(blockedStr, 10), parseInt(blockerStr, 10)));
    });

program
    .command('block-by-group <blocked> <group>')
    .description('Block by all qnums in group (writes to .pending/)')
    .action((blockedStr: string, group: string) => {
        console.log(cmdBlockByGroup(getPendingDir(), parseInt(blockedStr, 10), group));
    });

program
    .command('add-to-group <qnum> <group>')
    .description('Add question to a group (writes to .pending/)')
    .action((qnumStr: string, group: string) => {
        console.log(cmdAddToGroup(getPendingDir(), parseInt(qnumStr, 10), group));
    });

program.parse();
