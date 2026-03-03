import type { DB } from './database.js';
import type { Issue } from '../types.js';

/**
 * Check if adding an edge (blocked → blocker) would create a cycle.
 * Uses a recursive CTE to walk the dependency graph from the proposed blocker
 * and check if it transitively depends on the blocked issue.
 */
function wouldCreateCycle(db: DB, blockedInum: number, blockerInum: number): boolean {
    const row = db.get<{ cycle: number }>(
        `WITH RECURSIVE chain(inum) AS (
            SELECT ?
            UNION
            SELECT d.blocker_inum FROM dependencies d
            JOIN chain c ON d.blocked_inum = c.inum
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE inum = ?) AS cycle`,
        blockerInum,
        blockedInum
    );
    return row?.cycle === 1;
}

export function addBlock(db: DB, blockedInum: number, blockerInum: number): void {
    if (blockedInum === blockerInum) {
        throw new Error('An issue cannot block itself');
    }
    // Validate both issues exist and blocked issue is not Resolved
    const blocked = db.get<{ inum: number; status: string }>('SELECT inum, status FROM issues WHERE inum = ?', blockedInum);
    if (!blocked) {
        throw new Error(`Issue I${blockedInum} not found`);
    }
    if (blocked.status === 'Resolved') {
        throw new Error(`Cannot block a Resolved issue (I${blockedInum})`);
    }
    const blocker = db.get<{ inum: number }>('SELECT inum FROM issues WHERE inum = ?', blockerInum);
    if (!blocker) {
        throw new Error(`Issue I${blockerInum} not found`);
    }
    if (wouldCreateCycle(db, blockedInum, blockerInum)) {
        throw new Error(
            `Adding I${blockerInum} as blocker of I${blockedInum} would create a circular dependency`
        );
    }
    // OR IGNORE only handles duplicate PK (idempotent add)
    db.run(
        'INSERT OR IGNORE INTO dependencies (blocker_inum, blocked_inum) VALUES (?, ?)',
        blockerInum,
        blockedInum
    );
}

export function removeBlock(db: DB, blockedInum: number, blockerInum: number): void {
    db.run(
        'DELETE FROM dependencies WHERE blocker_inum = ? AND blocked_inum = ?',
        blockerInum,
        blockedInum
    );
}

export function getBlockersFor(db: DB, inum: number): Issue[] {
    return db.all<Issue>(
        `SELECT i.* FROM issues i
         JOIN dependencies d ON d.blocker_inum = i.inum
         WHERE d.blocked_inum = ?
         ORDER BY i.inum`,
        inum
    );
}

export function getBlockedBy(db: DB, inum: number): Issue[] {
    return db.all<Issue>(
        `SELECT i.* FROM issues i
         JOIN dependencies d ON d.blocked_inum = i.inum
         WHERE d.blocker_inum = ?
         ORDER BY i.inum`,
        inum
    );
}

export function isBlocked(db: DB, inum: number): boolean {
    const row = db.get<{ blocked: number }>(
        `SELECT EXISTS(
            SELECT 1 FROM dependencies d
            JOIN issues i ON d.blocker_inum = i.inum
            WHERE d.blocked_inum = ? AND i.status != 'Resolved'
        ) AS blocked`,
        inum
    );
    return row?.blocked === 1;
}
