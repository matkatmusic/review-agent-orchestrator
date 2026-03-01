import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import Detail from '../tui/detail.js';
import { DB } from '../db.js';
import { createQuestion, getQuestion, updateStatus } from '../questions.js';
import { addResponse, listResponses } from '../responses.js';
import { addBlocker } from '../dependencies.js';
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
const UNREAD = '\u2731'; // ✱

// useInput registers via useEffect — need a microtask tick before stdin.write
const tick = () => new Promise(r => setTimeout(r, 0));

function setup(db: DB, qnum: number) {
    const onBack = vi.fn();
    const instance = render(
        <Detail db={db} qnum={qnum} onBack={onBack} />
    );
    return { ...instance, onBack };
}

describe('detail', () => {
    let tmpDir: string;
    let db: DB;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'qr-detail-test-'));
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
        it('shows question title and qnum', () => {
            createQuestion(db, 'Fix auth bug', 'detailed description');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame();
            expect(frame).toContain('Q1');
            expect(frame).toContain('Fix auth bug');
        });

        it('shows question status', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('Active');
        });

        it('shows description', () => {
            createQuestion(db, 'q1', 'This is the full description of the question');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('This is the full description of the question');
        });

        it('shows group when present', () => {
            createQuestion(db, 'q1', 'desc', 'auth-group');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('auth-group');
        });

        it('shows blockers and blocked questions', () => {
            const q1 = createQuestion(db, 'blocker', 'desc');
            const q2 = createQuestion(db, 'target', 'desc');
            const q3 = createQuestion(db, 'downstream', 'desc');
            addBlocker(db, q2, q1);
            addBlocker(db, q3, q2);

            const { lastFrame } = setup(db, q2);
            const frame = lastFrame();
            expect(frame).toContain('Blocked by:');
            expect(frame).toContain('Q1');
            expect(frame).toContain('Blocks:');
            expect(frame).toContain('Q3');
        });

        it('shows "(none)" when no dependencies', () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame();
            expect(frame).toContain('(none)');
        });

        it('shows "No responses yet." for question with no responses', () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('No responses yet.');
        });

        it('shows response history with author labels', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'I analyzed the issue');
            addResponse(db, q, 'user', 'Thanks, looks good');

            const { lastFrame } = setup(db, q);
            const frame = lastFrame();
            expect(frame).toContain('Agent');
            expect(frame).toContain('I analyzed the issue');
            expect(frame).toContain('You');
            expect(frame).toContain('Thanks, looks good');
        });

        it('shows unread marker on latest agent response', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'waiting for response');

            const { lastFrame } = setup(db, q);
            expect(lastFrame()).toContain(UNREAD);
        });

        it('no unread marker when latest is from user', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'agent says');
            addResponse(db, q, 'user', 'user responds');

            const { lastFrame } = setup(db, q);
            // The unread marker should not appear on either bubble
            const frame = lastFrame();
            const lines = frame!.split('\n');
            const markerLines = lines.filter(l => l.includes(UNREAD));
            expect(markerLines).toHaveLength(0);
        });

        it('shows "not found" for invalid qnum', () => {
            const { lastFrame } = setup(db, 999);
            expect(lastFrame()).toContain('not found');
        });

        it('shows input prompt in command mode', () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('Press [i] or [Enter] to reply');
        });
    });

    // ---- Navigation ----

    describe('navigation', () => {
        it('Esc in command mode calls onBack', async () => {
            createQuestion(db, 'q1', 'desc');
            const { stdin, onBack } = setup(db, 1);
            await tick();

            stdin.write(ESC);
            await tick();
            expect(onBack).toHaveBeenCalled();
        });
    });

    // ---- Input mode ----

    describe('input mode', () => {
        it('"i" enters input mode — shows text input', async () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write('i');
            await tick();
            const frame = lastFrame();
            // Should show the input prompt and send/cancel hints
            expect(frame).toContain('[Enter] Send');
            expect(frame).toContain('[Esc] Cancel');
        });

        it('Enter also enters input mode', async () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write(ENTER);
            await tick();
            const frame = lastFrame();
            expect(frame).toContain('[Enter] Send');
        });

        it('typing and submitting adds response to DB', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            // Enter input mode
            stdin.write('i');
            await tick();

            // Type a message
            stdin.write('My response here');
            await tick();

            // Submit with Enter
            stdin.write(ENTER);
            await tick();

            // Verify response was added to DB
            const responses = listResponses(db, q);
            expect(responses).toHaveLength(1);
            expect(responses[0]!.author).toBe('user');
            expect(responses[0]!.body).toBe('My response here');

            // Should show the response in the conversation
            const frame = lastFrame();
            expect(frame).toContain('My response here');
            expect(frame).toContain('You');
        });

        it('empty submit is ignored — no response added', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { stdin } = setup(db, q);
            await tick();

            // Enter input mode and immediately submit
            stdin.write('i');
            await tick();
            stdin.write(ENTER);
            await tick();

            const responses = listResponses(db, q);
            expect(responses).toHaveLength(0);
        });

        it('Esc with text clears input, Esc again exits input mode', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            // Enter input mode and type something
            stdin.write('i');
            await tick();
            stdin.write('partial text');
            await tick();

            // First Esc clears the input
            stdin.write(ESC);
            await tick();

            // Second Esc exits input mode
            stdin.write(ESC);
            await tick();

            // Should be back in command mode
            const frame = lastFrame();
            expect(frame).toContain('Press [i] or [Enter] to reply');
        });

        it('Esc with empty input exits input mode immediately', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            expect(lastFrame()).toContain('[Enter] Send');

            stdin.write(ESC);
            await tick();
            expect(lastFrame()).toContain('Press [i] or [Enter] to reply');
        });
    });

    // ---- Status change actions ----

    describe('status change actions', () => {
        it('"d" defers the question', async () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Deferred');
            expect(lastFrame()).toContain('Deferred');
        });

        it('"d" is a no-op on Resolved', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
        });

        it('"r" resolves the question', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
            expect(lastFrame()).toContain('Resolved');
        });

        it('"a" activates a Deferred question', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Awaiting');
            expect(lastFrame()).toContain('Awaiting');
        });

        it('"a" is a no-op on Active', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
        });

        it('status keys are ignored in input mode', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin } = setup(db, 1);
            await tick();

            // Enter input mode
            stdin.write('i');
            await tick();

            // Press 'd' — should be captured as text input, not as defer action
            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');

            // Press 'r' — same
            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
        });
    });

    // ---- Refresh after response ----

    describe('refresh after response', () => {
        it('conversation updates after submitting response', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'What should we do?');

            const { lastFrame, stdin } = setup(db, q);
            await tick();

            // Initially shows agent response with unread marker
            expect(lastFrame()).toContain('What should we do?');
            expect(lastFrame()).toContain(UNREAD);

            // Enter input mode, type response, submit
            stdin.write('i');
            await tick();
            stdin.write('Go with option A');
            await tick();
            stdin.write(ENTER);
            await tick();

            // After submitting, conversation should show both messages
            const frame = lastFrame();
            expect(frame).toContain('What should we do?');
            expect(frame).toContain('Go with option A');
            // Unread marker should be gone (latest is now user)
            const lines = frame!.split('\n');
            const markerLines = lines.filter(l => l.includes(UNREAD));
            expect(markerLines).toHaveLength(0);
        });
    });
});
