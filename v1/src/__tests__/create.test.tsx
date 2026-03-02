import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import Create from '../tui/create.js';
import { DB } from '../db.js';
import { getQuestion, listAll } from '../questions.js';
import { getBlockers } from '../dependencies.js';
import { createQuestion } from '../questions.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

const ENTER = '\r';
const ESC = '\x1b';
const TAB = '\t';
const SHIFT_TAB = '\x1b[Z';

const tick = () => new Promise(r => setTimeout(r, 0));

function setup(db: DB) {
    const onCreated = vi.fn();
    const onBack = vi.fn();
    const instance = render(
        <Create db={db} onCreated={onCreated} onBack={onBack} />
    );
    return { ...instance, onCreated, onBack };
}

describe('create', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-create-test-'));
        db = new DB(join(tmpDir, 'test.db'));
        db.open();
        db.migrate(SCHEMA_PATH);
        db.run("INSERT INTO metadata (key, value) VALUES ('lastQuestionCreated', '0')");
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    // ---- Rendering ----

    describe('rendering', () => {
        it('shows Title field with cursor indicator', () => {
            const { lastFrame } = setup(db);
            // "New Question" header moved to parent Header component;
            // Create shows form fields starting with Title
            expect(lastFrame()).toContain('Title:');
            expect(lastFrame()).toContain('\u25B8'); // cursor on first field
        });

        it('shows all field labels', () => {
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).toContain('Title');
            expect(frame).toContain('Description');
            expect(frame).toContain('Group');
            expect(frame).toContain('Blocked by');
        });

        it('shows status bar with keyboard hints', () => {
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).toContain('[Tab] Next field');
            expect(frame).toContain('[Enter] Create');
            expect(frame).toContain('[Esc] Cancel');
        });

        it('first field (title) is active by default', () => {
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            // Active field gets the cursor marker ▸
            const lines = frame.split('\n');
            const titleLine = lines.find(l => l.includes('Title'));
            expect(titleLine).toContain('\u25B8');
        });
    });

    // ---- Field navigation ----

    describe('field navigation', () => {
        it('Tab moves to next field', async () => {
            const { lastFrame, stdin } = setup(db);
            await tick();

            stdin.write(TAB);
            await tick();

            const frame = lastFrame()!;
            const lines = frame.split('\n');
            const descLine = lines.find(l => l.includes('Description'));
            expect(descLine).toContain('\u25B8');
        });

        it('Tab cycles through all fields', async () => {
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Tab through title → description → group → blockedBy
            stdin.write(TAB);
            await tick();
            stdin.write(TAB);
            await tick();

            const frame1 = lastFrame()!;
            expect(frame1.split('\n').find(l => l.includes('Group'))!).toContain('\u25B8');

            stdin.write(TAB);
            await tick();
            const frame2 = lastFrame()!;
            expect(frame2.split('\n').find(l => l.includes('Blocked by'))!).toContain('\u25B8');
        });

        it('Tab wraps from last field to first', async () => {
            const { lastFrame, stdin } = setup(db);
            await tick();

            // 4 tabs to wrap around
            for (let i = 0; i < 4; i++) {
                stdin.write(TAB);
                await tick();
            }

            const frame = lastFrame()!;
            const titleLine = frame.split('\n').find(l => l.includes('Title'));
            expect(titleLine).toContain('\u25B8');
        });

        it('Shift+Tab moves to previous field', async () => {
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Move to description first
            stdin.write(TAB);
            await tick();

            // Then shift-tab back to title
            stdin.write(SHIFT_TAB);
            await tick();

            const frame = lastFrame()!;
            const titleLine = frame.split('\n').find(l => l.includes('Title'));
            expect(titleLine).toContain('\u25B8');
        });
    });

    // ---- Form submission ----

    describe('form submission', () => {
        it('creates question with title and description', async () => {
            const { stdin, onCreated } = setup(db);
            await tick();

            // Type title
            stdin.write('My new question');
            await tick();

            // Tab to description
            stdin.write(TAB);
            await tick();

            // Type description
            stdin.write('This is the description');
            await tick();

            // Submit
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalledWith(1);
            const q = getQuestion(db, 1);
            expect(q).toBeDefined();
            expect(q!.title).toBe('My new question');
            expect(q!.description).toBe('This is the description');
            expect(q!.status).toBe('Awaiting');
        });

        it('creates question with group', async () => {
            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Description');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('auth-group');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalledWith(1);
            const q = getQuestion(db, 1);
            expect(q!.group).toBe('auth-group');
        });

        it('creates question with blocked-by dependencies', async () => {
            // Create blocker questions first
            createQuestion(db, 'blocker1', 'desc');
            createQuestion(db, 'blocker2', 'desc');

            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Blocked question');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Needs blockers resolved first');
            await tick();
            stdin.write(TAB);
            await tick();
            // Skip group
            stdin.write(TAB);
            await tick();
            // Type blockers
            stdin.write('1,2');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalledWith(3);
            const blockers = getBlockers(db, 3);
            expect(blockers).toHaveLength(2);
            expect(blockers.map(b => b.qnum).sort()).toEqual([1, 2]);
        });

        it('handles Q-prefixed blocker numbers', async () => {
            createQuestion(db, 'blocker', 'desc');

            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Desc');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Q1');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalledWith(2);
            const blockers = getBlockers(db, 2);
            expect(blockers).toHaveLength(1);
            expect(blockers[0]!.qnum).toBe(1);
        });

        it('navigates to detail view after creation (onCreated called with qnum)', async () => {
            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Description');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalledTimes(1);
            expect(onCreated).toHaveBeenCalledWith(1);
        });

        it('empty group is omitted (null in DB)', async () => {
            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Description');
            await tick();
            // Don't fill group, just submit
            stdin.write(ENTER);
            await tick();

            expect(onCreated).toHaveBeenCalled();
            const q = getQuestion(db, 1);
            expect(q!.group).toBeNull();
        });
    });

    // ---- Validation ----

    describe('validation', () => {
        it('shows error when title is empty', async () => {
            const { lastFrame, stdin, onCreated } = setup(db);
            await tick();

            // Don't type anything, just submit
            stdin.write(ENTER);
            await tick();

            expect(onCreated).not.toHaveBeenCalled();
            expect(lastFrame()).toContain('Title is required');
        });

        it('shows error when description is empty', async () => {
            const { lastFrame, stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            // Don't type description, submit
            stdin.write(ENTER);
            await tick();

            expect(onCreated).not.toHaveBeenCalled();
            expect(lastFrame()).toContain('Description is required');
        });

        it('shows error for invalid blocker number', async () => {
            const { lastFrame, stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Title');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('Description');
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write(TAB);
            await tick();
            stdin.write('abc');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onCreated).not.toHaveBeenCalled();
            expect(lastFrame()).toContain('Invalid blocker');
        });

        it('error clears when switching fields', async () => {
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Trigger error
            stdin.write(ENTER);
            await tick();
            expect(lastFrame()).toContain('Title is required');

            // Tab to next field — error should clear
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).not.toContain('Title is required');
        });

        it('no question created in DB when validation fails', async () => {
            const { stdin } = setup(db);
            await tick();

            stdin.write(ENTER);
            await tick();

            expect(listAll(db)).toHaveLength(0);
        });
    });

    // ---- Navigation / Cancel ----

    describe('navigation', () => {
        it('Esc calls onBack', async () => {
            const { stdin, onBack } = setup(db);
            await tick();

            stdin.write(ESC);
            await tick();
            expect(onBack).toHaveBeenCalled();
        });

        it('Esc does not create a question', async () => {
            const { stdin, onCreated } = setup(db);
            await tick();

            stdin.write('Partial title');
            await tick();
            stdin.write(ESC);
            await tick();

            expect(onCreated).not.toHaveBeenCalled();
            expect(listAll(db)).toHaveLength(0);
        });
    });
});
