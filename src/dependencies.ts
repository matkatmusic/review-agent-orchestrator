import type { DB } from './db.js';
import type { Question } from './types.js';

export function addBlocker(db: DB, blocked: number, blocker: number): void {
    if (blocked === blocker) {
        throw new Error('A question cannot block itself');
    }
    // Detect cycles: walk the dependency graph from `blocker` to see if it
    // transitively depends on `blocked`. If so, adding this edge would create a cycle.
    if (wouldCreateCycle(db, blocked, blocker)) {
        throw new Error(
            `Adding Q${blocker} as blocker of Q${blocked} would create a circular dependency`
        );
    }
    db.run(
        'INSERT OR IGNORE INTO dependencies (blocked_qnum, blocker_qnum) VALUES (?, ?)',
        blocked,
        blocker
    );
}

/**
 * Check if adding an edge (blocked → blocker) would create a cycle.
 * Returns true if `blocker` is already transitively blocked by `blocked`.
 */
function wouldCreateCycle(db: DB, blocked: number, blocker: number): boolean {
    const row = db.get<{ cycle: number }>(
        `WITH RECURSIVE chain(qnum) AS (
            SELECT ? -- start from blocker
            UNION
            SELECT d.blocker_qnum FROM dependencies d
            JOIN chain c ON d.blocked_qnum = c.qnum
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE qnum = ?) AS cycle`,
        blocker,
        blocked
    );
    return row?.cycle === 1;
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
    const candidates = db.all<{ qnum: number }>(
        'SELECT qnum FROM questions WHERE "group" = ? AND qnum != ?',
        group,
        blocked
    );
    for (const c of candidates) {
        try {
            addBlocker(db, blocked, c.qnum);
        } catch {
            // skip if would create cycle or self-ref
        }
    }
}
