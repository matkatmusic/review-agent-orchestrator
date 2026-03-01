import type { DB } from './db.js';
import type { Response } from './types.js';

export function addResponse(
    db: DB,
    qnum: number,
    author: 'user' | 'agent',
    body: string
): number {
    return db.transaction(() => {
        const result = db.run(
            'INSERT INTO responses (qnum, author, body) VALUES (?, ?, ?)',
            qnum,
            author,
            body
        );
        // Update response tracking columns on the question
        const col = author === 'user' ? 'last_user_response' : 'last_agent_response';
        db.run(
            `UPDATE questions SET ${col} = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), last_responder = ? WHERE qnum = ?`,
            author,
            qnum
        );
        return Number(result.lastInsertRowid);
    });
}

export function listResponses(db: DB, qnum: number): Response[] {
    return db.all<Response>(
        'SELECT * FROM responses WHERE qnum = ? ORDER BY created_at, id',
        qnum
    );
}

export function getLatestResponse(db: DB, qnum: number): Response | undefined {
    return db.get<Response>(
        'SELECT * FROM responses WHERE qnum = ? ORDER BY created_at DESC, id DESC LIMIT 1',
        qnum
    );
}

export function hasUnreadAgentResponse(db: DB, qnum: number): boolean {
    const latest = getLatestResponse(db, qnum);
    if (!latest) return false;
    return latest.author === 'agent';
}

/**
 * Bulk query: return the set of qnums whose latest response is from 'agent'.
 * Single SQL query — avoids N+1 when checking many questions.
 */
export function getUnreadQnums(db: DB): Set<number> {
    const rows = db.all<{ qnum: number }>(
        `SELECT r.qnum FROM responses r
         INNER JOIN (
             SELECT qnum, MAX(id) AS max_id FROM responses GROUP BY qnum
         ) latest ON r.qnum = latest.qnum AND r.id = latest.max_id
         WHERE r.author = 'agent'`
    );
    return new Set(rows.map(r => r.qnum));
}

/**
 * Check if a reprompt is needed for a question.
 * Returns true if the last responder is 'user', meaning there's a user
 * response that hasn't been delivered to the agent yet.
 */
export function needsReprompt(db: DB, qnum: number): boolean {
    const q = db.get<{ last_responder: string | null }>(
        'SELECT last_responder FROM questions WHERE qnum = ?',
        qnum
    );
    if (!q) return false;
    return q.last_responder === 'user';
}

/**
 * Mark that we sent a reprompt for a question's current user response.
 * Clears the last_responder flag so the daemon won't re-send.
 * When the agent actually responds, last_responder will be set to 'agent'.
 */
export function markReprompted(db: DB, qnum: number): void {
    db.run(
        "UPDATE questions SET last_reprompted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), last_responder = NULL WHERE qnum = ?",
        qnum
    );
}
