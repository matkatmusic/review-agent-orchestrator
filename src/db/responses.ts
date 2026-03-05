import type { DB } from './database.js';
import type { ResponseRow } from '../types.js';

export interface CreateResponseOpts {
    type?: string;
    respondingToId?: number;
    replyingToId?: number;
    isContinuation?: boolean;
}

export function create(
    db: DB,
    inum: number,
    author: 'user' | 'agent',
    body: string,
    opts?: string | CreateResponseOpts
): number {
    // Backward compat: opts can be a plain string (type) for existing callers
    const resolved: CreateResponseOpts = typeof opts === 'string'
        ? { type: opts }
        : opts ?? {};

    const type = resolved.type ?? 'none';
    const respondingToId = resolved.respondingToId ?? null;
    const replyingToId = resolved.replyingToId ?? null;
    const isContinuation = resolved.isContinuation ? 1 : 0;

    const result = db.run(
        `INSERT INTO responses (inum, author, type, body, responding_to_id, replying_to_id, is_continuation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        inum,
        author,
        type,
        body,
        respondingToId,
        replyingToId,
        isContinuation
    );
    return Number(result.lastInsertRowid);
}

export function listByInum(db: DB, inum: number): ResponseRow[] {
    return db.all<ResponseRow>(
        'SELECT * FROM responses WHERE inum = ? ORDER BY created_at, id',
        inum
    );
}

export function getLatestByInum(db: DB, inum: number): ResponseRow | undefined {
    return db.get<ResponseRow>(
        'SELECT * FROM responses WHERE inum = ? ORDER BY created_at DESC, id DESC LIMIT 1',
        inum
    );
}

/**
 * Check if an issue has unread agent responses for the user.
 * "Unread" = there exists an agent response created at or after the user's
 * last viewed timestamp (or any agent response if never viewed).
 * Uses >= to avoid false negatives from same-second timestamp granularity.
 */
export function hasUnread(db: DB, inum: number): boolean {
    const row = db.get<{ unread: number }>(
        `SELECT EXISTS(
            SELECT 1 FROM responses r
            JOIN issues i ON r.inum = i.inum
            WHERE r.inum = ? AND r.author = 'agent'
            AND (i.user_last_viewed_at IS NULL OR r.created_at >= i.user_last_viewed_at)
        ) AS unread`,
        inum
    );
    return row?.unread === 1;
}

/**
 * Bulk query: return the set of inums with unread agent responses.
 * "Unread" = agent response exists at or after user_last_viewed_at (or any if NULL).
 * Uses >= to avoid false negatives from same-second timestamp granularity.
 */
export function getUnreadInums(db: DB): Set<number> {
    const rows = db.all<{ inum: number }>(
        `SELECT DISTINCT r.inum FROM responses r
         JOIN issues i ON r.inum = i.inum
         WHERE r.author = 'agent'
         AND (i.user_last_viewed_at IS NULL OR r.created_at >= i.user_last_viewed_at)`
    );
    return new Set(rows.map(r => r.inum));
}
