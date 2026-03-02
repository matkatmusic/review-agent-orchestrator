import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import Dashboard from '../tui/dashboard.js';
import { DB } from '../db.js';
import { createQuestion, getQuestion, updateStatus, deleteQuestion } from '../questions.js';
import { addResponse } from '../responses.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '../../templates/schema.sql');

// ANSI escape sequences for special keys
const ARROW_UP = '\x1b[A';
const ARROW_DOWN = '\x1b[B';
const TAB = '\t';
const SHIFT_TAB = '\x1b[Z';
const ENTER = '\r';

// Unicode characters used in the dashboard
const CURSOR = '\u25B8'; // ▸
const UNREAD = '\u2731'; // ✱

// useInput registers via useEffect — need a microtask tick before stdin.write
const tick = () => new Promise(r => setTimeout(r, 0));

function setup(db: DB) {
    const onOpenDetail = vi.fn();
    const onNewQuestion = vi.fn();
    const onSelectionChange = vi.fn();
    const instance = render(
        <Dashboard db={db} onOpenDetail={onOpenDetail} onNewQuestion={onNewQuestion} onSelectionChange={onSelectionChange} />
    );
    return { ...instance, onOpenDetail, onNewQuestion, onSelectionChange };
}

describe('dashboard', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-dashboard-test-'));
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
        it('empty DB → shows "No questions in this view."', () => {
            const { lastFrame } = setup(db);
            expect(lastFrame()).toContain('No questions in this view.');
        });

        it('seeded DB → shows question rows with Q-number, title, status', () => {
            createQuestion(db, 'Fix the login bug', 'desc');
            const { lastFrame } = setup(db);
            const frame = lastFrame();
            expect(frame).toContain('Q  1');
            expect(frame).toContain('Fix the login bug');
            expect(frame).toContain('Awaiting');
        });

        it('header shows total question count', () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            createQuestion(db, 'q3', 'desc');
            const { lastFrame } = setup(db);
            expect(lastFrame()).toContain('(3 questions)');
        });

        it('status tabs show correct counts per status', () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting
            createQuestion(db, 'q2', 'desc'); // Awaiting
            updateStatus(db, 1, 'Active');
            updateStatus(db, 2, 'Deferred');
            const { lastFrame } = setup(db);
            const frame = lastFrame();
            expect(frame).toContain('All (2)');
            expect(frame).toContain('Active (1)');
            expect(frame).toContain('Awaiting (0)');
            expect(frame).toContain('Deferred (1)');
            expect(frame).toContain('Resolved (0)');
        });

        it('unread marker appears on questions with unread agent responses', () => {
            const q = createQuestion(db, 'agent replied', 'desc');
            addResponse(db, q, 'agent', 'here is my analysis');
            const { lastFrame } = setup(db);
            expect(lastFrame()).toContain(UNREAD);
        });

        it('unread marker does NOT appear when latest response is from user', () => {
            const q = createQuestion(db, 'user replied', 'desc');
            addResponse(db, q, 'agent', 'agent says');
            addResponse(db, q, 'user', 'user responds');
            const { lastFrame } = setup(db);
            const frame = lastFrame();
            expect(frame).not.toContain(`${UNREAD} 1 new`);
        });

        it('group name shown in brackets for grouped questions', () => {
            createQuestion(db, 'grouped q', 'desc', 'auth-group');
            const { lastFrame } = setup(db);
            expect(lastFrame()).toContain('[auth-group]');
        });

        it('long titles are truncated with "..."', () => {
            const longTitle = 'This is a very long question title that should be truncated';
            createQuestion(db, longTitle, 'desc');
            const { lastFrame } = setup(db);
            const frame = lastFrame();
            expect(frame).toContain('...');
            expect(frame).not.toContain(longTitle);
        });
    });

    // ---- Cursor navigation ----

    describe('cursor navigation', () => {
        it('down arrow moves cursor indicator to next row', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            createQuestion(db, 'q3', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Initially cursor is on first item
            let frame = lastFrame();
            let lines = frame!.split('\n');
            let q1Line = lines.find(l => l.includes('Q  1'))!;
            expect(q1Line).toContain(CURSOR);

            // Move down
            stdin.write(ARROW_DOWN);
            await tick();
            frame = lastFrame();
            lines = frame!.split('\n');
            const q2Line = lines.find(l => l.includes('Q  2'))!;
            expect(q2Line).toContain(CURSOR);
            // q1 should no longer have cursor
            q1Line = lines.find(l => l.includes('Q  1'))!;
            expect(q1Line).not.toContain(CURSOR);
        });

        it('up arrow moves cursor up; stops at top (does not wrap)', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Move down then up twice (should stay at top)
            stdin.write(ARROW_DOWN);
            await tick();
            stdin.write(ARROW_UP);
            await tick();
            stdin.write(ARROW_UP); // extra up — should not wrap
            await tick();

            const frame = lastFrame();
            const lines = frame!.split('\n');
            const q1Line = lines.find(l => l.includes('Q  1'))!;
            expect(q1Line).toContain(CURSOR);
        });

        it('down arrow stops at bottom (does not wrap)', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Move down 5 times (only 2 items)
            for (let i = 0; i < 5; i++) {
                stdin.write(ARROW_DOWN);
                await tick();
            }

            const frame = lastFrame();
            const lines = frame!.split('\n');
            const q2Line = lines.find(l => l.includes('Q  2'))!;
            expect(q2Line).toContain(CURSOR);
            // q1 should NOT have cursor
            const q1Line = lines.find(l => l.includes('Q  1'))!;
            expect(q1Line).not.toContain(CURSOR);
        });

        it('cursor clamps when list shrinks after status change', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Move cursor to q2 (index 1)
            stdin.write(ARROW_DOWN);
            await tick();

            // Defer q2
            stdin.write('d');
            await tick();

            // Tab to "Awaiting" — only q1 is Awaiting
            stdin.write(TAB); // All → Active
            await tick();
            stdin.write(TAB); // Active → Awaiting
            await tick();

            const frame = lastFrame();
            const lines = frame!.split('\n');
            // Only q1 should be visible, cursor should be on it
            const q1Line = lines.find(l => l.includes('Q  1'));
            expect(q1Line).toContain(CURSOR);
        });
    });

    // ---- Tab filtering ----

    describe('tab filtering', () => {
        it('Tab cycles through all status tabs including User_Deferred', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Tab to Active — q1 is Active, should be shown
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('Q  1');

            // Tab to Awaiting — q1 not shown
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');

            // Tab to Deferred
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');

            // Tab to User_Deferred
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');

            // Tab to Resolved
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');

            // Tab back to All — q1 should be visible again
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('Q  1');
        });

        it('Shift+Tab cycles backwards', async () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Shift+Tab from All should go to Resolved
            stdin.write(SHIFT_TAB);
            await tick();
            // q1 is Awaiting so not shown under Resolved
            expect(lastFrame()).toContain('No questions in this view.');

            // Shift+Tab again → Deferred
            stdin.write(SHIFT_TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');
        });

        it('filtering to a status shows only questions with that status', async () => {
            createQuestion(db, 'active_q', 'desc');
            createQuestion(db, 'awaiting_q', 'desc');
            updateStatus(db, 1, 'Active');

            const { lastFrame, stdin } = setup(db);
            await tick();

            // Tab to Active filter
            stdin.write(TAB);
            await tick();
            let frame = lastFrame();
            expect(frame).toContain('active_q');
            expect(frame).not.toContain('awaiting_q');

            // Tab to Awaiting filter
            stdin.write(TAB);
            await tick();
            frame = lastFrame();
            expect(frame).toContain('awaiting_q');
            expect(frame).not.toContain('active_q');
        });

        it('filtering resets cursor to 0', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            createQuestion(db, 'q3', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Move cursor to q3
            stdin.write(ARROW_DOWN);
            await tick();
            stdin.write(ARROW_DOWN);
            await tick();

            // Switch filter and back — cursor should reset
            stdin.write(TAB);
            await tick();
            stdin.write(SHIFT_TAB); // back to All
            await tick();

            const frame = lastFrame();
            const lines = frame!.split('\n');
            const q1Line = lines.find(l => l.includes('Q  1'))!;
            expect(q1Line).toContain(CURSOR);
        });

        it('"All" tab shows all questions', () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            updateStatus(db, 1, 'Active');
            updateStatus(db, 2, 'Deferred');

            const { lastFrame } = setup(db);
            const frame = lastFrame();
            expect(frame).toContain('q1');
            expect(frame).toContain('q2');
        });

        it('tab to a status with no questions shows "No questions in this view."', async () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Tab to Active (no Active questions)
            stdin.write(TAB);
            await tick();
            expect(lastFrame()).toContain('No questions in this view.');
        });
    });

    // ---- Status change actions ----

    describe('status change actions', () => {
        it('"d" on Awaiting question → DB status changes to User_Deferred', async () => {
            createQuestion(db, 'to_defer', 'desc'); // Awaiting
            const { lastFrame, stdin } = setup(db);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('User_Deferred');
            expect(lastFrame()).toContain('User_Deferred');
        });

        it('"d" on already-Deferred question → no-op', async () => {
            createQuestion(db, 'already_deferred', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { stdin } = setup(db);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Deferred');
        });

        it('"d" on Resolved question → no-op', async () => {
            createQuestion(db, 'resolved_q', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { stdin } = setup(db);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
        });

        it('"r" refreshes the list (does not resolve)', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Externally change DB status — TUI hasn't seen it yet
            updateStatus(db, 1, 'Resolved');
            stdin.write('r');
            await tick();
            // After refresh, the TUI should pick up the external change
            expect(lastFrame()).toContain('Resolved');
        });

        it('"a" on Deferred question → DB status changes to Awaiting', async () => {
            createQuestion(db, 'to_activate', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { lastFrame, stdin } = setup(db);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Awaiting');
            expect(lastFrame()).toContain('Awaiting');
        });

        it('"a" on Active question → no-op (only works on Deferred/Resolved)', async () => {
            createQuestion(db, 'active_q', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin } = setup(db);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
        });

        it('"x" deletes the selected question from DB', async () => {
            createQuestion(db, 'to_delete', 'desc');
            createQuestion(db, 'keep_me', 'desc');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Cursor is on q1 — delete it
            stdin.write('x');
            await tick();
            expect(getQuestion(db, 1)).toBeUndefined();
            // q2 should still exist
            expect(getQuestion(db, 2)).toBeDefined();
            // Dashboard should no longer show the deleted question
            expect(lastFrame()).not.toContain('to_delete');
            expect(lastFrame()).toContain('keep_me');
        });

        it('"x" on empty list → no-op', async () => {
            const { stdin } = setup(db);
            await tick();

            // Should not crash
            stdin.write('x');
            await tick();
        });
    });

    // ---- Auto-refresh polling (Fix N) ----

    describe('auto-refresh polling', () => {
        it('external DB change appears after polling interval without user input', async () => {
            vi.useFakeTimers();
            const q = createQuestion(db, 'initial_title', 'desc');
            const { lastFrame } = setup(db);
            await vi.advanceTimersByTimeAsync(0); // initial render tick

            // Verify initial state
            expect(lastFrame()).toContain('initial_title');
            expect(lastFrame()).toContain('(1 questions)');

            // External DB change (simulating daemon creating a question)
            createQuestion(db, 'externally_added', 'desc');

            // Before poll interval — new question not visible yet
            expect(lastFrame()).not.toContain('externally_added');

            // Advance past the 3-second poll interval
            await vi.advanceTimersByTimeAsync(3100);

            // Now the externally-added question should appear
            expect(lastFrame()).toContain('externally_added');
            expect(lastFrame()).toContain('(2 questions)');

            vi.useRealTimers();
        });
    });

    // ---- Status-dependent status bar ----

    describe('status-dependent status bar', () => {
        it('Awaiting question selected → bar shows [d] and [a] Make Active, no resolve', () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).toContain('[d] Defer');
            expect(frame).toContain('[a] Make Active');
            expect(frame).toContain('[r] Refresh');
            expect(frame).not.toContain('[r] Resolve');
        });

        it('Deferred question selected → bar shows [a] Activate, no [d]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).toContain('[a] Activate');
            expect(frame).not.toContain('[d] Defer');
            expect(frame).not.toContain('[r] Resolve');
        });

        it('Resolved question selected → bar shows [a] Activate, no [d]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).toContain('[a] Activate');
            expect(frame).not.toContain('[d] Defer');
            expect(frame).not.toContain('[r] Resolve');
        });

        it('empty list → status bar omits action hints but keeps [r] Refresh', () => {
            const { lastFrame } = setup(db);
            const frame = lastFrame()!;
            expect(frame).not.toContain('[d] Defer');
            expect(frame).not.toContain('[a] Activate');
            expect(frame).not.toContain('[a] Make Active');
            expect(frame).toContain('[r] Refresh');
            expect(frame).toContain('[Tab] Filter');
            expect(frame).toContain('[q] Quit');
        });

        it('cursor move updates action hints for newly selected question', async () => {
            createQuestion(db, 'awaiting_q', 'desc'); // Awaiting
            createQuestion(db, 'resolved_q', 'desc');
            updateStatus(db, 2, 'Resolved');
            const { lastFrame, stdin } = setup(db);
            await tick();

            // Cursor on q1 (Awaiting): [d] Defer and [a] Make Active
            expect(lastFrame()).toContain('[d] Defer');
            expect(lastFrame()).toContain('[a] Make Active');

            // Move to q2 (Resolved): [a] Activate only
            stdin.write(ARROW_DOWN);
            await tick();
            expect(lastFrame()).toContain('[a] Activate');
            expect(lastFrame()).not.toContain('[d] Defer');
        });
    });

    // ---- Callbacks ----

    describe('callbacks', () => {
        it('Enter → onOpenDetail called with the qnum of the selected question', async () => {
            createQuestion(db, 'q1', 'desc');
            createQuestion(db, 'q2', 'desc');
            const { stdin, onOpenDetail } = setup(db);
            await tick();

            // Move to q2 and press Enter
            stdin.write(ARROW_DOWN);
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(onOpenDetail).toHaveBeenCalledWith(2);
        });

        it('Enter on empty list → onOpenDetail NOT called', async () => {
            const { stdin, onOpenDetail } = setup(db);
            await tick();

            stdin.write(ENTER);
            await tick();
            expect(onOpenDetail).not.toHaveBeenCalled();
        });

        it('"n" → onNewQuestion called', async () => {
            const { stdin, onNewQuestion } = setup(db);
            await tick();

            stdin.write('n');
            await tick();
            expect(onNewQuestion).toHaveBeenCalled();
        });
    });

    // ---- Header context callback ----

    describe('onSelectionChange', () => {
        it('always fires with { type: "none" } — dashboard shows title only', async () => {
            createQuestion(db, 'q1', 'my description');
            const { onSelectionChange } = setup(db);
            await tick();
            expect(onSelectionChange).toHaveBeenCalledWith({ type: 'none' });
        });

        it('fires with { type: "none" } on empty list', async () => {
            const { onSelectionChange } = setup(db);
            await tick();
            expect(onSelectionChange).toHaveBeenCalledWith({ type: 'none' });
        });
    });
});
