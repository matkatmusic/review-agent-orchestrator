import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import {
    createQuestion,
    getQuestion,
    listByStatus,
    listAll,
    updateStatus,
    getActiveCount,
    getGroup,
    isGroupResolved,
} from '../questions.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');
const SEED_PATH = join(__dirname, '../../templates/seed.sql');

describe('questions', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-questions-test-'));
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('createQuestion returns qnum matching lastQuestionCreated', () => {
        const qnum = createQuestion(db, 'test_title', 'test description');
        expect(qnum).toBe(2); // seed sets lastQuestionCreated=1

        const meta = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'lastQuestionCreated'"
        );
        expect(meta?.value).toBe('2');
    });

    it('createQuestion increments qnums', () => {
        const q2 = createQuestion(db, 'second', 'desc 2');
        const q3 = createQuestion(db, 'third', 'desc 3');
        const q4 = createQuestion(db, 'fourth', 'desc 4');

        expect(q2).toBe(2);
        expect(q3).toBe(3);
        expect(q4).toBe(4);
    });

    it('createQuestion with group', () => {
        const qnum = createQuestion(db, 'grouped', 'desc', 'auth_flow');
        const q = getQuestion(db, qnum);
        expect(q?.group).toBe('auth_flow');
    });

    it('createQuestion without group defaults to null', () => {
        const qnum = createQuestion(db, 'ungrouped', 'desc');
        const q = getQuestion(db, qnum);
        expect(q?.group).toBeNull();
    });

    it('getQuestion returns correct question', () => {
        const q = getQuestion(db, 1);
        expect(q).toBeDefined();
        expect(q!.qnum).toBe(1);
        expect(q!.title).toBe('getting_started');
        expect(q!.status).toBe('Awaiting');
    });

    it('getQuestion returns undefined for nonexistent qnum', () => {
        expect(getQuestion(db, 999)).toBeUndefined();
    });

    it('listByStatus filters correctly', () => {
        createQuestion(db, 'q2', 'desc');
        createQuestion(db, 'q3', 'desc');
        updateStatus(db, 2, 'Active');

        const awaiting = listByStatus(db, 'Awaiting');
        const active = listByStatus(db, 'Active');

        expect(awaiting.map(q => q.qnum)).toEqual([1, 3]);
        expect(active.map(q => q.qnum)).toEqual([2]);
    });

    it('listAll returns all questions ordered by qnum', () => {
        createQuestion(db, 'q2', 'desc');
        createQuestion(db, 'q3', 'desc');

        const all = listAll(db);
        expect(all).toHaveLength(3);
        expect(all.map(q => q.qnum)).toEqual([1, 2, 3]);
    });

    it('updateStatus transitions correctly', () => {
        updateStatus(db, 1, 'Active');
        expect(getQuestion(db, 1)!.status).toBe('Active');

        updateStatus(db, 1, 'Deferred');
        expect(getQuestion(db, 1)!.status).toBe('Deferred');

        updateStatus(db, 1, 'Awaiting');
        expect(getQuestion(db, 1)!.status).toBe('Awaiting');

        updateStatus(db, 1, 'Resolved');
        expect(getQuestion(db, 1)!.status).toBe('Resolved');
    });

    it('updateStatus sets resolved_at when resolving', () => {
        updateStatus(db, 1, 'Resolved');
        const q = getQuestion(db, 1);
        expect(q!.resolved_at).not.toBeNull();
    });

    it('updateStatus clears resolved_at when un-resolving', () => {
        updateStatus(db, 1, 'Resolved');
        expect(getQuestion(db, 1)!.resolved_at).not.toBeNull();

        updateStatus(db, 1, 'Awaiting');
        expect(getQuestion(db, 1)!.resolved_at).toBeNull();
    });

    it('getActiveCount returns correct count', () => {
        expect(getActiveCount(db)).toBe(0);

        createQuestion(db, 'q2', 'desc');
        createQuestion(db, 'q3', 'desc');
        updateStatus(db, 1, 'Active');
        updateStatus(db, 2, 'Active');

        expect(getActiveCount(db)).toBe(2);
    });

    it('getGroup returns questions in the group', () => {
        createQuestion(db, 'g1', 'desc', 'migrate');
        createQuestion(db, 'g2', 'desc', 'migrate');
        createQuestion(db, 'other', 'desc', 'auth');

        const group = getGroup(db, 'migrate');
        expect(group).toHaveLength(2);
        expect(group.map(q => q.title)).toEqual(['g1', 'g2']);
    });

    it('getGroup returns empty array for nonexistent group', () => {
        expect(getGroup(db, 'nonexistent')).toEqual([]);
    });

    it('isGroupResolved — all resolved = true', () => {
        createQuestion(db, 'g1', 'desc', 'test_group');
        createQuestion(db, 'g2', 'desc', 'test_group');
        updateStatus(db, 2, 'Resolved');
        updateStatus(db, 3, 'Resolved');

        expect(isGroupResolved(db, 'test_group')).toBe(true);
    });

    it('isGroupResolved — partial = false', () => {
        createQuestion(db, 'g1', 'desc', 'test_group');
        createQuestion(db, 'g2', 'desc', 'test_group');
        updateStatus(db, 2, 'Resolved');

        expect(isGroupResolved(db, 'test_group')).toBe(false);
    });

    it('isGroupResolved — none resolved = false', () => {
        createQuestion(db, 'g1', 'desc', 'test_group');
        expect(isGroupResolved(db, 'test_group')).toBe(false);
    });

    it('isGroupResolved — nonexistent group = false', () => {
        expect(isGroupResolved(db, 'nonexistent')).toBe(false);
    });
});
