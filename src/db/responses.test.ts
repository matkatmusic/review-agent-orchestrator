import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './database.test.js';
import { DB } from './database.js';
import * as responses from './responses.js';
import * as issues from './issues.js';

describe('responses', () => {
    let db: DB;
    let cleanup: () => void;
    let inum: number;

    beforeEach(() => {
        ({ db, cleanup } = createTestDb());
        inum = issues.createIssue(db, 'Test Issue', 'description');
    });

    afterEach(() => {
        cleanup();
    });

    it('creates a response and returns id', () => {
        const id = responses.create(db, inum, 'user', 'Hello');
        expect(id).toBeGreaterThan(0);
    });

    it('creates a response with type and stores it', () => {
        responses.create(db, inum, 'agent', 'Analyzing code', 'analysis');
        const list = responses.listByInum(db, inum);
        expect(list[0].type).toBe('analysis');
        expect(list[0].body).toBe('Analyzing code');
    });

    it('creates a response without type as none', () => {
        responses.create(db, inum, 'user', 'Hello');
        const list = responses.listByInum(db, inum);
        expect(list[0].type).toBe('none');
    });

    it('listByInum returns responses in order', () => {
        responses.create(db, inum, 'user', 'First');
        responses.create(db, inum, 'agent', 'Second');
        responses.create(db, inum, 'user', 'Third');

        const list = responses.listByInum(db, inum);
        expect(list).toHaveLength(3);
        expect(list[0].body).toBe('First');
        expect(list[0].author).toBe('user');
        expect(list[1].body).toBe('Second');
        expect(list[1].author).toBe('agent');
        expect(list[2].body).toBe('Third');
    });

    it('listByInum returns empty for issue with no responses', () => {
        const list = responses.listByInum(db, inum);
        expect(list).toHaveLength(0);
    });

    it('getLatestByInum returns the most recent response', () => {
        responses.create(db, inum, 'user', 'First');
        responses.create(db, inum, 'agent', 'Latest');

        const latest = responses.getLatestByInum(db, inum);
        expect(latest).toBeDefined();
        expect(latest!.body).toBe('Latest');
        expect(latest!.author).toBe('agent');
    });

    it('getLatestByInum returns undefined for no responses', () => {
        const latest = responses.getLatestByInum(db, inum);
        expect(latest).toBeUndefined();
    });

    it('getUnreadInums returns inums with agent responses after last viewed', () => {
        const inum2 = issues.createIssue(db, 'Issue 2', '');

        // inum has agent response, never viewed — unread
        responses.create(db, inum, 'user', 'Hello');
        responses.create(db, inum, 'agent', 'Reply');

        // inum2 has agent response but was viewed after — not unread
        // Set response timestamp to the past so markViewed is strictly after it
        const id2 = responses.create(db, inum2, 'agent', 'First');
        db.run(
            "UPDATE responses SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 second') WHERE id = ?",
            id2
        );
        issues.markViewed(db, inum2);

        const unread = responses.getUnreadInums(db);
        expect(unread.has(inum)).toBe(true);
        expect(unread.has(inum2)).toBe(false);
    });

    it('getUnreadInums returns empty set when no responses', () => {
        const unread = responses.getUnreadInums(db);
        expect(unread.size).toBe(0);
    });

    it('hasUnread returns true when agent response exists and user never viewed', () => {
        responses.create(db, inum, 'agent', 'Reply');
        expect(responses.hasUnread(db, inum)).toBe(true);
    });

    it('hasUnread returns false after user views the issue', () => {
        // Set response timestamp to the past so markViewed is strictly after it
        const id = responses.create(db, inum, 'agent', 'Reply');
        db.run(
            "UPDATE responses SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 second') WHERE id = ?",
            id
        );
        issues.markViewed(db, inum);
        expect(responses.hasUnread(db, inum)).toBe(false);
    });

    it('hasUnread returns true when new agent response arrives after viewing', () => {
        responses.create(db, inum, 'agent', 'First reply');
        issues.markViewed(db, inum);
        // Simulate a response arriving after the view — must have a later timestamp.
        // In production these are separated by seconds/minutes; in tests they share
        // the same second, so we set created_at explicitly to a future time.
        const id = responses.create(db, inum, 'agent', 'Second reply');
        db.run(
            "UPDATE responses SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 second') WHERE id = ?",
            id
        );
        expect(responses.hasUnread(db, inum)).toBe(true);
    });

    it('hasUnread returns false when no responses', () => {
        expect(responses.hasUnread(db, inum)).toBe(false);
    });

    it('hasUnread returns false when only user responses exist', () => {
        responses.create(db, inum, 'user', 'Hello');
        expect(responses.hasUnread(db, inum)).toBe(false);
    });

    it('rejects response for nonexistent issue', () => {
        expect(() => responses.create(db, 999, 'user', 'Bad')).toThrow();
    });

    it('rejects invalid author', () => {
        expect(() => responses.create(db, inum, 'invalid' as 'user', 'Bad')).toThrow();
    });
});
