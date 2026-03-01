import type { DB } from './db.js';
import type { Question } from './types.js';
import { isBlocked } from './dependencies.js';
import { listByStatus, updateStatus, getActiveCount } from './questions.js';

/**
 * Move Awaiting/Active questions that have unresolved blockers to Deferred.
 * Returns the qnums that were moved.
 */
export function enforceBlocked(db: DB): number[] {
    const moved: number[] = [];
    const candidates = [
        ...listByStatus(db, 'Awaiting'),
        ...listByStatus(db, 'Active'),
    ];

    for (const q of candidates) {
        if (isBlocked(db, q.qnum)) {
            updateStatus(db, q.qnum, 'Deferred');
            moved.push(q.qnum);
        }
    }

    return moved;
}

/**
 * Move Deferred questions whose blockers are ALL resolved back to Awaiting.
 * Only auto-unblocks questions that HAVE dependency entries — user-deferred
 * questions (no deps) stay in Deferred.
 * Returns the qnums that were moved.
 */
export function autoUnblock(db: DB): number[] {
    const moved: number[] = [];

    // Find Deferred questions that have at least one dependency entry
    const candidates = db.all<Question>(
        `SELECT DISTINCT q.* FROM questions q
         JOIN dependencies d ON d.blocked_qnum = q.qnum
         WHERE q.status = 'Deferred'
         ORDER BY q.qnum`
    );

    for (const q of candidates) {
        if (!isBlocked(db, q.qnum)) {
            updateStatus(db, q.qnum, 'Awaiting');
            moved.push(q.qnum);
        }
    }

    return moved;
}

/**
 * Promote Awaiting questions to Active up to maxAgents capacity.
 * Returns the qnums that were promoted.
 */
export function promoteAwaiting(db: DB, maxAgents: number): number[] {
    const promoted: number[] = [];
    const currentActive = getActiveCount(db);
    const slots = maxAgents - currentActive;

    if (slots <= 0) return promoted;

    const awaiting = listByStatus(db, 'Awaiting');

    for (let i = 0; i < Math.min(slots, awaiting.length); i++) {
        updateStatus(db, awaiting[i]!.qnum, 'Active');
        promoted.push(awaiting[i]!.qnum);
    }

    return promoted;
}

/**
 * Run the full pipeline: enforce → unblock → promote.
 */
export function runPipeline(db: DB, maxAgents: number): {
    enforced: number[];
    unblocked: number[];
    promoted: number[];
} {
    const enforced = enforceBlocked(db);
    const unblocked = autoUnblock(db);
    const promoted = promoteAwaiting(db, maxAgents);
    return { enforced, unblocked, promoted };
}
