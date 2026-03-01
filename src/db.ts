import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

export class DB {
    private db: Database.Database | null = null;
    private dirty: boolean = false;
    readonly dbPath: string;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    open(): void {
        this.db = new Database(this.dbPath, { timeout: 5000 });
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    private ensureOpen(): Database.Database {
        if (!this.db) {
            throw new Error('Database not open. Call open() first.');
        }
        return this.db;
    }

    migrate(schemaPath: string): void {
        const db = this.ensureOpen();
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
    }

    seed(seedPath: string): void {
        const db = this.ensureOpen();
        // Only seed if metadata table is empty
        const row = db.prepare("SELECT COUNT(*) AS count FROM metadata").get() as { count: number };
        if (row.count === 0) {
            const sql = readFileSync(seedPath, 'utf-8');
            db.exec(sql);
            this.dirty = true;
        }
    }

    run(sql: string, ...params: unknown[]): Database.RunResult {
        const db = this.ensureOpen();
        this.dirty = true;
        return db.prepare(sql).run(...params);
    }

    get<T>(sql: string, ...params: unknown[]): T | undefined {
        const db = this.ensureOpen();
        return db.prepare(sql).get(...params) as T | undefined;
    }

    all<T>(sql: string, ...params: unknown[]): T[] {
        const db = this.ensureOpen();
        return db.prepare(sql).all(...params) as T[];
    }

    transaction<T>(fn: () => T): T {
        const db = this.ensureOpen();
        return db.transaction(fn)();
    }

    isDirty(): boolean {
        return this.dirty;
    }

    resetDirty(): void {
        this.dirty = false;
    }

    exportDump(dumpPath: string): void {
        execSync(`sqlite3 ${esc(this.dbPath)} .dump > ${esc(dumpPath)}`);
    }

    static importDump(dumpPath: string, dbPath: string): void {
        execSync(`sqlite3 ${esc(dbPath)} < ${esc(dumpPath)}`);
    }
}

/** Shell-escape a string for safe use in commands. */
function esc(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
