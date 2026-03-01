import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { getQuestion, createQuestion } from '../questions.js';
import { listResponses } from '../responses.js';
import { getBlockers } from '../dependencies.js';
import { writePending, processPendingQueue } from '../pending.js';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

describe('pending', () => {
    let tmpDir: string;
    let pendingDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-pending-test-'));
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

    it('writePending creates file in .pending/', () => {
        const filepath = writePending(pendingDir, {
            action: 'respond',
            qnum: 1,
            author: 'agent',
            body: 'test response',
        });

        expect(existsSync(filepath)).toBe(true);
        const files = readdirSync(pendingDir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^\d+-[0-9a-f]+\.json$/);
    });

    it('process queue — respond action applied to DB, file deleted', () => {
        const q = createQuestion(db, 'test', 'desc');
        writePending(pendingDir, {
            action: 'respond',
            qnum: q,
            author: 'agent',
            body: 'agent says hello',
        });

        const processed = processPendingQueue(db, pendingDir);
        expect(processed).toBe(1);

        const responses = listResponses(db, q);
        expect(responses).toHaveLength(1);
        expect(responses[0]!.body).toBe('agent says hello');
        expect(responses[0]!.author).toBe('agent');

        // File should be deleted
        expect(readdirSync(pendingDir)).toHaveLength(0);
    });

    it('process queue — create action', () => {
        writePending(pendingDir, {
            action: 'create',
            title: 'new_question',
            description: 'created via pending',
            group: 'mygroup',
        });

        processPendingQueue(db, pendingDir);

        const q = getQuestion(db, 1);
        expect(q).toBeDefined();
        expect(q!.title).toBe('new_question');
        expect(q!.group).toBe('mygroup');
    });

    it('process queue — block-by action', () => {
        const q1 = createQuestion(db, 'blocker', 'desc');
        const q2 = createQuestion(db, 'blocked', 'desc');

        writePending(pendingDir, {
            action: 'block-by',
            blocked: q2,
            blocker: q1,
        });

        processPendingQueue(db, pendingDir);

        const blockers = getBlockers(db, q2);
        expect(blockers).toHaveLength(1);
        expect(blockers[0]!.qnum).toBe(q1);
    });

    it('process queue — block-by-group action', () => {
        const g1 = createQuestion(db, 'g1', 'desc', 'mygroup');
        const g2 = createQuestion(db, 'g2', 'desc', 'mygroup');
        const target = createQuestion(db, 'target', 'desc');

        writePending(pendingDir, {
            action: 'block-by-group',
            blocked: target,
            group: 'mygroup',
        });

        processPendingQueue(db, pendingDir);

        const blockers = getBlockers(db, target);
        expect(blockers).toHaveLength(2);
    });

    it('process queue — add-to-group action', () => {
        const q = createQuestion(db, 'ungrouped', 'desc');
        expect(getQuestion(db, q)!.group).toBeNull();

        writePending(pendingDir, {
            action: 'add-to-group',
            qnum: q,
            group: 'newgroup',
        });

        processPendingQueue(db, pendingDir);

        expect(getQuestion(db, q)!.group).toBe('newgroup');
    });

    it('multiple pending files processed in timestamp order', () => {
        // Create questions that pending actions will reference
        const q = createQuestion(db, 'test', 'desc');
        mkdirSync(pendingDir, { recursive: true });

        // Write files with known timestamps to ensure ordering
        writeFileSync(
            join(pendingDir, '0000000001-aaaa.json'),
            JSON.stringify({ action: 'respond', qnum: q, author: 'agent', body: 'first' })
        );
        writeFileSync(
            join(pendingDir, '0000000002-bbbb.json'),
            JSON.stringify({ action: 'respond', qnum: q, author: 'user', body: 'second' })
        );
        writeFileSync(
            join(pendingDir, '0000000003-cccc.json'),
            JSON.stringify({ action: 'respond', qnum: q, author: 'agent', body: 'third' })
        );

        processPendingQueue(db, pendingDir);

        const responses = listResponses(db, q);
        expect(responses).toHaveLength(3);
        expect(responses[0]!.body).toBe('first');
        expect(responses[1]!.body).toBe('second');
        expect(responses[2]!.body).toBe('third');
    });

    it('invalid action file → logged and skipped (not crash)', () => {
        const q = createQuestion(db, 'test', 'desc');
        mkdirSync(pendingDir, { recursive: true });

        // Invalid JSON
        writeFileSync(join(pendingDir, '0000000001-bad1.json'), 'not json!!!');
        // Valid JSON but will cause DB error (nonexistent qnum for respond)
        writeFileSync(
            join(pendingDir, '0000000002-bad2.json'),
            JSON.stringify({ action: 'respond', qnum: 9999, author: 'agent', body: 'orphan' })
        );
        // Valid action
        writeFileSync(
            join(pendingDir, '0000000003-good.json'),
            JSON.stringify({ action: 'respond', qnum: q, author: 'agent', body: 'valid' })
        );

        const processed = processPendingQueue(db, pendingDir);

        // Only the valid one should have been processed successfully
        expect(processed).toBe(1);

        const responses = listResponses(db, q);
        expect(responses).toHaveLength(1);
        expect(responses[0]!.body).toBe('valid');

        // All files should be deleted (including invalid ones)
        expect(readdirSync(pendingDir)).toHaveLength(0);
    });

    it('returns 0 when pending dir does not exist', () => {
        const nonexistent = join(tmpDir, 'no-such-dir');
        expect(processPendingQueue(db, nonexistent)).toBe(0);
    });

    it('returns 0 when pending dir is empty', () => {
        writePending(pendingDir, { action: 'create', title: 'x', description: 'y' });
        processPendingQueue(db, pendingDir);
        // Second run with empty dir
        expect(processPendingQueue(db, pendingDir)).toBe(0);
    });
});
