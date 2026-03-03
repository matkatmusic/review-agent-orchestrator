import type { DB } from './database.js';
import type { AgentSession } from '../types.js';

export function create(db: DB, inum: number, paneId: string, headCommit?: string): void {
    db.run(
        'INSERT INTO agent_sessions (inum, pane_id, head_commit) VALUES (?, ?, ?)',
        inum,
        paneId,
        headCommit ?? 'unknown'
    );
}

export function getByInum(db: DB, inum: number): AgentSession | undefined {
    return db.get<AgentSession>(
        'SELECT * FROM agent_sessions WHERE inum = ?',
        inum
    );
}

export function remove(db: DB, inum: number): void {
    db.run('DELETE FROM agent_sessions WHERE inum = ?', inum);
}

export function listActive(db: DB): AgentSession[] {
    return db.all<AgentSession>(
        'SELECT * FROM agent_sessions ORDER BY inum'
    );
}
