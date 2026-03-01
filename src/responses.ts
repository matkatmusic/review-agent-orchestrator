import type { DB } from './db.js';
import type { Response } from './types.js';

export function addResponse(
    db: DB,
    qnum: number,
    author: 'user' | 'agent',
    body: string
): number {
    const result = db.run(
        'INSERT INTO responses (qnum, author, body) VALUES (?, ?, ?)',
        qnum,
        author,
        body
    );
    return Number(result.lastInsertRowid);
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
