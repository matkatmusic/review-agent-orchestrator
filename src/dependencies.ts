import type { DB } from './db.js';
import type { Question } from './types.js';

export function addBlocker(db: DB, blocked: number, blocker: number): void {
    if (blocked === blocker) {
        throw new Error('A question cannot block itself');
    }
    db.run(
        'INSERT OR IGNORE INTO dependencies (blocked_qnum, blocker_qnum) VALUES (?, ?)',
        blocked,
        blocker
    );
}

export function removeBlocker(db: DB, blocked: number, blocker: number): void {
    db.run(
        'DELETE FROM dependencies WHERE blocked_qnum = ? AND blocker_qnum = ?',
        blocked,
        blocker
    );
}

export function isBlocked(db: DB, qnum: number): boolean {
    const row = db.get<{ blocked: number }>(
        `SELECT EXISTS(
            SELECT 1 FROM dependencies d
            JOIN questions q ON d.blocker_qnum = q.qnum
            WHERE d.blocked_qnum = ? AND q.status != 'Resolved'
        ) AS blocked`,
        qnum
    );
    return row?.blocked === 1;
}

export function getBlockers(db: DB, qnum: number): Question[] {
    return db.all<Question>(
        `SELECT q.* FROM questions q
         JOIN dependencies d ON d.blocker_qnum = q.qnum
         WHERE d.blocked_qnum = ?
         ORDER BY q.qnum`,
        qnum
    );
}

export function getBlocked(db: DB, qnum: number): Question[] {
    return db.all<Question>(
        `SELECT q.* FROM questions q
         JOIN dependencies d ON d.blocked_qnum = q.qnum
         WHERE d.blocker_qnum = ?
         ORDER BY q.qnum`,
        qnum
    );
}

export function blockByGroup(db: DB, blocked: number, group: string): void {
    db.run(
        `INSERT OR IGNORE INTO dependencies (blocked_qnum, blocker_qnum)
         SELECT ?, q.qnum FROM questions q WHERE q."group" = ?`,
        blocked,
        group
    );
}
