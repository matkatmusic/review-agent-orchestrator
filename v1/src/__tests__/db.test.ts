import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');
const SEED_PATH = join(__dirname, '../../templates/seed.sql');

describe('DB', () => {
    let tmpDir: string;
    let dbPath: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-db-test-'));
        dbPath = join(tmpDir, 'test.db');
        db = new DB(dbPath);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates database in temp dir', () => {
        db.open();
        expect(existsSync(dbPath)).toBe(true);
    });

    it('runs schema migration', () => {
        db.open();
        db.migrate(SCHEMA_PATH);

        const tables = db.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        const tableNames = tables.map(t => t.name);
        expect(tableNames).toContain('metadata');
        expect(tableNames).toContain('questions');
        expect(tableNames).toContain('responses');
        expect(tableNames).toContain('dependencies');
    });

    it('migration is idempotent', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.migrate(SCHEMA_PATH);

        const tables = db.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        expect(tables.map(t => t.name)).toContain('questions');
    });

    it('seeds data', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);

        const meta = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'lastQuestionCreated'"
        );
        expect(meta?.value).toBe('1');

        const question = db.get<{ qnum: number; title: string }>(
            "SELECT qnum, title FROM questions WHERE qnum = 1"
        );
        expect(question?.qnum).toBe(1);
        expect(question?.title).toBe('getting_started');

        const response = db.get<{ author: string; qnum: number }>(
            "SELECT author, qnum FROM responses WHERE qnum = 1"
        );
        expect(response?.author).toBe('agent');
    });

    it('seed is idempotent — skips if metadata exists', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
        db.seed(SEED_PATH);

        const rows = db.all<{ qnum: number }>("SELECT qnum FROM questions");
        expect(rows).toHaveLength(1);
    });

    it('round-trip: export dump → delete DB → import dump → data intact', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);

        // Add extra data to verify round-trip
        db.run(
            "INSERT INTO questions (qnum, title, description, status) VALUES (2, 'test_q', 'test desc', 'Awaiting')"
        );
        db.run(
            "INSERT INTO responses (qnum, author, body) VALUES (2, 'user', 'hello')"
        );

        const dumpPath = join(tmpDir, 'test.dump.sql');
        db.exportDump(dumpPath);
        expect(existsSync(dumpPath)).toBe(true);

        // Close and delete the DB
        db.close();
        rmSync(dbPath, { force: true });
        // Also remove WAL/journal files
        rmSync(dbPath + '-wal', { force: true });
        rmSync(dbPath + '-shm', { force: true });
        expect(existsSync(dbPath)).toBe(false);

        // Import from dump
        const dbPath2 = join(tmpDir, 'restored.db');
        DB.importDump(dumpPath, dbPath2);

        const db2 = new DB(dbPath2);
        db2.open();

        const meta = db2.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'lastQuestionCreated'"
        );
        expect(meta?.value).toBe('1');

        const questions = db2.all<{ qnum: number; title: string }>(
            "SELECT qnum, title FROM questions ORDER BY qnum"
        );
        expect(questions).toHaveLength(2);
        expect(questions[0]!.title).toBe('getting_started');
        expect(questions[1]!.title).toBe('test_q');

        const responses = db2.all<{ qnum: number; author: string }>(
            "SELECT qnum, author FROM responses ORDER BY id"
        );
        expect(responses).toHaveLength(2);
        expect(responses[0]!.author).toBe('agent');
        expect(responses[1]!.author).toBe('user');

        db2.close();
    });

    it('isDirty() tracks write operations', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
        db.resetDirty();

        expect(db.isDirty()).toBe(false);

        // Read operations should NOT set dirty
        db.get("SELECT * FROM metadata WHERE key = 'lastQuestionCreated'");
        db.all("SELECT * FROM questions");
        expect(db.isDirty()).toBe(false);

        // Write operation should set dirty
        db.run("UPDATE metadata SET value = '2' WHERE key = 'lastQuestionCreated'");
        expect(db.isDirty()).toBe(true);

        // resetDirty clears the flag
        db.resetDirty();
        expect(db.isDirty()).toBe(false);
    });

    it('seed sets dirty flag', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.resetDirty();

        db.seed(SEED_PATH);
        expect(db.isDirty()).toBe(true);
    });

    it('throws when not open', () => {
        expect(() => db.run("SELECT 1")).toThrow('Database not open');
        expect(() => db.get("SELECT 1")).toThrow('Database not open');
        expect(() => db.all("SELECT 1")).toThrow('Database not open');
    });

    it('enforces foreign keys', () => {
        db.open();
        db.migrate(SCHEMA_PATH);

        expect(() => {
            db.run("INSERT INTO responses (qnum, author, body) VALUES (999, 'user', 'orphan')");
        }).toThrow();
    });

    it('transaction commits on success', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);

        const result = db.transaction(() => {
            db.run("UPDATE metadata SET value = '99' WHERE key = 'lastQuestionCreated'");
            return 'ok';
        });

        expect(result).toBe('ok');
        const meta = db.get<{ value: string }>("SELECT value FROM metadata WHERE key = 'lastQuestionCreated'");
        expect(meta?.value).toBe('99');
    });

    it('transaction rolls back on error', () => {
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);

        expect(() => db.transaction(() => {
            db.run("UPDATE metadata SET value = '99' WHERE key = 'lastQuestionCreated'");
            throw new Error('forced failure');
        })).toThrow('forced failure');

        const meta = db.get<{ value: string }>("SELECT value FROM metadata WHERE key = 'lastQuestionCreated'");
        expect(meta?.value).toBe('1');
    });

    it('opens with busy timeout for concurrent access safety', () => {
        db.open();
        // better-sqlite3 exposes timeout via pragma busy_timeout
        const row = db.get<{ timeout: number }>("PRAGMA busy_timeout");
        expect(row?.timeout).toBe(5000);
    });

    it('exportDump/importDump handle paths with special characters', () => {
        // Create DB in a path with $, spaces, and backticks to verify no command injection
        const specialDir = mkdtempSync(join(tmpdir(), 'qr-db-$pecial `test`-'));
        const specialDbPath = join(specialDir, 'test db.db');
        const specialDb = new DB(specialDbPath);
        specialDb.open();
        specialDb.migrate(SCHEMA_PATH);
        specialDb.seed(SEED_PATH);

        const dumpPath = join(specialDir, 'dump $file.sql');
        specialDb.exportDump(dumpPath);
        expect(existsSync(dumpPath)).toBe(true);

        // Import into another special path
        const importDbPath = join(specialDir, 'restored `db`.db');
        DB.importDump(dumpPath, importDbPath);

        const restoredDb = new DB(importDbPath);
        restoredDb.open();
        const meta = restoredDb.get<{ value: string }>("SELECT value FROM metadata WHERE key = 'lastQuestionCreated'");
        expect(meta?.value).toBe('1');
        restoredDb.close();

        specialDb.close();
        rmSync(specialDir, { recursive: true, force: true });
    });
});
