import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db.js';
import { createQuestion, updateStatus } from '../questions.js';
import {
    addBlocker,
    removeBlocker,
    isBlocked,
    getBlockers,
    getBlocked,
    blockByGroup,
} from '../dependencies.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');
const SEED_PATH = join(__dirname, '../../templates/seed.sql');

describe('dependencies', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-deps-test-'));
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.seed(SEED_PATH);
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('add blocker → isBlocked returns true', () => {
        const q2 = createQuestion(db, 'blocked_q', 'desc');
        // q2 blocked by q1 (seed question, status=Awaiting)
        addBlocker(db, q2, 1);
        expect(isBlocked(db, q2)).toBe(true);
    });

    it('resolve blocker → isBlocked returns false', () => {
        const q2 = createQuestion(db, 'blocked_q', 'desc');
        addBlocker(db, q2, 1);
        expect(isBlocked(db, q2)).toBe(true);

        updateStatus(db, 1, 'Resolved');
        expect(isBlocked(db, q2)).toBe(false);
    });

    it('multiple blockers: blocked until ALL resolved', () => {
        const q3 = createQuestion(db, 'blocker2', 'desc');
        const q4 = createQuestion(db, 'target', 'desc');

        addBlocker(db, q4, 1);   // blocked by q1
        addBlocker(db, q4, q3);  // blocked by q3

        expect(isBlocked(db, q4)).toBe(true);

        // Resolve q1 — still blocked by q3
        updateStatus(db, 1, 'Resolved');
        expect(isBlocked(db, q4)).toBe(true);

        // Resolve q3 — now unblocked
        updateStatus(db, q3, 'Resolved');
        expect(isBlocked(db, q4)).toBe(false);
    });

    it('self-reference rejected by CHECK constraint', () => {
        expect(() => {
            addBlocker(db, 1, 1);
        }).toThrow();
    });

    it('addBlocker is idempotent (INSERT OR IGNORE)', () => {
        const q2 = createQuestion(db, 'blocked_q', 'desc');
        addBlocker(db, q2, 1);
        addBlocker(db, q2, 1); // should not throw

        const blockers = getBlockers(db, q2);
        expect(blockers).toHaveLength(1);
    });

    it('removeBlocker removes the dependency', () => {
        const q2 = createQuestion(db, 'blocked_q', 'desc');
        addBlocker(db, q2, 1);
        expect(isBlocked(db, q2)).toBe(true);

        removeBlocker(db, q2, 1);
        expect(isBlocked(db, q2)).toBe(false);
    });

    it('getBlockers returns correct questions', () => {
        const q2 = createQuestion(db, 'blocker2', 'desc');
        const q3 = createQuestion(db, 'target', 'desc');

        addBlocker(db, q3, 1);
        addBlocker(db, q3, q2);

        const blockers = getBlockers(db, q3);
        expect(blockers).toHaveLength(2);
        expect(blockers.map(q => q.qnum)).toEqual([1, q2]);
    });

    it('getBlocked returns questions that a blocker is blocking', () => {
        const q2 = createQuestion(db, 'target1', 'desc');
        const q3 = createQuestion(db, 'target2', 'desc');

        addBlocker(db, q2, 1);
        addBlocker(db, q3, 1);

        const blocked = getBlocked(db, 1);
        expect(blocked).toHaveLength(2);
        expect(blocked.map(q => q.qnum)).toEqual([q2, q3]);
    });

    it('blockByGroup creates correct dependency rows', () => {
        const g1 = createQuestion(db, 'group_a', 'desc', 'mygroup');
        const g2 = createQuestion(db, 'group_b', 'desc', 'mygroup');
        const target = createQuestion(db, 'target', 'desc');

        blockByGroup(db, target, 'mygroup');

        const blockers = getBlockers(db, target);
        expect(blockers).toHaveLength(2);
        expect(blockers.map(q => q.qnum).sort()).toEqual([g1, g2].sort());
    });

    it('blockByGroup — group partially resolved → still blocked', () => {
        const g1 = createQuestion(db, 'group_a', 'desc', 'mygroup');
        const g2 = createQuestion(db, 'group_b', 'desc', 'mygroup');
        const target = createQuestion(db, 'target', 'desc');

        blockByGroup(db, target, 'mygroup');
        expect(isBlocked(db, target)).toBe(true);

        updateStatus(db, g1, 'Resolved');
        expect(isBlocked(db, target)).toBe(true); // g2 still unresolved

        updateStatus(db, g2, 'Resolved');
        expect(isBlocked(db, target)).toBe(false); // all resolved
    });

    it('blockByGroup with nonexistent group creates no dependencies', () => {
        const target = createQuestion(db, 'target', 'desc');
        blockByGroup(db, target, 'nonexistent');

        const blockers = getBlockers(db, target);
        expect(blockers).toEqual([]);
        expect(isBlocked(db, target)).toBe(false);
    });

    it('isBlocked returns false for question with no dependencies', () => {
        expect(isBlocked(db, 1)).toBe(false);
    });

    it('getBlockers returns empty for question with no dependencies', () => {
        expect(getBlockers(db, 1)).toEqual([]);
    });

    it('getBlocked returns empty for question blocking nothing', () => {
        expect(getBlocked(db, 1)).toEqual([]);
    });
});
