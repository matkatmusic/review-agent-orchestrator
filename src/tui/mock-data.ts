import type { Issue, Response, Dependency, Container } from '../types.js';
import { IssueStatus, ResponseType, AuthorType } from '../types.js';
import { createMessage, buildMixedChain, buildReplyChain, splitAgentMessage, resetIdCounter } from './thread-builders.js';

// ---- Canonical issue list (single source of truth) ----

export const MOCK_ISSUES: Issue[] = [
    { inum: 1, title: 'migrate_ServerDerivedFields', description: 'Migrate server derived fields to new schema', status: IssueStatus.Active,
        created_at: '2026-01-01T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: '2026-01-01T12:00:00Z' },
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
    rootResponse: Response | null;
    blockedBy: number[];
    blocks: number[];
    group: string;
}

// ---- Build I-1 rich threaded conversation ----

resetIdCounter();

// Main chain items:
// A1-A3: Agent Analysis split into 3 paragraphs
const agentAnalysis = splitAgentMessage(
    'I worked on the server-derived field migration and identified all existing field definitions.\n\nI identified three categories of fields that need migration: computed fields, cached aggregates, and denormalized lookups.\n\nThe computed fields can be migrated first since they have no external dependencies.',
    { type: ResponseType.Analysis, timestamp: '2026-01-01T10:00:00Z', seen: null },
);

// B: User message
const userDirectionMsg = createMessage(AuthorType.User, ResponseType.None,
    'great, now work on the dual-write logic so old and new schemas stay in sync',
    '2026-01-01T10:30:00Z');

// C: Agent Implementation
const agentImplMsg = createMessage(AuthorType.Agent, ResponseType.Implementation,
    'I completed work on the dual-write logic. Changes:\n- src/schema/migration.ts: Field mapping\n- src/schema/dual-write.ts: Transition logic',
    '2026-01-01T11:00:00Z');

// D: User question
const userSyncMsg = createMessage(AuthorType.User, ResponseType.None,
    'can you change the sync interval from 30s to 60s?',
    '2026-01-01T11:15:00Z');

// E1-E2: Agent Implementation split into 2 paragraphs
const agentSyncImpl = splitAgentMessage(
    'I have implemented the change to the sync interval as requested.\n\nHere are the files modified:\n- src/config/sync.ts: interval 30000 → 60000\n- src/schema/dual-write.ts: updated retry window',
    { type: ResponseType.Implementation, timestamp: '2026-01-01T11:30:00Z', seen: null },
);

const { root: i1Root, nodes: i1Nodes } = buildMixedChain([
    agentAnalysis,        // nodes[0]=A1, nodes[1]=A2, nodes[2]=A3
    userDirectionMsg,     // nodes[3]=B
    agentImplMsg,         // nodes[4]=C
    userSyncMsg,          // nodes[5]=D
    agentSyncImpl,        // nodes[6]=E1, nodes[7]=E2
]);

// Reply thread on A2 (nodes[1]): 3 levels deep, all seen (before 12:00:00)
buildReplyChain(i1Nodes[1], [
    createMessage(AuthorType.User, ResponseType.None,
        'one minor tweak — use camelCase for the category names',
        '2026-01-01T10:10:00Z'),
    createMessage(AuthorType.Agent, ResponseType.Implementation,
        'Tweak implemented. All category names now use camelCase.',
        '2026-01-01T10:15:00Z'),
    createMessage(AuthorType.User, ResponseType.None,
        'great, add a comment explaining the naming convention',
        '2026-01-01T10:20:00Z'),
]);

// Reply thread on D (nodes[5]): R4 seen, R5 new (after 12:00:00)
buildReplyChain(i1Nodes[5], [
    createMessage(AuthorType.Agent, ResponseType.Implementation,
        'Updated sync interval to 60s in all config files.',
        '2026-01-01T11:20:00Z'),
    createMessage(AuthorType.User, ResponseType.None,
        "that's fine for now, we can tune it later",
        '2026-01-01T13:00:00Z'),
]);

// Reply thread on E1 (nodes[6]): both new (after 12:00:00)
buildReplyChain(i1Nodes[6], [
    createMessage(AuthorType.User, ResponseType.None,
        'looks good, but add config.yaml support too',
        '2026-01-01T14:00:00Z'),
    createMessage(AuthorType.Agent, ResponseType.Implementation,
        'Added config.yaml support alongside the existing JSON config.',
        '2026-01-01T14:05:00Z'),
]);

// ---- Build simple chains for I-3, I-5, I-8 ----

const { root: i3Root } = buildMixedChain([
    createMessage(AuthorType.User, ResponseType.None,
        'Blocked until server field migration is done.',
        '2026-01-03T08:05:00Z'),
]);

const { root: i5Root } = buildMixedChain([
    createMessage(AuthorType.User, ResponseType.None,
        'Waiting on session credential migration.',
        '2026-01-05T10:05:00Z'),
    createMessage(AuthorType.Agent, ResponseType.Analysis,
        'Reviewing healthcheck patterns and Docker best practices.',
        '2026-01-05T10:30:00Z'),
]);

const { root: i8Root } = buildMixedChain([
    createMessage(AuthorType.Agent, ResponseType.Implementation,
        'Project scaffolding complete.',
        '2026-01-09T10:00:00Z'),
]);

// ---- Assemble MOCK_DETAIL_DATA ----

export const MOCK_DETAIL_DATA: Record<number, DetailMockData> = {
    1: {
        issue: issueByInum(1),
        rootResponse: i1Root,
        blockedBy: [],
        blocks: [3, 4],
        group: 'Inbox',
    },
    2: {
        issue: issueByInum(2),
        rootResponse: null,
        blockedBy: [],
        blocks: [5],
        group: 'Backend Sprint 1',
    },
    3: {
        issue: issueByInum(3),
        rootResponse: i3Root,
        blockedBy: [1],
        blocks: [6],
        group: 'Inbox',
    },
    4: {
        issue: issueByInum(4),
        rootResponse: null,
        blockedBy: [1],
        blocks: [],
        group: 'Frontend',
    },
    5: {
        issue: issueByInum(5),
        rootResponse: i5Root,
        blockedBy: [2],
        blocks: [6],
        group: 'Backlog',
    },
    6: {
        issue: issueByInum(6),
        rootResponse: null,
        blockedBy: [3, 5],
        blocks: [],
        group: 'Backend Sprint 1',
    },
    7: {
        issue: issueByInum(7),
        rootResponse: null,
        blockedBy: [],
        blocks: [],
        group: 'Backend Sprint 1',
    },
    8: {
        issue: issueByInum(8),
        rootResponse: i8Root,
        blockedBy: [],
        blocks: [],
        group: 'Inbox',
    },
};
