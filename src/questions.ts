import type { DB } from './db.js';
import type { Question } from './types.js';

export function createQuestion(
    db: DB,
    title: string,
    description: string,
    group?: string
): number {
    // Increment lastQuestionCreated counter
    db.run(
        "UPDATE metadata SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'lastQuestionCreated'"
    );
    const row = db.get<{ value: string }>(
        "SELECT value FROM metadata WHERE key = 'lastQuestionCreated'"
    );
    const qnum = parseInt(row!.value, 10);

    db.run(
        'INSERT INTO questions (qnum, title, description, "group") VALUES (?, ?, ?, ?)',
        qnum,
        title,
        description,
        group ?? null
    );

    return qnum;
}

export function getQuestion(db: DB, qnum: number): Question | undefined {
    return db.get<Question>('SELECT * FROM questions WHERE qnum = ?', qnum);
}

export function listByStatus(db: DB, status: string): Question[] {
    return db.all<Question>(
        'SELECT * FROM questions WHERE status = ? ORDER BY qnum',
        status
    );
}

export function listAll(db: DB): Question[] {
    return db.all<Question>('SELECT * FROM questions ORDER BY qnum');
}

export function updateStatus(db: DB, qnum: number, status: string): void {
    if (status === 'Resolved') {
        db.run(
            "UPDATE questions SET status = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE qnum = ?",
            status,
            qnum
        );
    } else {
        db.run(
            'UPDATE questions SET status = ?, resolved_at = NULL WHERE qnum = ?',
            status,
            qnum
        );
    }
}

export function getActiveCount(db: DB): number {
    const row = db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM questions WHERE status = 'Active'"
    );
    return row?.count ?? 0;
}

export function getGroup(db: DB, group: string): Question[] {
    return db.all<Question>(
        'SELECT * FROM questions WHERE "group" = ? ORDER BY qnum',
        group
    );
}

export function isGroupResolved(db: DB, group: string): boolean {
    const row = db.get<{ total: number; resolved: number }>(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN status = 'Resolved' THEN 1 END) AS resolved
         FROM questions WHERE "group" = ?`,
        group
    );
    if (!row || row.total === 0) return false;
    return row.total === row.resolved;
}
