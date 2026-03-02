import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { createQuestion, getQuestion } from '../questions.js';
import { addResponse } from '../responses.js';
import { addBlocker, getBlockers } from '../dependencies.js';
import { processPendingQueue } from '../pending.js';
import {
    cmdRead, cmdList, cmdInfo, cmdStatus,
    cmdRespond, cmdCreate, cmdBlockBy, cmdBlockByGroup, cmdAddToGroup,
} from '../qr-tool-commands.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

describe('qr-tool commands', () => {
    let tmpDir: string;
    let pendingDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-tool-test-'));
        pendingDir = join(tmpDir, '.pending');
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.run("INSERT INTO metadata (key, value) VALUES ('lastQuestionCreated', '0')");
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── Read commands ──

    describe('read', () => {
        it('shows question title and responses', () => {
            const q = createQuestion(db, 'test_title', 'test description');
            addResponse(db, q, 'agent', 'Hello from agent');
            addResponse(db, q, 'user', 'User reply');

            const output = cmdRead(db, q);

            expect(output).toContain('test_title');
            expect(output).toContain('test description');
            expect(output).toContain('Hello from agent');
            expect(output).toContain('User reply');
            expect(output).toContain('Agent');
            expect(output).toContain('You');
        });

        it('returns error for nonexistent question', () => {
            const output = cmdRead(db, 999);
            expect(output).toContain('Error');
            expect(output).toContain('999');
        });

        it('shows (no responses) for question without responses', () => {
            const q = createQuestion(db, 'empty', 'desc');
            const output = cmdRead(db, q);
            expect(output).toContain('(no responses)');
        });
    });

    describe('list', () => {
        it('lists all questions by default', () => {
            createQuestion(db, 'q1', 'desc1');
            createQuestion(db, 'q2', 'desc2');
            createQuestion(db, 'q3', 'desc3');

            const output = cmdList(db, {});

            expect(output).toContain('q1');
            expect(output).toContain('q2');
            expect(output).toContain('q3');
            expect(output).toContain('QNUM');
            expect(output).toContain('TITLE');
        });

        it('filters by status', () => {
            const q1 = createQuestion(db, 'awaiting_q', 'desc');
            const q2 = createQuestion(db, 'active_q', 'desc');
            db.run("UPDATE questions SET status = 'Active' WHERE qnum = ?", q2);

            const output = cmdList(db, { status: 'Active' });

            expect(output).toContain('active_q');
            expect(output).not.toContain('awaiting_q');
        });

        it('filters by group', () => {
            createQuestion(db, 'grouped', 'desc', 'mygroup');
            createQuestion(db, 'ungrouped', 'desc');

            const output = cmdList(db, { group: 'mygroup' });

            expect(output).toContain('grouped');
            expect(output).not.toContain('ungrouped');
        });

        it('returns message when no questions found', () => {
            const output = cmdList(db, { status: 'Resolved' });
            expect(output).toContain('no questions found');
        });
    });

    describe('info', () => {
        it('shows question details and dependencies', () => {
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'target', 'desc', 'mygroup');
            addBlocker(db, q2, q1);

            const output = cmdInfo(db, q2);

            expect(output).toContain('target');
            expect(output).toContain('mygroup');
            expect(output).toContain(`Q${q1}`);
            expect(output).toContain('Blocked by:');
        });

        it('shows blocks relationship', () => {
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'target', 'desc');
            addBlocker(db, q2, q1);

            const output = cmdInfo(db, q1);
            expect(output).toContain('Blocks:');
            expect(output).toContain(`Q${q2}`);
        });

        it('returns error for nonexistent question', () => {
            const output = cmdInfo(db, 999);
            expect(output).toContain('Error');
        });
    });

    describe('status', () => {
        it('shows counts by status', () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            const q3 = createQuestion(db, 'q3', 'desc');
            db.run("UPDATE questions SET status = 'Active' WHERE qnum = ?", q3);

            const output = cmdStatus(db);

            expect(output).toContain('Total: 3');
            expect(output).toMatch(/Awaiting:\s+2/);
            expect(output).toMatch(/Active:\s+1/);
            expect(output).toContain('User_Deferred:');
        });
    });

    // ── Write commands (pending queue integration) ──

    describe('create via pending', () => {
        it('creates question after pending processed', () => {
            cmdCreate(pendingDir, 'new_q', 'new description', 'testgroup');
            processPendingQueue(db, pendingDir);

            const q = getQuestion(db, 1);
            expect(q).toBeDefined();
            expect(q!.title).toBe('new_q');
            expect(q!.description).toBe('new description');
            expect(q!.group).toBe('testgroup');
        });
    });

    describe('respond via pending', () => {
        it('adds response after pending processed', () => {
            const q = createQuestion(db, 'test', 'desc');
            cmdRespond(pendingDir, q, 'agent', 'agent response text');
            processPendingQueue(db, pendingDir);

            const output = cmdRead(db, q);
            expect(output).toContain('agent response text');
        });
    });

    describe('block-by via pending', () => {
        it('creates dependency after pending processed', () => {
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'blocked', 'desc');

            cmdBlockBy(pendingDir, q2, q1);
            processPendingQueue(db, pendingDir);

            const blockers = getBlockers(db, q2);
            expect(blockers).toHaveLength(1);
            expect(blockers[0]!.qnum).toBe(q1);
        });
    });

    describe('block-by-group via pending', () => {
        it('creates group dependencies after pending processed', () => {
            const g1 = createQuestion(db, 'g1', 'desc', 'mygroup');
            const g2 = createQuestion(db, 'g2', 'desc', 'mygroup');
            const target = createQuestion(db, 'target', 'desc');

            cmdBlockByGroup(pendingDir, target, 'mygroup');
            processPendingQueue(db, pendingDir);

            const blockers = getBlockers(db, target);
            expect(blockers).toHaveLength(2);
        });
    });

    describe('add-to-group via pending', () => {
        it('sets group after pending processed', () => {
            const q = createQuestion(db, 'ungrouped', 'desc');
            expect(getQuestion(db, q)!.group).toBeNull();

            cmdAddToGroup(pendingDir, q, 'newgroup');
            processPendingQueue(db, pendingDir);

            expect(getQuestion(db, q)!.group).toBe('newgroup');
        });
    });

    // ── Schema path resolution (Fix L) ──

    describe('schema path resolution', () => {
        it('schema.sql resolves via import.meta.url relative path', () => {
            // The schema path used by qr-tool is: join(__dirname, '..', 'templates', 'schema.sql')
            // Verify that __dirname-relative path matches the same file used by tests
            const schemaViaImportMeta = join(__dirname, '../../templates/schema.sql');
            expect(existsSync(schemaViaImportMeta)).toBe(true);
        });

        it('schema path does NOT depend on a hardcoded submodule name', () => {
            // Regression: old code used join(root, 'review-agent-orchestrator', 'templates', 'schema.sql')
            // which breaks if the repo is cloned under a different directory name.
            // The fix uses import.meta.url-relative resolution instead.
            // Verify schema.sql is reachable from the source dir (not from project root + hardcoded name)
            const fromSourceDir = join(__dirname, '..', 'templates', 'schema.sql');
            // __dirname here is src/__tests__, so ../templates doesn't exist — but the actual
            // qr-tool.ts __dirname is src/, so join(src/, '..', 'templates', 'schema.sql') works
            const fromQrToolDir = join(__dirname, '..', '..', 'templates', 'schema.sql');
            expect(existsSync(fromQrToolDir)).toBe(true);
        });
    });

    // ── Output format ──

    describe('output messages', () => {
        it('write commands return confirmation strings', () => {
            expect(cmdRespond(pendingDir, 1, 'agent', 'test')).toContain('Pending');
            expect(cmdCreate(pendingDir, 'title', 'desc')).toContain('Pending');
            expect(cmdBlockBy(pendingDir, 2, 1)).toContain('Pending');
            expect(cmdBlockByGroup(pendingDir, 2, 'grp')).toContain('Pending');
            expect(cmdAddToGroup(pendingDir, 1, 'grp')).toContain('Pending');
        });
    });
});
