import { describe, it, expect } from 'vitest';
import { IssueStatus, type Issue } from '../types.js';
import { getStatus, getColorForStatus } from './status-utils.js';

function makeIssue(overrides: Partial<Issue> & { inum: number }): Issue {
    return {
        title: `Issue ${overrides.inum}`,
        description: '',
        status: IssueStatus.Active,
        created_at: '2026-01-01T00:00:00Z',
        resolved_at: null,
        trashed_at: null,
        issue_revision: 1,
        agent_last_read_at: null,
        user_last_viewed_at: null,
        blocked_by: [],
        ...overrides,
    };
}

describe('getStatus', () => {
    it('returns stored status when no blockers', () => {
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [] });
        expect(getStatus(issue, [issue])).toBe(IssueStatus.Active);
    });

    it('returns stored status when blocked_by is empty', () => {
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [] });
        expect(getStatus(issue, [issue])).toBe(IssueStatus.InQueue);
    });

    it('returns Blocked when any blocker is Active', () => {
        const blocker = makeIssue({ inum: 2, status: IssueStatus.Active });
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [2] });
        expect(getStatus(issue, [issue, blocker])).toBe(IssueStatus.Blocked);
    });

    it('returns Blocked when any blocker is InQueue', () => {
        const blocker = makeIssue({ inum: 2, status: IssueStatus.InQueue });
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [2] });
        expect(getStatus(issue, [issue, blocker])).toBe(IssueStatus.Blocked);
    });

    it('returns Blocked when any blocker is Deferred', () => {
        const blocker = makeIssue({ inum: 2, status: IssueStatus.Deferred });
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [2] });
        expect(getStatus(issue, [issue, blocker])).toBe(IssueStatus.Blocked);
    });

    it('returns stored status when all blockers are Resolved', () => {
        const b1 = makeIssue({ inum: 2, status: IssueStatus.Resolved });
        const b2 = makeIssue({ inum: 3, status: IssueStatus.Resolved });
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [2, 3] });
        expect(getStatus(issue, [issue, b1, b2])).toBe(IssueStatus.Active);
    });

    it('returns Blocked when one of multiple blockers is unresolved', () => {
        const resolved = makeIssue({ inum: 2, status: IssueStatus.Resolved });
        const active = makeIssue({ inum: 3, status: IssueStatus.Active });
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [2, 3] });
        expect(getStatus(issue, [issue, resolved, active])).toBe(IssueStatus.Blocked);
    });

    it('returns stored status when all blockers are Trashed', () => {
        const blocker = makeIssue({ inum: 2, status: IssueStatus.Trashed });
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [2] });
        expect(getStatus(issue, [issue, blocker])).toBe(IssueStatus.InQueue);
    });

    it('returns Blocked when one blocker Trashed but another Active', () => {
        const trashed = makeIssue({ inum: 2, status: IssueStatus.Trashed });
        const active = makeIssue({ inum: 3, status: IssueStatus.Active });
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [2, 3] });
        expect(getStatus(issue, [issue, trashed, active])).toBe(IssueStatus.Blocked);
    });

    it('returns stored status when blocker inum not found in allIssues', () => {
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [99] });
        expect(getStatus(issue, [issue])).toBe(IssueStatus.Active);
    });
});

describe('getColorForStatus', () => {
    it('returns red when blocked', () => {
        const blocker = makeIssue({ inum: 2, status: IssueStatus.Active });
        const issue = makeIssue({ inum: 1, status: IssueStatus.InQueue, blocked_by: [2] });
        expect(getColorForStatus(issue, [issue, blocker])).toBe('red');
    });

    it('returns statusToColor result when not blocked', () => {
        const issue = makeIssue({ inum: 1, status: IssueStatus.Active, blocked_by: [] });
        expect(getColorForStatus(issue, [issue])).toBe('green');
    });
});
