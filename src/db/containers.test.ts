import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './database.test.js';
import { DB } from './database.js';
import * as containers from './containers.js';
import * as issues from './issues.js';

describe('containers', () => {
    let db: DB;
    let cleanup: () => void;

    beforeEach(() => {
        ({ db, cleanup } = createTestDb());
    });

    afterEach(() => {
        cleanup();
    });

    it('Inbox container exists after seed', () => {
        const list = containers.listContainers(db);
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe('Inbox');
        expect(list[0].type).toBe('group');
    });

    it('creates a new container', () => {
        const id = containers.createContainer(db, 'Sprint 1', 'sprint');
        expect(id).toBeGreaterThan(1); // 1 is Inbox
        const container = containers.getContainer(db, id);
        expect(container).toBeDefined();
        expect(container!.name).toBe('Sprint 1');
        expect(container!.type).toBe('sprint');
        expect(container!.status).toBe('Open');
    });

    it('creates container with parent', () => {
        const groupId = containers.createContainer(db, 'Auth', 'group');
        const sprintId = containers.createContainer(db, 'Sprint 1', 'sprint', groupId);
        const sprint = containers.getContainer(db, sprintId);
        expect(sprint!.parent_id).toBe(groupId);
    });

    it('creates container with description', () => {
        const id = containers.createContainer(db, 'Test', 'group', undefined, 'A test group');
        const container = containers.getContainer(db, id);
        expect(container!.description).toBe('A test group');
    });

    it('listContainers filters by status', () => {
        const id = containers.createContainer(db, 'Done Group', 'group');
        containers.updateContainerStatus(db, id, 'Closed');

        const open = containers.listContainers(db, 'Open');
        const closed = containers.listContainers(db, 'Closed');
        expect(open).toHaveLength(1); // just Inbox
        expect(closed).toHaveLength(1);
        expect(closed[0].name).toBe('Done Group');
    });

    it('adds issue to container', () => {
        const inum = issues.createIssue(db, 'Test', '');
        const containerId = containers.createContainer(db, 'Sprint', 'sprint');
        containers.addIssueToContainer(db, inum, containerId);

        const inContainer = containers.getIssuesInContainer(db, containerId);
        expect(inContainer).toHaveLength(1);
        expect(inContainer[0].inum).toBe(inum);
    });

    it('removes issue from container', () => {
        const inum = issues.createIssue(db, 'Test', '');
        const containerId = containers.createContainer(db, 'Sprint', 'sprint');
        containers.addIssueToContainer(db, inum, containerId);
        containers.removeIssueFromContainer(db, inum, containerId);

        const inContainer = containers.getIssuesInContainer(db, containerId);
        expect(inContainer).toHaveLength(0);
    });

    it('getIssuesInContainer sorts by status then sort_order then inum', () => {
        const containerId = containers.createContainer(db, 'Sprint', 'sprint');

        const i1 = issues.createIssue(db, 'Awaiting 1', '');
        const i2 = issues.createIssue(db, 'Active', '');
        const i3 = issues.createIssue(db, 'Awaiting 2', '');

        issues.updateStatus(db, i2, 'Active');

        containers.addIssueToContainer(db, i1, containerId, 2);
        containers.addIssueToContainer(db, i2, containerId, 1);
        containers.addIssueToContainer(db, i3, containerId, 1);

        const sorted = containers.getIssuesInContainer(db, containerId);
        expect(sorted).toHaveLength(3);
        // Active first, then Awaiting sorted by sort_order then inum
        expect(sorted[0].inum).toBe(i2); // Active
        expect(sorted[1].inum).toBe(i3); // Awaiting, sort_order=1
        expect(sorted[2].inum).toBe(i1); // Awaiting, sort_order=2
    });

    it('adding same issue to container twice is idempotent', () => {
        const inum = issues.createIssue(db, 'Test', '');
        const containerId = containers.createContainer(db, 'Sprint', 'sprint');
        containers.addIssueToContainer(db, inum, containerId);
        containers.addIssueToContainer(db, inum, containerId); // no-op

        const inContainer = containers.getIssuesInContainer(db, containerId);
        expect(inContainer).toHaveLength(1);
    });

    it('updateSortOrder changes sort position', () => {
        const containerId = containers.createContainer(db, 'Sprint', 'sprint');
        const inum = issues.createIssue(db, 'Test', '');
        containers.addIssueToContainer(db, inum, containerId, 5);
        containers.updateSortOrder(db, inum, containerId, 1);

        const row = db.get<{ sort_order: number }>(
            'SELECT sort_order FROM issue_containers WHERE inum = ? AND container_id = ?',
            inum, containerId
        );
        expect(row?.sort_order).toBe(1);
    });

    it('updateContainerStatus to Closed sets closed_at', () => {
        const id = containers.createContainer(db, 'Test', 'group');
        containers.updateContainerStatus(db, id, 'Closed');
        const container = containers.getContainer(db, id);
        expect(container!.status).toBe('Closed');
        expect(container!.closed_at).not.toBeNull();
    });

    it('updateContainerStatus to Open clears closed_at', () => {
        const id = containers.createContainer(db, 'Test', 'group');
        containers.updateContainerStatus(db, id, 'Closed');
        containers.updateContainerStatus(db, id, 'Open');
        const container = containers.getContainer(db, id);
        expect(container!.status).toBe('Open');
        expect(container!.closed_at).toBeNull();
    });
});
