import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './database.test.js';
import { DB } from './database.js';
import * as sessions from './agent-sessions.js';
import * as issues from './issues.js';

describe('agent-sessions', () => {
    let db: DB;
    let cleanup: () => void;
    let inum: number;

    beforeEach(() => {
        ({ db, cleanup } = createTestDb());
        inum = issues.createIssue(db, 'Test Issue', '');
    });

    afterEach(() => {
        cleanup();
    });

    it('creates a session', () => {
        sessions.create(db, inum, '%42', 'abc123');
        const session = sessions.getByInum(db, inum);
        expect(session).toBeDefined();
        expect(session!.pane_id).toBe('%42');
        expect(session!.head_commit).toBe('abc123');
    });

    it('creates a session with default head_commit', () => {
        sessions.create(db, inum, '%42');
        const session = sessions.getByInum(db, inum);
        expect(session!.head_commit).toBe('unknown');
    });

    it('getByInum returns undefined for no session', () => {
        const session = sessions.getByInum(db, inum);
        expect(session).toBeUndefined();
    });

    it('removes a session', () => {
        sessions.create(db, inum, '%42');
        sessions.remove(db, inum);
        expect(sessions.getByInum(db, inum)).toBeUndefined();
    });

    it('removing nonexistent session is a no-op', () => {
        sessions.remove(db, inum); // should not throw
    });

    it('listActive returns all sessions', () => {
        const inum2 = issues.createIssue(db, 'Issue 2', '');
        sessions.create(db, inum, '%42');
        sessions.create(db, inum2, '%43');

        const list = sessions.listActive(db);
        expect(list).toHaveLength(2);
    });

    it('rejects duplicate session for same inum', () => {
        sessions.create(db, inum, '%42');
        expect(() => sessions.create(db, inum, '%43')).toThrow();
    });

    it('rejects session for nonexistent issue', () => {
        expect(() => sessions.create(db, 999, '%42')).toThrow();
    });
});
