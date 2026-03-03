import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

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

    transactionImmediate<T>(fn: () => T): T {
        const db = this.ensureOpen();
        return db.transaction(fn).immediate();
    }

    isDirty(): boolean {
        return this.dirty;
    }

    resetDirty(): void {
        this.dirty = false;
    }

    /**
     * Export database to a SQL dump file (programmatic, no shell-out).
     */
    exportDump(): string {
        const db = this.ensureOpen();
        const lines: string[] = [];

        // Get all table schemas
        const tables = db.prepare(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all() as { name: string; sql: string }[];

        for (const table of tables) {
            lines.push(`${table.sql};`);
            lines.push('');

            // Get all rows
            const rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Record<string, unknown>[];
            for (const row of rows) {
                const columns = Object.keys(row);
                const values = columns.map(col => {
                    const val = row[col];
                    if (val === null) return 'NULL';
                    if (typeof val === 'number' || typeof val === 'bigint') return String(val);
                    return `'${String(val).replace(/'/g, "''")}'`;
                });
                lines.push(`INSERT INTO "${table.name}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`);
            }
            lines.push('');
        }

        // Export indexes
        const indexes = db.prepare(
            "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name"
        ).all() as { sql: string }[];
        for (const idx of indexes) {
            lines.push(`${idx.sql};`);
        }
        if (indexes.length > 0) lines.push('');

        return lines.join('\n');
    }

    /**
     * Import a SQL dump string into the database.
     */
    importDump(sql: string): void {
        const db = this.ensureOpen();
        db.exec(sql);
        this.dirty = true;
    }
}
