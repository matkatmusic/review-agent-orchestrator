import type { Issue, Response as IssueResponse, Dependency, Container } from '../types.js';
import { IssueStatus } from "../types.js"

// ---- Canonical issue list (single source of truth) ----

export const MOCK_ISSUES: Issue[] = [
    { inum: 1, title: 'migrate_ServerDerivedFields', description: 'Migrate server derived fields to new schema', status: IssueStatus.Active
        , created_at: '2026-01-01T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 2, title: 'migrate_SessionCredentials', description: 'Migrate session credential handling', status: IssueStatus.Active, created_at: '2026-01-02T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 3, title: 'rate_limiting_design', description: 'Design rate limiting strategy', status: IssueStatus.Awaiting, created_at: '2026-01-03T00:00:00Z', resolved_at: null, issue_revision: 2, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 4, title: 'payload_encryption_flow', description: 'Define payload encryption flow', status: IssueStatus.Awaiting, created_at: '2026-01-04T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 5, title: 'docker_healthcheck', description: 'Add Docker healthcheck endpoint', status: IssueStatus.Awaiting, created_at: '2026-01-05T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 6, title: 'stale_session_cleanup', description: 'Auto-cleanup stale sessions', status: IssueStatus.Blocked, created_at: '2026-01-06T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 7, title: 'legacy_api_removal', description: 'Remove legacy API endpoints', status: IssueStatus.Deferred, created_at: '2026-01-07T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 8, title: 'initial_setup_task', description: 'Initial project setup', status: IssueStatus.Resolved, created_at: '2026-01-08T00:00:00Z', resolved_at: '2026-01-10T00:00:00Z', issue_revision: 3, agent_last_read_at: null, user_last_viewed_at: null },
];

export const MOCK_UNREAD_INUMS = new Set([3, 6]);

export const MOCK_MAX_AGENTS = 6;

// Helper to look up an issue by inum
function issueByInum(inum: number): Issue {
    return MOCK_ISSUES.find(i => i.inum === inum)!;
}

// ---- Dependencies (blocking map) ----

// I-1 blocks I-3, I-4 | I-2 blocks I-5 | I-3 blocks I-6 | I-5 blocks I-6 (diamond on I-6)
export const MOCK_DEPS: Dependency[] = [
    { blocker_inum: 1, blocked_inum: 3 },
    { blocker_inum: 1, blocked_inum: 4 },
    { blocker_inum: 2, blocked_inum: 5 },
    { blocker_inum: 3, blocked_inum: 6 },
    { blocker_inum: 5, blocked_inum: 6 },
];

// ---- Containers (group view) ----

export const MOCK_CONTAINERS: Container[] = [
    { id: 1, name: 'Inbox', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
    { id: 2, name: 'Backend Sprint 1', type: 'sprint', parent_id: null, description: 'Core backend work', status: 'Open', created_at: '', closed_at: null },
    { id: 3, name: 'Frontend', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
    { id: 4, name: 'Backlog', type: 'group', parent_id: null, description: '', status: 'Open', created_at: '', closed_at: null },
];

// Map container IDs to their issues (sorted by status priority, then inum)
export const MOCK_CONTAINER_ISSUES: Record<number, Issue[]> = {
    1: [issueByInum(1), issueByInum(3), issueByInum(8)],   // Inbox: Active, Awaiting, Resolved
    2: [issueByInum(2), issueByInum(6), issueByInum(7)],   // Sprint 1: Active, Blocked, Deferred
    3: [issueByInum(4)],                                     // Frontend: Awaiting
    4: [issueByInum(5)],                                     // Backlog: Awaiting
};

// ---- Detail view data ----

export interface DetailMockData {
    issue: Issue;
    responses: IssueResponse[];
    blockedBy: number[];
    blocks: number[];
    group: string;
}

export const MOCK_DETAIL_DATA: Record<number, DetailMockData> = {
    1: {
        issue: issueByInum(1),
        responses: [
            {
                id: 1, inum: 1, author: 'user',
                body: 'Please migrate the server-derived fields to the new schema.',
                created_at: '2026-01-01T10:05:00Z',
            },
            {
                id: 2, inum: 1, author: 'agent',
                body: '(analysis) Examining the existing field definitions and planning migration.\n\nKey areas:\n1. Identify all server-derived fields\n2. Map to new schema columns\n3. Write migration script',
                created_at: '2026-01-01T10:10:00Z',
            },
            {
                id: 3, inum: 1, author: 'user',
                body: 'Make sure to handle backward compatibility during the transition.',
                created_at: '2026-01-01T11:00:00Z',
            },
            {
                id: 4, inum: 1, author: 'agent',
                body: '(implementation) Added dual-write logic so old and new schemas stay in sync during rollout.\n\nChanges:\n- src/schema/migration.ts: Field mapping\n- src/schema/dual-write.ts: Transition logic',
                created_at: '2026-01-01T11:30:00Z',
            },
            {
                id: 5, inum: 1, author: 'agent',
                body: '(question) Should we keep the dual-write active for a fixed period, or until a manual cutover command is run?',
                created_at: '2026-01-01T11:35:00Z',
            },
        ],
        blockedBy: [],
        blocks: [3, 4],
        group: 'Inbox',
    },
    2: {
        issue: issueByInum(2),
        responses: [],
        blockedBy: [],
        blocks: [5],
        group: 'Backend Sprint 1',
    },
    3: {
        issue: issueByInum(3),
        responses: [
            { id: 10, inum: 3, author: 'user', body: 'Blocked until server field migration is done.', created_at: '2026-01-03T08:05:00Z' },
        ],
        blockedBy: [1],
        blocks: [6],
        group: 'Inbox',
    },
    4: {
        issue: issueByInum(4),
        responses: [],
        blockedBy: [1],
        blocks: [],
        group: 'Frontend',
    },
    5: {
        issue: issueByInum(5),
        responses: [
            { id: 20, inum: 5, author: 'user', body: 'Waiting on session credential migration.', created_at: '2026-01-05T10:05:00Z' },
            { id: 21, inum: 5, author: 'agent', body: '(analysis) Reviewing healthcheck patterns and Docker best practices.', created_at: '2026-01-05T10:30:00Z' },
        ],
        blockedBy: [2],
        blocks: [6],
        group: 'Backlog',
    },
    6: {
        issue: issueByInum(6),
        responses: [],
        blockedBy: [3, 5],
        blocks: [],
        group: 'Backend Sprint 1',
    },
    7: {
        issue: issueByInum(7),
        responses: [],
        blockedBy: [],
        blocks: [],
        group: 'Backend Sprint 1',
    },
    8: {
        issue: issueByInum(8),
        responses: [
            { id: 30, inum: 8, author: 'agent', body: '(implementation) Project scaffolding complete.', created_at: '2026-01-09T10:00:00Z' },
        ],
        blockedBy: [],
        blocks: [],
        group: 'Inbox',
    },
};
