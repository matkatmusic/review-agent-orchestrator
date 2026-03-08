import type { DB } from './database.js';
import type { Container, Issue, ContainerType, ContainerStatus } from '../types.js';

export function createContainer(
    db: DB,
    name: string,
    type: ContainerType,
    parentId?: number,
    description?: string
): number {
    const result = db.run(
        'INSERT INTO containers (name, type, parent_id, description) VALUES (?, ?, ?, ?)',
        name,
        type,
        parentId ?? null,
        description ?? ''
    );
    return Number(result.lastInsertRowid);
}

export function listContainers(db: DB, status?: ContainerStatus): Container[] {
    if (status) {
        return db.all<Container>(
            'SELECT * FROM containers WHERE status = ? ORDER BY id',
            status
        );
    }
    return db.all<Container>('SELECT * FROM containers ORDER BY id');
}

export function getContainer(db: DB, id: number): Container | undefined {
    return db.get<Container>('SELECT * FROM containers WHERE id = ?', id);
}

export function addIssueToContainer(db: DB, inum: number, containerId: number, sortOrder?: number): void {
    db.run(
        'INSERT OR IGNORE INTO issue_containers (inum, container_id, sort_order) VALUES (?, ?, ?)',
        inum,
        containerId,
        sortOrder ?? null
    );
}

export function removeIssueFromContainer(db: DB, inum: number, containerId: number): void {
    db.run(
        'DELETE FROM issue_containers WHERE inum = ? AND container_id = ?',
        inum,
        containerId
    );
}

export function getIssuesInContainer(db: DB, containerId: number): Issue[] {
    return db.all<Issue>(
        `SELECT i.* FROM issues i
         JOIN issue_containers ic ON i.inum = ic.inum
         WHERE ic.container_id = ?
         ORDER BY
             CASE i.status
                 WHEN 'Active' THEN 1
                 WHEN 'In Queue' THEN 2
                 WHEN 'Blocked' THEN 3
                 WHEN 'Deferred' THEN 4
                 WHEN 'Resolved' THEN 5
             END,
             ic.sort_order,
             i.inum`,
        containerId
    );
}

export function updateSortOrder(db: DB, inum: number, containerId: number, sortOrder: number): void {
    db.run(
        'UPDATE issue_containers SET sort_order = ? WHERE inum = ? AND container_id = ?',
        sortOrder,
        inum,
        containerId
    );
}

export function updateContainerStatus(db: DB, id: number, status: ContainerStatus): void {
    if (status === 'Closed') {
        db.run(
            "UPDATE containers SET status = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
            status,
            id
        );
    } else {
        db.run(
            'UPDATE containers SET status = ?, closed_at = NULL WHERE id = ?',
            status,
            id
        );
    }
}
