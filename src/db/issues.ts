import type { DB } from './database.js';
import type { Issue } from '../types.js';
import { IssueStatus } from '../types.js';

export function createIssue(
    db: DB,
    title: string,
    description: string,
): number {
    return db.transaction(() => {
        db.run(
            "UPDATE metadata SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'lastIssueCreated'"
        );
        const row = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'lastIssueCreated'"
        );
        const inum = parseInt(row!.value, 10);

        db.run(
            'INSERT INTO issues (inum, title, description) VALUES (?, ?, ?)',
            inum,
            title,
            description
        );

        // Auto-assign to Inbox container (looked up from metadata, not hardcoded)
        const inboxRow = db.get<{ value: string }>(
            "SELECT value FROM metadata WHERE key = 'inboxContainerId'"
        );
        if (!inboxRow) {
            throw new Error('Inbox container ID not found in metadata');
        }
        const inboxId = parseInt(inboxRow.value, 10);
        db.run(
            'INSERT INTO issue_containers (inum, container_id) VALUES (?, ?)',
            inum,
            inboxId
        );

        return inum;
    });
}

export function getByInum(db: DB, inum: number): Issue | undefined {
    return db.get<Issue>('SELECT * FROM issues WHERE inum = ?', inum);
}

export function list(db: DB, status?: IssueStatus): Issue[] {
    if (status) {
        return db.all<Issue>(
            'SELECT * FROM issues WHERE status = ? ORDER BY inum',
            status
        );
    }
    return db.all<Issue>('SELECT * FROM issues ORDER BY inum');
}

export function updateStatus(db: DB, inum: number, status: IssueStatus): void {
    if (status === IssueStatus.Resolved) {
        const result = db.run(
            "UPDATE issues SET status = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE inum = ?",
            status,
            inum
        );
        if (result.changes === 0) {
            throw new Error(`Issue I${inum} not found`);
        }
    } else {
        const result = db.run(
            'UPDATE issues SET status = ?, resolved_at = NULL WHERE inum = ?',
            status,
            inum
        );
        if (result.changes === 0) {
            throw new Error(`Issue I${inum} not found`);
        }
    }
}

export function updateDescription(db: DB, inum: number, description: string): void {
    const result = db.run(
        'UPDATE issues SET description = ? WHERE inum = ?',
        description,
        inum
    );
    if (result.changes === 0) {
        throw new Error(`Issue I${inum} not found`);
    }
}

export function incrementRevision(db: DB, inum: number): number {
    const result = db.run(
        'UPDATE issues SET issue_revision = issue_revision + 1 WHERE inum = ?',
        inum
    );
    if (result.changes === 0) {
        throw new Error(`Issue I${inum} not found`);
    }
    const row = db.get<{ issue_revision: number }>(
        'SELECT issue_revision FROM issues WHERE inum = ?',
        inum
    );
    return row!.issue_revision;
}

export function markViewed(db: DB, inum: number): void {
    const result = db.run(
        "UPDATE issues SET user_last_viewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE inum = ?",
        inum
    );
    if (result.changes === 0) {
        throw new Error(`Issue I${inum} not found`);
    }
}

export function getActiveCount(db: DB): number {
    const row = db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM issues WHERE status = 'Active'"
    );
    return row?.count ?? 0;
}

export function getStatusCounts(db: DB): Record<IssueStatus, number> {
    const rows = db.all<{ status: IssueStatus; count: number }>(
        'SELECT status, COUNT(*) AS count FROM issues GROUP BY status'
    );
    const counts: Record<IssueStatus, number> = {
        [IssueStatus.Awaiting]: 0,
        [IssueStatus.Active]: 0,
        [IssueStatus.Blocked]: 0,
        [IssueStatus.Deferred]: 0,
        [IssueStatus.Resolved]: 0,
    };
    for (const row of rows) {
        counts[row.status] = row.count;
    }
    return counts;
}
