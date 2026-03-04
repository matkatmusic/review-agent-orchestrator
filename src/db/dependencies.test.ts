import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from './database.test.js';
import { DB } from './database.js';
import * as deps from './dependencies.js';
import * as issues from './issues.js';
import { IssueStatus } from "../types.js"

describe('dependencies', () => {
    let db: DB;
    let cleanup: () => void;

    beforeEach(() => {
        ({ db, cleanup } = createTestDb());
    });

    afterEach(() => {
        cleanup();
    });

    it('adds a dependency', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Blocked', '');
        deps.addBlock(db, i2, i1);

        const blockers = deps.getBlockersFor(db, i2);
        expect(blockers).toHaveLength(1);
        expect(blockers[0].inum).toBe(i1);
    });

    it('getBlockedBy returns issues blocked by a given issue', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Blocked', '');
        deps.addBlock(db, i2, i1);

        const blocked = deps.getBlockedBy(db, i1);
        expect(blocked).toHaveLength(1);
        expect(blocked[0].inum).toBe(i2);
    });

    it('removes a dependency', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Blocked', '');
        deps.addBlock(db, i2, i1);
        deps.removeBlock(db, i2, i1);

        expect(deps.getBlockersFor(db, i2)).toHaveLength(0);
    });

    it('isBlocked returns true when unresolved blocker exists', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Blocked', '');
        deps.addBlock(db, i2, i1);

        expect(deps.isBlocked(db, i2)).toBe(true);
    });

    it('isBlocked returns false when blocker is resolved', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Blocked', '');
        deps.addBlock(db, i2, i1);
        issues.updateStatus(db, i1, IssueStatus.Resolved);

        expect(deps.isBlocked(db, i2)).toBe(false);
    });

    it('isBlocked returns false when no blockers', () => {
        const i1 = issues.createIssue(db, 'Free', '');
        expect(deps.isBlocked(db, i1)).toBe(false);
    });

    it('rejects self-reference', () => {
        const i1 = issues.createIssue(db, 'Self', '');
        expect(() => deps.addBlock(db, i1, i1)).toThrow('cannot block itself');
    });

    it('rejects direct cycle (A blocks B, B blocks A)', () => {
        const i1 = issues.createIssue(db, 'A', '');
        const i2 = issues.createIssue(db, 'B', '');
        deps.addBlock(db, i2, i1); // i1 blocks i2
        expect(() => deps.addBlock(db, i1, i2)).toThrow('circular dependency');
    });

    it('rejects transitive cycle (A→B→C→A)', () => {
        const i1 = issues.createIssue(db, 'A', '');
        const i2 = issues.createIssue(db, 'B', '');
        const i3 = issues.createIssue(db, 'C', '');
        deps.addBlock(db, i2, i1); // i1 blocks i2
        deps.addBlock(db, i3, i2); // i2 blocks i3
        expect(() => deps.addBlock(db, i1, i3)).toThrow('circular dependency');
    });

    it('allows non-cyclic diamond dependency', () => {
        const i1 = issues.createIssue(db, 'A', '');
        const i2 = issues.createIssue(db, 'B', '');
        const i3 = issues.createIssue(db, 'C', '');
        const i4 = issues.createIssue(db, 'D', '');
        // Diamond: A blocks B and C; B and C both block D
        deps.addBlock(db, i2, i1);
        deps.addBlock(db, i3, i1);
        deps.addBlock(db, i4, i2);
        deps.addBlock(db, i4, i3);

        expect(deps.getBlockersFor(db, i4)).toHaveLength(2);
    });

    it('adding same dependency twice is idempotent', () => {
        const i1 = issues.createIssue(db, 'A', '');
        const i2 = issues.createIssue(db, 'B', '');
        deps.addBlock(db, i2, i1);
        deps.addBlock(db, i2, i1); // duplicate — should not throw

        expect(deps.getBlockersFor(db, i2)).toHaveLength(1);
    });

    it('removing nonexistent dependency is a no-op', () => {
        const i1 = issues.createIssue(db, 'A', '');
        const i2 = issues.createIssue(db, 'B', '');
        deps.removeBlock(db, i2, i1); // nothing to remove — should not throw
    });

    it('rejects addBlock with nonexistent blocked issue', () => {
        const i1 = issues.createIssue(db, 'A', '');
        expect(() => deps.addBlock(db, 999, i1)).toThrow('Issue I999 not found');
    });

    it('rejects addBlock with nonexistent blocker issue', () => {
        const i1 = issues.createIssue(db, 'A', '');
        expect(() => deps.addBlock(db, i1, 999)).toThrow('Issue I999 not found');
    });

    it('rejects addBlock when blocked issue is Resolved', () => {
        const i1 = issues.createIssue(db, 'Blocker', '');
        const i2 = issues.createIssue(db, 'Resolved', '');
        issues.updateStatus(db, i2, IssueStatus.Resolved);
        expect(() => deps.addBlock(db, i2, i1)).toThrow('Cannot block a Resolved issue');
    });
});
