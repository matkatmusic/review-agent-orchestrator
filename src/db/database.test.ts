import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from './database.js';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../sql/schema.sql');
const SEED_PATH = join(__dirname, '../../sql/seed.sql');

function createTestDb(): { db: DB; tmpDir: string; cleanup: () => void } {
    const tmpDir = mkdtempSync(join(tmpdir(), 'db-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const db = new DB(dbPath);
    db.open();
    db.migrate(SCHEMA_PATH);
    db.seed(SEED_PATH);
    return {
        db,
        tmpDir,
        cleanup: () => {
            db.close();
            rmSync(tmpDir, { recursive: true, force: true });
        },
    };
}

describe('DB', () => {
    let db: DB;
    let tmpDir: string;
    let cleanup: () => void;

    beforeEach(() => {
        ({ db, tmpDir, cleanup } = createTestDb());
    });

    afterEach(() => {
        cleanup();
    });

    it('creates database file', () => {
        expect(existsSync(join(tmpDir, 'test.db'))).toBe(true);
    });

    it('migration creates all tables', () => {
        const tables = db.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );
        const tableNames = tables.map(t => t.name);
        expect(tableNames).toContain('metadata');
        expect(tableNames).toContain('issues');
        expect(tableNames).toContain('responses');
        expect(tableNames).toContain('dependencies');
        expect(tableNames).toContain('containers');
        expect(tableNames).toContain('issue_containers');
        expect(tableNames).toContain('agent_sessions');
    });

    it('migration is idempotent', () => {
        db.migrate(SCHEMA_PATH);
        db.migrate(SCHEMA_PATH);
        const tables = db.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );
        expect(tables.length).toBe(7);
    });

    it('seed inserts defaults', () => {
        const meta = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'lastIssueCreated'"
        );
        expect(meta?.value).toBe('0');

        const inbox = db.get<{ name: string; type: string }>(
            "SELECT name, type FROM containers WHERE name = 'Inbox'"
        );
        expect(inbox?.name).toBe('Inbox');
        expect(inbox?.type).toBe('group');
    });

    it('seed is idempotent', () => {
        db.seed(SEED_PATH);
        db.seed(SEED_PATH);
        const count = db.get<{ count: number }>(
            "SELECT COUNT(*) AS count FROM metadata"
        );
        // 2 metadata rows: lastIssueCreated + inboxContainerId
        expect(count?.count).toBe(2);
    });

    it('WAL mode is enabled', () => {
        const mode = db.get<{ journal_mode: string }>(
            "PRAGMA journal_mode"
        );
        expect(mode?.journal_mode).toBe('wal');
    });

    it('foreign keys are enabled', () => {
        const fk = db.get<{ foreign_keys: number }>(
            "PRAGMA foreign_keys"
        );
        expect(fk?.foreign_keys).toBe(1);
    });

    it('throws when not open', () => {
        const closedDb = new DB(join(tmpDir, 'closed.db'));
        expect(() => closedDb.run('SELECT 1')).toThrow('Database not open');
    });

    it('open and close lifecycle', () => {
        const db2 = new DB(join(tmpDir, 'lifecycle.db'));
        db2.open();
        db2.run('SELECT 1');
        db2.close();
        expect(() => db2.run('SELECT 1')).toThrow('Database not open');
    });

    it('tracks dirty state', () => {
        db.resetDirty();
        expect(db.isDirty()).toBe(false);

        db.run("INSERT INTO issues (inum, title) VALUES (1, 'test')");
        expect(db.isDirty()).toBe(true);

        db.resetDirty();
        expect(db.isDirty()).toBe(false);
    });

    it('transaction commits on success', () => {
        db.transaction(() => {
            db.run("INSERT INTO issues (inum, title) VALUES (1, 'tx-test')");
        });

        const issue = db.get<{ title: string }>(
            "SELECT title FROM issues WHERE inum = 1"
        );
        expect(issue?.title).toBe('tx-test');
    });

    it('transaction rolls back on error', () => {
        try {
            db.transaction(() => {
                db.run("INSERT INTO issues (inum, title) VALUES (1, 'tx-fail')");
                throw new Error('deliberate');
            });
        } catch {
            // expected
        }

        const issue = db.get<{ title: string }>(
            "SELECT title FROM issues WHERE inum = 1"
        );
        expect(issue).toBeUndefined();
    });

    it('transactionImmediate works', () => {
        db.transactionImmediate(() => {
            db.run("INSERT INTO issues (inum, title) VALUES (1, 'immediate-test')");
        });

        const issue = db.get<{ title: string }>(
            "SELECT title FROM issues WHERE inum = 1"
        );
        expect(issue?.title).toBe('immediate-test');
    });

    it('export and import round-trip', () => {
        // Insert test data
        db.run("INSERT INTO issues (inum, title, description) VALUES (1, 'export-test', 'desc')");
        db.run("INSERT INTO responses (inum, author, body) VALUES (1, 'user', 'hello')");

        // Export
        const dump = db.exportDump();
        expect(dump).toContain('CREATE TABLE');
        expect(dump).toContain('export-test');
        expect(dump).toContain('hello');

        // Import into fresh DB
        const freshDir = mkdtempSync(join(tmpdir(), 'db-import-test-'));
        const freshDb = new DB(join(freshDir, 'imported.db'));
        freshDb.open();
        freshDb.importDump(dump);

        const issue = freshDb.get<{ title: string }>(
            "SELECT title FROM issues WHERE inum = 1"
        );
        expect(issue?.title).toBe('export-test');

        const response = freshDb.get<{ body: string }>(
            "SELECT body FROM responses WHERE inum = 1"
        );
        expect(response?.body).toBe('hello');

        freshDb.close();
        rmSync(freshDir, { recursive: true, force: true });
    });
});

export { createTestDb };
