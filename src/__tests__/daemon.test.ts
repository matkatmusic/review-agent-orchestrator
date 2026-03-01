import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { createQuestion, getQuestion, updateStatus } from '../questions.js';
import { addResponse, listResponses } from '../responses.js';
import { addBlocker } from '../dependencies.js';
import { writePending } from '../pending.js';
import { scanCycle, detectNewCommits } from '../daemon.js';
import { createLockfile, readLockfile, listLockfiles } from '../agents.js';
import { killSession } from '../tmux.js';
import type { Config } from '../types.js';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

// Use a unique session name per test file to avoid tmux collisions
const TEST_SESSION = 'qr-daemon-test';

function makeConfig(tmpDir: string, overrides?: Partial<Config>): Config {
    return {
        maxAgents: 3,
        tmuxSession: TEST_SESSION,
        projectRoot: tmpDir,
        questionsDir: 'Questions',
        scanInterval: 10,
        terminalApp: 'Terminal',
        agentPrompt: 'prompts/review-agent.md',
        codeRoot: '',
        ...overrides,
    };
}

describe('daemon — scanCycle', () => {
    let tmpDir: string;
    let db: DB;
    let config: Config;
    let questionsDir: string;

    beforeEach(() => {
        // Kill any leftover session from previous test
        killSession(TEST_SESSION);

        tmpDir = mkdtempSync(join(tmpdir(), 'qr-daemon-test-'));
        questionsDir = join(tmpDir, 'Questions');
        mkdirSync(questionsDir, { recursive: true });

        config = makeConfig(tmpDir);
        db = new DB(join(questionsDir, 'questions.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.run("INSERT INTO metadata (key, value) VALUES ('lastQuestionCreated', '0')");
        // Reset dirty flag after seeding — so we can test dirty tracking accurately
        db.resetDirty();
    });

    afterEach(() => {
        db.close();
        killSession(TEST_SESSION);
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('full cycle: pending processed, pipeline runs, dump exported', () => {
        // Create a question via pending queue
        const pendingDir = join(tmpDir, '.pending');
        writePending(pendingDir, {
            action: 'create',
            title: 'test_question',
            description: 'description here',
        });

        const result = scanCycle(config, db);

        // Pending processed
        expect(result.pendingProcessed).toBe(1);

        // Question was created and promoted to Active (maxAgents=3, 0 active)
        const q = getQuestion(db, 1);
        expect(q).toBeDefined();
        expect(q!.title).toBe('test_question');
        expect(q!.status).toBe('Active');
        expect(result.promoted).toContain(1);

        // Dump should have been exported
        expect(result.dumpExported).toBe(true);
        expect(existsSync(join(questionsDir, 'questions.dump.sql'))).toBe(true);
    });

    it('no-op cycle: dump NOT re-exported', () => {
        // No pending actions, no questions — nothing to do
        const result = scanCycle(config, db);

        expect(result.pendingProcessed).toBe(0);
        expect(result.enforced).toEqual([]);
        expect(result.unblocked).toEqual([]);
        expect(result.promoted).toEqual([]);
        expect(result.dumpExported).toBe(false);
        expect(existsSync(join(questionsDir, 'questions.dump.sql'))).toBe(false);
    });

    it('dirty tracking: response added → dump exported', () => {
        // Create a question directly and make it Active
        const q = createQuestion(db, 'test', 'desc');
        updateStatus(db, q, 'Active');
        db.resetDirty(); // Clear initial dirty state

        // Add a response via pending
        const pendingDir = join(tmpDir, '.pending');
        writePending(pendingDir, {
            action: 'respond',
            qnum: q,
            author: 'agent',
            body: 'agent response',
        });

        const result = scanCycle(config, db);

        expect(result.pendingProcessed).toBe(1);
        expect(result.dumpExported).toBe(true);

        // Verify response was actually written
        const responses = listResponses(db, q);
        expect(responses).toHaveLength(1);
        expect(responses[0]!.body).toBe('agent response');
    });

    it('pipeline: blocked Active → Deferred, agents killed', () => {
        const blocker = createQuestion(db, 'blocker', 'desc');
        const target = createQuestion(db, 'target', 'desc');
        updateStatus(db, target, 'Active');
        addBlocker(db, target, blocker);

        // Create a fake lockfile for the target (simulating a running agent)
        createLockfile(config, { paneId: '%99999', qnum: target, headCommit: 'abc' });
        db.resetDirty();

        const result = scanCycle(config, db);

        // Target should be enforced to Deferred
        expect(result.enforced).toContain(target);
        expect(getQuestion(db, target)!.status).toBe('Deferred');

        // Lockfile should be cleaned up (agent killed)
        expect(readLockfile(config, target)).toBeUndefined();
    });

    it('pipeline: unblock and promote in same cycle', () => {
        const blocker = createQuestion(db, 'blocker', 'desc');
        const target = createQuestion(db, 'target', 'desc');
        addBlocker(db, target, blocker);
        updateStatus(db, blocker, 'Resolved');
        updateStatus(db, target, 'Deferred');
        db.resetDirty();

        const result = scanCycle(config, db);

        expect(result.unblocked).toContain(target);
        expect(result.promoted).toContain(target);
        expect(getQuestion(db, target)!.status).toBe('Active');
    });

    it('promote respects maxAgents', () => {
        const q1 = createQuestion(db, 'q1', 'desc');
        const q2 = createQuestion(db, 'q2', 'desc');
        const q3 = createQuestion(db, 'q3', 'desc');
        const q4 = createQuestion(db, 'q4', 'desc');
        db.resetDirty();

        // maxAgents=3 so only 3 should be promoted
        const result = scanCycle(config, db);

        expect(result.promoted).toHaveLength(3);
        expect(result.promoted).toEqual([q1, q2, q3]);
        expect(getQuestion(db, q4)!.status).toBe('Awaiting');
    });

    it('cleanup stale lockfiles', () => {
        // Create lockfiles for dead panes
        createLockfile(config, { paneId: '%99998', qnum: 10, headCommit: 'a' });
        createLockfile(config, { paneId: '%99999', qnum: 20, headCommit: 'b' });
        db.resetDirty();

        const result = scanCycle(config, db);

        expect(result.staleCleaned).toContain(10);
        expect(result.staleCleaned).toContain(20);
        expect(listLockfiles(config)).toEqual([]);
    });

    it('multiple pending actions processed in order', () => {
        const pendingDir = join(tmpDir, '.pending');
        mkdirSync(pendingDir, { recursive: true });

        // Create a question first
        writeFileSync(
            join(pendingDir, '0000000001-aaaa.json'),
            JSON.stringify({ action: 'create', title: 'multi_test', description: 'desc' })
        );
        // Then respond to it
        writeFileSync(
            join(pendingDir, '0000000002-bbbb.json'),
            JSON.stringify({ action: 'respond', qnum: 1, author: 'user', body: 'hello' })
        );

        const result = scanCycle(config, db);

        expect(result.pendingProcessed).toBe(2);
        const q = getQuestion(db, 1);
        expect(q).toBeDefined();
        expect(q!.title).toBe('multi_test');

        const responses = listResponses(db, 1);
        expect(responses).toHaveLength(1);
        expect(responses[0]!.body).toBe('hello');
    });

    it('dirty flag preserved when exportDump fails', () => {
        // Create a question so DB is dirty
        createQuestion(db, 'test', 'desc');
        expect(db.isDirty()).toBe(true);

        // Use a config with an invalid dump path to make exportDump fail
        const badConfig = makeConfig(tmpDir, {
            questionsDir: 'NonexistentDir',
        });
        const result = scanCycle(badConfig, db);

        // Export should have failed
        expect(result.dumpExported).toBe(false);

        // Dirty flag should still be set (so next cycle retries the export)
        expect(db.isDirty()).toBe(true);
    });

    it('second cycle after no changes does not re-export dump', () => {
        // First cycle: create something to cause a dump
        const pendingDir = join(tmpDir, '.pending');
        writePending(pendingDir, {
            action: 'create',
            title: 'test',
            description: 'desc',
        });

        const result1 = scanCycle(config, db);
        expect(result1.dumpExported).toBe(true);

        // Second cycle: nothing changed
        const result2 = scanCycle(config, db);
        expect(result2.dumpExported).toBe(false);
    });

    it('active question without agent — cycle completes without crashing', () => {
        const q = createQuestion(db, 'needs_agent', 'desc');
        updateStatus(db, q, 'Active');
        db.resetDirty();

        // The spawn attempt may succeed (if tmux available) or fail gracefully.
        // Either way the cycle should complete without crashing.
        const result = scanCycle(config, db);

        // The question should remain Active regardless
        expect(getQuestion(db, q)!.status).toBe('Active');
    });

    it('spawn failure does not crash cycle or affect other steps', () => {
        // Create 4 questions — more than maxAgents (3)
        // Pipeline promotes 3, spawn may fail for some, but cycle completes
        const q1 = createQuestion(db, 'q1', 'desc');
        const q2 = createQuestion(db, 'q2', 'desc');
        const q3 = createQuestion(db, 'q3', 'desc');
        const q4 = createQuestion(db, 'q4', 'desc');
        db.resetDirty();

        const result = scanCycle(config, db);

        // Pipeline should have promoted exactly 3
        expect(result.promoted).toHaveLength(3);
        // q4 stays Awaiting
        expect(getQuestion(db, q4)!.status).toBe('Awaiting');
        // Dump should still be exported (DB was modified by pipeline)
        expect(result.dumpExported).toBe(true);
    });
});

describe('daemon — seed on fresh DB (Fix M)', () => {
    let tmpDir: string;
    const SEED_PATH = join(__dirname, '../../templates/seed.sql');

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-daemon-seed-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('fresh DB without seed → createQuestion crashes (null metadata)', () => {
        const freshDb = new DB(join(tmpDir, 'fresh.db'));
        freshDb.open();
        freshDb.migrate(SCHEMA_PATH);
        // No seed() call — metadata table is empty
        // createQuestion reads metadata counter which returns undefined, causing crash
        expect(() => createQuestion(freshDb, 'test', 'desc')).toThrow();
        freshDb.close();
    });

    it('db.seed() populates metadata so createQuestion works', () => {
        const db = new DB(join(tmpDir, 'seeded.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);

        const row = db.get<{ value: string }>("SELECT value FROM metadata WHERE key = 'lastQuestionCreated'");
        expect(row).toBeDefined();
        expect(parseInt(row!.value, 10)).toBeGreaterThanOrEqual(1);
        db.close();
    });

    it('db.seed() is idempotent — running twice does not duplicate rows', () => {
        const db = new DB(join(tmpDir, 'idempotent.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
        db.seed(SEED_PATH); // Second call — should be a no-op

        const rows = db.all<{ key: string }>("SELECT key FROM metadata");
        expect(rows).toHaveLength(1); // Only one metadata row
        db.close();
    });
});

describe('daemon — detectNewCommits', () => {
    let tmpDir: string;
    let config: Config;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-daemon-commits-'));
        config = makeConfig(tmpDir);
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('does not crash with no lockfiles', () => {
        detectNewCommits(config);
    });

    it('does not crash with stale lockfiles', () => {
        createLockfile(config, { paneId: '%99999', qnum: 1, headCommit: 'oldcommit' });
        detectNewCommits(config);
    });
});
