import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { createQuestion, getQuestion, updateStatus } from '../questions.js';
import { addBlocker } from '../dependencies.js';
import {
    enforceBlocked,
    autoUnblock,
    promoteAwaiting,
    runPipeline,
} from '../pipeline.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

describe('pipeline', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-pipeline-test-'));
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        // Seed metadata counter manually (no seed.sql — we control all questions)
        db.run("INSERT INTO metadata (key, value) VALUES ('lastQuestionCreated', '0')");
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('enforceBlocked', () => {
        it('blocked Active question → moved to Deferred', () => {
            const blocker = createQuestion(db, 'blocker', 'desc');
            const target = createQuestion(db, 'target', 'desc');
            updateStatus(db, target, 'Active');
            addBlocker(db, target, blocker);

            const moved = enforceBlocked(db);

            expect(moved).toContain(target);
            expect(getQuestion(db, target)!.status).toBe('Deferred');
        });

        it('blocked Awaiting question → moved to Deferred', () => {
            const blocker = createQuestion(db, 'blocker', 'desc');
            const target = createQuestion(db, 'target', 'desc');
            addBlocker(db, target, blocker);

            const moved = enforceBlocked(db);

            expect(moved).toContain(target);
            expect(getQuestion(db, target)!.status).toBe('Deferred');
        });

        it('unblocked Active question stays Active', () => {
            const q = createQuestion(db, 'active', 'desc');
            updateStatus(db, q, 'Active');

            const moved = enforceBlocked(db);

            expect(moved).not.toContain(q);
            expect(getQuestion(db, q)!.status).toBe('Active');
        });

        it('returns empty when nothing to enforce', () => {
            createQuestion(db, 'unblocked', 'desc');
            expect(enforceBlocked(db)).toEqual([]);
        });
    });

    describe('autoUnblock', () => {
        it('all blockers resolved → Deferred moves to Awaiting', () => {
            const blocker = createQuestion(db, 'blocker', 'desc');
            const target = createQuestion(db, 'target', 'desc');
            addBlocker(db, target, blocker);
            updateStatus(db, target, 'Deferred');

            // Resolve the blocker
            updateStatus(db, blocker, 'Resolved');

            const moved = autoUnblock(db);

            expect(moved).toContain(target);
            expect(getQuestion(db, target)!.status).toBe('Awaiting');
        });

        it('user-deferred question (no deps) stays in Deferred', () => {
            const q = createQuestion(db, 'user_deferred', 'desc');
            updateStatus(db, q, 'Deferred');

            const moved = autoUnblock(db);

            expect(moved).not.toContain(q);
            expect(getQuestion(db, q)!.status).toBe('Deferred');
        });

        it('partial blockers resolved → stays Deferred', () => {
            const b1 = createQuestion(db, 'blocker1', 'desc');
            const b2 = createQuestion(db, 'blocker2', 'desc');
            const target = createQuestion(db, 'target', 'desc');
            addBlocker(db, target, b1);
            addBlocker(db, target, b2);
            updateStatus(db, target, 'Deferred');

            updateStatus(db, b1, 'Resolved');

            const moved = autoUnblock(db);

            expect(moved).not.toContain(target);
            expect(getQuestion(db, target)!.status).toBe('Deferred');
        });

        it('returns empty when nothing to unblock', () => {
            expect(autoUnblock(db)).toEqual([]);
        });
    });

    describe('promoteAwaiting', () => {
        it('promotes Awaiting to Active up to maxAgents', () => {
            const q1 = createQuestion(db, 'q1', 'desc');
            const q2 = createQuestion(db, 'q2', 'desc');
            const q3 = createQuestion(db, 'q3', 'desc');

            const promoted = promoteAwaiting(db, 2);

            expect(promoted).toEqual([q1, q2]);
            expect(getQuestion(db, q1)!.status).toBe('Active');
            expect(getQuestion(db, q2)!.status).toBe('Active');
            expect(getQuestion(db, q3)!.status).toBe('Awaiting');
        });

        it('respects existing Active count', () => {
            const q1 = createQuestion(db, 'q1', 'desc');
            const q2 = createQuestion(db, 'q2', 'desc');
            const q3 = createQuestion(db, 'q3', 'desc');
            updateStatus(db, q1, 'Active');

            const promoted = promoteAwaiting(db, 2);

            // Only 1 slot available (maxAgents=2, 1 already active)
            expect(promoted).toEqual([q2]);
            expect(getQuestion(db, q2)!.status).toBe('Active');
            expect(getQuestion(db, q3)!.status).toBe('Awaiting');
        });

        it('no slots available → nothing promoted', () => {
            const q1 = createQuestion(db, 'q1', 'desc');
            const q2 = createQuestion(db, 'q2', 'desc');
            updateStatus(db, q1, 'Active');
            updateStatus(db, q2, 'Active');

            const q3 = createQuestion(db, 'q3', 'desc');
            const promoted = promoteAwaiting(db, 2);

            expect(promoted).toEqual([]);
            expect(getQuestion(db, q3)!.status).toBe('Awaiting');
        });

        it('promotes in qnum order', () => {
            const q1 = createQuestion(db, 'q1', 'desc');
            const q2 = createQuestion(db, 'q2', 'desc');
            const q3 = createQuestion(db, 'q3', 'desc');

            const promoted = promoteAwaiting(db, 10);

            expect(promoted).toEqual([q1, q2, q3]);
        });

        it('returns empty when no Awaiting questions', () => {
            expect(promoteAwaiting(db, 5)).toEqual([]);
        });
    });

    describe('runPipeline', () => {
        it('runs enforce → unblock → promote in correct order', () => {
            // Setup: q1 blocks q2, q3 is awaiting
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'blocked', 'desc');
            const q3 = createQuestion(db, 'awaiting', 'desc');
            addBlocker(db, q2, q1);
            // q2 is Awaiting but blocked — enforce should defer it

            const result = runPipeline(db, 2);

            // q2 should have been enforced to Deferred
            expect(result.enforced).toContain(q2);
            expect(getQuestion(db, q2)!.status).toBe('Deferred');

            // q1 and q3 should have been promoted (2 slots, 2 awaiting after enforce)
            expect(result.promoted).toContain(q1);
            expect(result.promoted).toContain(q3);
        });

        it('unblocked question gets promoted in same pipeline run', () => {
            // Setup: q1 blocks q2, q1 is already resolved, q2 is Deferred
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'target', 'desc');
            addBlocker(db, q2, q1);
            updateStatus(db, q1, 'Resolved');
            updateStatus(db, q2, 'Deferred');

            const result = runPipeline(db, 5);

            // q2 should have been unblocked to Awaiting, then promoted to Active
            expect(result.unblocked).toContain(q2);
            expect(result.promoted).toContain(q2);
            expect(getQuestion(db, q2)!.status).toBe('Active');
        });

        it('no-op pipeline returns empty arrays', () => {
            const result = runPipeline(db, 5);
            expect(result.enforced).toEqual([]);
            expect(result.unblocked).toEqual([]);
            expect(result.promoted).toEqual([]);
        });
    });
});
