import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './database.test.js';
import { DB } from './database.js';
import * as issues from './issues.js';
import { IssueStatus } from '../types.js';

describe('issues', () => {
    let db: DB;
    let cleanup: () => void;

    beforeEach(() => {
        ({ db, cleanup } = createTestDb());
    });

    afterEach(() => {
        cleanup();
    });

    it('creates an issue and auto-increments inum', () => {
        const inum1 = issues.createIssue(db, 'First issue', 'Description 1');
        const inum2 = issues.createIssue(db, 'Second issue', 'Description 2');
        expect(inum1).toBe(1);
        expect(inum2).toBe(2);
    });

    it('auto-assigns new issues to Inbox container from metadata', () => {
        const inum = issues.createIssue(db, 'Test', 'Description');
        const row = db.get<{ container_id: number }>(
            'SELECT container_id FROM issue_containers WHERE inum = ?',
            inum
        );
        // Inbox ID should match the value stored in metadata, not a hardcoded constant
        const inboxRow = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'inboxContainerId'"
        );
        expect(inboxRow).toBeDefined();
        expect(row?.container_id).toBe(parseInt(inboxRow!.value, 10));
    });

    it('getByInum returns the issue', () => {
        const inum = issues.createIssue(db, 'Test', 'Description');
        const issue = issues.getByInum(db, inum);
        expect(issue).toBeDefined();
        expect(issue!.title).toBe('Test');
        expect(issue!.description).toBe('Description');
        expect(issue!.status).toBe(IssueStatus.Awaiting);
        expect(issue!.issue_revision).toBe(0);
    });

    it('getByInum returns undefined for missing inum', () => {
        const issue = issues.getByInum(db, 999);
        expect(issue).toBeUndefined();
    });

    it('list returns all issues', () => {
        issues.createIssue(db, 'A', '');
        issues.createIssue(db, 'B', '');
        const all = issues.list(db);
        expect(all).toHaveLength(2);
    });

    it('list filters by status', () => {
        const inum1 = issues.createIssue(db, 'A', '');
        issues.createIssue(db, 'B', '');
        issues.updateStatus(db, inum1, IssueStatus.Active);

        const active = issues.list(db, IssueStatus.Active);
        expect(active).toHaveLength(1);
        expect(active[0].title).toBe('A');

        const awaiting = issues.list(db, IssueStatus.Awaiting);
        expect(awaiting).toHaveLength(1);
        expect(awaiting[0].title).toBe('B');
    });

    it('updateStatus changes status', () => {
        const inum = issues.createIssue(db, 'Test', '');
        issues.updateStatus(db, inum, IssueStatus.Active);
        expect(issues.getByInum(db, inum)!.status).toBe(IssueStatus.Active);
    });

    it('updateStatus to Resolved sets resolved_at', () => {
        const inum = issues.createIssue(db, 'Test', '');
        issues.updateStatus(db, inum, IssueStatus.Resolved);
        const issue = issues.getByInum(db, inum)!;
        expect(issue.status).toBe(IssueStatus.Resolved);
        expect(issue.resolved_at).not.toBeNull();
    });

    it('updateStatus away from Resolved clears resolved_at', () => {
        const inum = issues.createIssue(db, 'Test', '');
        issues.updateStatus(db, inum, IssueStatus.Resolved);
        issues.updateStatus(db, inum, IssueStatus.Awaiting);
        const issue = issues.getByInum(db, inum)!;
        expect(issue.status).toBe(IssueStatus.Awaiting);
        expect(issue.resolved_at).toBeNull();
    });

    it('updateStatus throws for missing issue', () => {
        expect(() => issues.updateStatus(db, 999, IssueStatus.Active)).toThrow('Issue I999 not found');
    });

    it('updateDescription works', () => {
        const inum = issues.createIssue(db, 'Test', 'old');
        issues.updateDescription(db, inum, 'new description');
        expect(issues.getByInum(db, inum)!.description).toBe('new description');
    });

    it('updateDescription throws for missing issue', () => {
        expect(() => issues.updateDescription(db, 999, 'nope')).toThrow('Issue I999 not found');
    });

    it('incrementRevision increments and returns new value', () => {
        const inum = issues.createIssue(db, 'Test', '');
        expect(issues.getByInum(db, inum)!.issue_revision).toBe(0);

        const rev1 = issues.incrementRevision(db, inum);
        expect(rev1).toBe(1);

        const rev2 = issues.incrementRevision(db, inum);
        expect(rev2).toBe(2);
    });

    it('markViewed sets user_last_viewed_at', () => {
        const inum = issues.createIssue(db, 'Test', '');
        expect(issues.getByInum(db, inum)!.user_last_viewed_at).toBeNull();

        issues.markViewed(db, inum);
        const issue = issues.getByInum(db, inum)!;
        expect(issue.user_last_viewed_at).not.toBeNull();
    });

    it('markViewed throws for missing issue', () => {
        expect(() => issues.markViewed(db, 999)).toThrow('Issue I999 not found');
    });

    it('getActiveCount returns count of active issues', () => {
        expect(issues.getActiveCount(db)).toBe(0);

        const inum1 = issues.createIssue(db, 'A', '');
        const inum2 = issues.createIssue(db, 'B', '');
        issues.updateStatus(db, inum1, IssueStatus.Active);
        issues.updateStatus(db, inum2, IssueStatus.Active);

        expect(issues.getActiveCount(db)).toBe(2);
    });

    it('getStatusCounts returns all status counts', () => {
        issues.createIssue(db, 'A', '');
        issues.createIssue(db, 'B', '');
        const inum3 = issues.createIssue(db, 'C', '');
        issues.updateStatus(db, inum3, IssueStatus.Resolved);

        const counts = issues.getStatusCounts(db);
        expect(counts[IssueStatus.Awaiting]).toBe(2);
        expect(counts[IssueStatus.Resolved]).toBe(1);
        expect(counts[IssueStatus.Active]).toBe(0);
        expect(counts[IssueStatus.Blocked]).toBe(0);
        expect(counts[IssueStatus.Deferred]).toBe(0);
    });
});
