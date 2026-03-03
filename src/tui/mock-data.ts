import type { Issue } from '../types.js';

export const MOCK_ISSUES: Issue[] = [
    { inum: 1, title: 'migrate_ServerDerivedFields', description: 'Migrate server derived fields to new schema', status: 'Active', created_at: '2026-01-01T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 2, title: 'migrate_SessionCredentials', description: 'Migrate session credential handling', status: 'Active', created_at: '2026-01-02T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 3, title: 'rate_limiting_design', description: 'Design rate limiting strategy', status: 'Awaiting', created_at: '2026-01-03T00:00:00Z', resolved_at: null, issue_revision: 2, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 4, title: 'payload_encryption_flow', description: 'Define payload encryption flow', status: 'Awaiting', created_at: '2026-01-04T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 5, title: 'docker_healthcheck', description: 'Add Docker healthcheck endpoint', status: 'Awaiting', created_at: '2026-01-05T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 6, title: 'stale_session_cleanup', description: 'Auto-cleanup stale sessions', status: 'Blocked', created_at: '2026-01-06T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 7, title: 'legacy_api_removal', description: 'Remove legacy API endpoints', status: 'Deferred', created_at: '2026-01-07T00:00:00Z', resolved_at: null, issue_revision: 1, agent_last_read_at: null, user_last_viewed_at: null },
    { inum: 8, title: 'initial_setup_task', description: 'Initial project setup', status: 'Resolved', created_at: '2026-01-08T00:00:00Z', resolved_at: '2026-01-10T00:00:00Z', issue_revision: 3, agent_last_read_at: null, user_last_viewed_at: null },
];

export const MOCK_UNREAD_INUMS = new Set([3, 6]);

export const MOCK_MAX_AGENTS = 6;
