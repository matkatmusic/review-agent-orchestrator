#!/usr/bin/env node
import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { DB } from '../db/database.js';
import * as issues from '../db/issues.js';
import * as responses from '../db/responses.js';
import * as deps from '../db/dependencies.js';
import { IssueStatus } from "../types.js"

const program = new Command();

program
    .name('aidi')
    .description('Agent Issue DB Interface — CLI for agent interaction with issue database')
    .version('2.1.0');

/**
 * Resolve the project root by walking up from CWD to find a directory
 * containing config.json (the orchestrator's project root).
 */
function resolveProjectRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 20; i++) {
        if (existsSync(join(dir, 'config.json'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error('Could not find project root (directory containing config.json)');
}

function openDB(): DB {
    const root = resolveProjectRoot();
    const dbPath = join(root, 'issues.db');
    const db = new DB(dbPath);
    db.open();
    return db;
}

// respond <inum> "<body>"
program
    .command('respond')
    .argument('<inum>', 'Issue number', parseInt)
    .argument('<body>', 'Response body')
    .description('Add a response to an issue')
    .action((inum: number, body: string) => {
        const db = openDB();
        try {
            const issue = issues.getByInum(db, inum);
            if (!issue) {
                process.stderr.write(`Error: Issue I${inum} not found\n`);
                process.exit(1);
            }
            const id = responses.create(db, inum, 'agent', body);
            process.stdout.write(`Response ${id} added to I${inum}\n`);
        } finally {
            db.close();
        }
    });

// read <inum> [--latest]
program
    .command('read')
    .argument('<inum>', 'Issue number', parseInt)
    .option('--latest', 'Show only the latest response')
    .description('Read an issue and its responses')
    .action((inum: number, opts: { latest?: boolean }) => {
        const db = openDB();
        try {
            const issue = issues.getByInum(db, inum);
            if (!issue) {
                process.stderr.write(`Error: Issue I${inum} not found\n`);
                process.exit(1);
            }

            if (opts.latest) {
                const latest = responses.getLatestByInum(db, inum);
                if (latest) {
                    process.stdout.write(`[${latest.author}] ${latest.body}\n`);
                } else {
                    process.stdout.write('No responses\n');
                }
            } else {
                process.stdout.write(`I${issue.inum}: ${issue.title}\n`);
                process.stdout.write(`Status: ${issue.status}\n`);
                process.stdout.write(`Description: ${issue.description}\n`);
                process.stdout.write(`---\n`);

                const resps = responses.listByInum(db, inum);
                if (resps.length === 0) {
                    process.stdout.write('No responses\n');
                } else {
                    for (const r of resps) {
                        process.stdout.write(`[${r.author} ${r.created_at}] ${r.body}\n`);
                    }
                }
            }
        } finally {
            db.close();
        }
    });

// block <inum> --by <blocker_inum>
program
    .command('block')
    .argument('<inum>', 'Issue to block', parseInt)
    .requiredOption('--by <blocker>', 'Blocker issue number', parseInt)
    .description('Add a blocking dependency')
    .action((inum: number, opts: { by: number }) => {
        const db = openDB();
        try {
            db.transactionImmediate(() => {
                deps.addBlock(db, inum, opts.by);
                // Only set status to Blocked if the issue is actually blocked
                // (blocker may already be Resolved, making the dependency inactive)
                if (deps.isBlocked(db, inum)) {
                    issues.updateStatus(db, inum, IssueStatus.Blocked);
                }
            });
            process.stdout.write(`I${inum} is now blocked by I${opts.by}\n`);
        } catch (err) {
            process.stderr.write(`Error: ${(err as Error).message}\n`);
            process.exit(1);
        } finally {
            db.close();
        }
    });

// create "<title>" "<description>"
program
    .command('create')
    .argument('<title>', 'Issue title')
    .argument('<description>', 'Issue description')
    .description('Create a new sub-issue')
    .action((title: string, description: string) => {
        const db = openDB();
        try {
            const inum = issues.createIssue(db, title, description);
            process.stdout.write(`Created I${inum}: ${title}\n`);
        } finally {
            db.close();
        }
    });

// status <inum>
program
    .command('status')
    .argument('<inum>', 'Issue number', parseInt)
    .description('Print issue status')
    .action((inum: number) => {
        const db = openDB();
        try {
            const issue = issues.getByInum(db, inum);
            if (!issue) {
                process.stderr.write(`Error: Issue I${inum} not found\n`);
                process.exit(1);
            }
            process.stdout.write(`I${inum}: ${issue.status}\n`);
        } finally {
            db.close();
        }
    });

// ack <inum> <revision>
program
    .command('ack')
    .argument('<inum>', 'Issue number', parseInt)
    .argument('<revision>', 'Expected issue revision', parseInt)
    .description('Acknowledge reading the latest issue.md (sets agent_last_read_at if revision matches)')
    .action((inum: number, revision: number) => {
        const db = openDB();
        try {
            db.transactionImmediate(() => {
                const issue = issues.getByInum(db, inum);
                if (!issue) {
                    throw new Error(`Issue I${inum} not found`);
                }
                if (issue.issue_revision !== revision) {
                    throw new Error(
                        `Revision mismatch — expected ${revision}, current is ${issue.issue_revision}`
                    );
                }
                db.run(
                    "UPDATE issues SET agent_last_read_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE inum = ?",
                    inum
                );
            });
            process.stdout.write(`Ack I${inum} revision ${revision}\n`);
        } catch (err) {
            process.stderr.write(`Error: ${(err as Error).message}\n`);
            process.exit(1);
        } finally {
            db.close();
        }
    });

program.parse();
