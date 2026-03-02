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
    const onHeaderUpdate = vi.fn();
    const instance = render(
        <Detail db={db} qnum={qnum} onBack={onBack} onHeaderUpdate={onHeaderUpdate} />
    );
    return { ...instance, onBack, onHeaderUpdate };
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
        it('shows description', () => {
            createQuestion(db, 'q1', 'This is the full description of the question');
            const { lastFrame } = setup(db, 1);
            expect(lastFrame()).toContain('This is the full description of the question');
        });

        it('calls onHeaderUpdate with question context on mount', async () => {
            const q1 = createQuestion(db, 'Fix auth bug', 'detailed description');
            addBlocker(db, q1, createQuestion(db, 'blocker', 'desc'));
            updateStatus(db, q1, 'Active');
            const { onHeaderUpdate } = setup(db, q1);
            await tick();
            expect(onHeaderUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'question',
                    qnum: q1,
                    status: 'Active',
                    blockers: [2],
                    description: 'detailed description',
                })
            );
        });

        it('calls onHeaderUpdate with updated status after status change', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin, onHeaderUpdate } = setup(db, 1);
            await tick();
            onHeaderUpdate.mockClear();

            stdin.write('r'); // resolve
            await tick();
            expect(onHeaderUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'Resolved' })
            );
        });

        it('calls onHeaderUpdate with none for invalid qnum', async () => {
            const { onHeaderUpdate } = setup(db, 999);
            await tick();
            expect(onHeaderUpdate).toHaveBeenCalledWith({ type: 'none' });
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

        it('shows response body text in each bubble', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'First agent message');
            addResponse(db, q, 'user', 'User reply text');

            const { lastFrame } = setup(db, q);
            const frame = lastFrame()!;
            expect(frame).toContain('First agent message');
            expect(frame).toContain('User reply text');
        });

        it('renders responses in chronological order (oldest first)', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'FIRST_MSG');
            addResponse(db, q, 'user', 'SECOND_MSG');
            addResponse(db, q, 'agent', 'THIRD_MSG');

            const { lastFrame } = setup(db, q);
            const frame = lastFrame()!;
            const firstPos = frame.indexOf('FIRST_MSG');
            const secondPos = frame.indexOf('SECOND_MSG');
            const thirdPos = frame.indexOf('THIRD_MSG');
            expect(firstPos).toBeLessThan(secondPos);
            expect(secondPos).toBeLessThan(thirdPos);
        });

        it('shows all responses in multi-response conversation (3+ messages)', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'Message one');
            addResponse(db, q, 'user', 'Message two');
            addResponse(db, q, 'agent', 'Message three');
            addResponse(db, q, 'user', 'Message four');

            const { lastFrame } = setup(db, q);
            const frame = lastFrame()!;
            expect(frame).toContain('Message one');
            expect(frame).toContain('Message two');
            expect(frame).toContain('Message three');
            expect(frame).toContain('Message four');
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

        it('unread marker only on LAST response, not earlier agent responses', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'EARLIER_AGENT_MSG');
            addResponse(db, q, 'user', 'user reply');
            addResponse(db, q, 'agent', 'LATEST_AGENT_MSG');

            const { lastFrame } = setup(db, q);
            const frame = lastFrame()!;
            const lines = frame.split('\n');
            // Only one line should contain the unread marker
            const markerLines = lines.filter(l => l.includes(UNREAD));
            expect(markerLines).toHaveLength(1);
            // The marker should be near the latest agent message, not the earlier one
            const markerLineIdx = lines.findIndex(l => l.includes(UNREAD));
            const earlierIdx = lines.findIndex(l => l.includes('EARLIER_AGENT_MSG'));
            const latestIdx = lines.findIndex(l => l.includes('LATEST_AGENT_MSG'));
            expect(markerLineIdx).toBeGreaterThan(earlierIdx);
            // The marker is on the same line as the timestamp of the latest response
            expect(markerLineIdx).toBeGreaterThanOrEqual(latestIdx - 1);
        });

        it('shows "not found" for invalid qnum', () => {
            const { lastFrame } = setup(db, 999);
            expect(lastFrame()).toContain('not found');
        });

        it('Awaiting question → status bar shows [d], [a] Make Active, and [r]', () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting by default
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame()!;
            expect(frame).toContain('[Esc] Back');
            expect(frame).toContain('[d] Defer');
            expect(frame).toContain('[a] Make Active');
            expect(frame).toContain('[r] Resolve');
            expect(frame).not.toContain('[a] Activate');
        });

        it('Active question → status bar shows [d] and [r], not [a]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame()!;
            expect(frame).toContain('[d] Defer');
            expect(frame).toContain('[r] Resolve');
            expect(frame).not.toContain('[a] Activate');
            expect(frame).not.toContain('[a] Make Active');
        });

        it('Deferred question → status bar shows [a] and [r], not [d]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame()!;
            expect(frame).toContain('[a] Activate');
            expect(frame).toContain('[r] Resolve');
            expect(frame).not.toContain('[d] Defer');
        });

        it('User_Deferred question → status bar shows [a] and [r], not [d]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'User_Deferred');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame()!;
            expect(frame).toContain('[a] Activate');
            expect(frame).toContain('[r] Resolve');
            expect(frame).not.toContain('[d] Defer');
        });

        it('Resolved question → status bar shows [a], not [d] or [r]', () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { lastFrame } = setup(db, 1);
            const frame = lastFrame()!;
            expect(frame).toContain('[a] Activate');
            expect(frame).not.toContain('[d] Defer');
            expect(frame).not.toContain('[r] Resolve');
        });

        it('status bar updates after resolving an Active question', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            // Before: Active shows [d] and [r]
            expect(lastFrame()).toContain('[d] Defer');
            expect(lastFrame()).toContain('[r] Resolve');
            expect(lastFrame()).not.toContain('[a] Activate');

            // Resolve it
            stdin.write('r');
            await tick();

            // After: Resolved shows only [a]
            expect(lastFrame()).toContain('[a] Activate');
            expect(lastFrame()).not.toContain('[d] Defer');
            expect(lastFrame()).not.toContain('[r] Resolve');
        });
    });

    // ---- Response overflow ----

    describe('response overflow', () => {
        function setupWithHeight(db: DB, qnum: number, contentHeight: number) {
            const onBack = vi.fn();
            const onHeaderUpdate = vi.fn();
            const instance = render(
                <Detail db={db} qnum={qnum} onBack={onBack} onHeaderUpdate={onHeaderUpdate} contentHeight={contentHeight} />
            );
            return { ...instance, onBack, onHeaderUpdate };
        }

        it('shows hidden indicator when responses exceed contentHeight', () => {
            const q = createQuestion(db, 'q1', 'desc');
            // Add 10 responses — with LINES_PER_RESPONSE=4 and RESERVED=5, contentHeight=13 fits 2 responses
            for (let i = 0; i < 10; i++) {
                addResponse(db, q, i % 2 === 0 ? 'agent' : 'user', `Message ${i}`);
            }
            const { lastFrame } = setupWithHeight(db, q, 13);
            const frame = lastFrame()!;
            expect(frame).toContain('earlier response(s) hidden');
            // Most recent messages should be visible
            expect(frame).toContain('Message 9');
        });

        it('shows all responses when contentHeight is large enough', () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'First');
            addResponse(db, q, 'user', 'Second');
            const { lastFrame } = setupWithHeight(db, q, 50);
            const frame = lastFrame()!;
            expect(frame).toContain('First');
            expect(frame).toContain('Second');
            expect(frame).not.toContain('hidden');
        });

        it('shows all responses when contentHeight is not provided', () => {
            const q = createQuestion(db, 'q1', 'desc');
            for (let i = 0; i < 10; i++) {
                addResponse(db, q, 'agent', `Msg ${i}`);
            }
            const { lastFrame } = setup(db, q);
            const frame = lastFrame()!;
            expect(frame).toContain('Msg 0');
            expect(frame).toContain('Msg 9');
            expect(frame).not.toContain('hidden');
        });
    });

    // ---- Input mode transitions ----

    describe('input mode transitions', () => {
        it('"i" enters input mode — status bar changes', async () => {
            createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, 1);
            await tick();

            stdin.write('i');
            await tick();
            const frame = lastFrame();
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

        it('Esc with non-empty input clears text but stays in input mode', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('partial text');
            await tick();

            // First Esc clears the input but stays in input mode
            stdin.write(ESC);
            await tick();
            // Still in input mode (shows send/cancel hints)
            expect(lastFrame()).toContain('[Enter] Send');
        });

        it('Esc again (now empty) exits input mode', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('partial text');
            await tick();

            // First Esc clears
            stdin.write(ESC);
            await tick();

            // Second Esc exits input mode
            stdin.write(ESC);
            await tick();
            expect(lastFrame()).toContain('Press [i] or [Enter] to reply');
        });

        it('submitting a response exits input mode', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('a response');
            await tick();
            stdin.write(ENTER);
            await tick();

            // Should be back in command mode
            expect(lastFrame()).toContain('Press [i] or [Enter] to reply');
        });
    });

    // ---- Response submission ----

    describe('response submission', () => {
        it('typing text + Enter adds a user response to DB with correct body', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('My response here');
            await tick();
            stdin.write(ENTER);
            await tick();

            const responses = listResponses(db, q);
            expect(responses).toHaveLength(1);
            expect(responses[0]!.author).toBe('user');
            expect(responses[0]!.body).toBe('My response here');
        });

        it('response appears in conversation view after submit', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('New reply text');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(lastFrame()).toContain('New reply text');
        });

        it('response shows "You" label after submit', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame, stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('hello');
            await tick();
            stdin.write(ENTER);
            await tick();

            expect(lastFrame()).toContain('You');
        });

        it('empty submit (Enter with no text) does NOT add a response', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write(ENTER);
            await tick();

            const responses = listResponses(db, q);
            expect(responses).toHaveLength(0);
        });

        it('whitespace-only submit does NOT add a response', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { stdin } = setup(db, q);
            await tick();

            stdin.write('i');
            await tick();
            stdin.write('   ');
            await tick();
            stdin.write(ENTER);
            await tick();

            const responses = listResponses(db, q);
            expect(responses).toHaveLength(0);
        });

        it('unread marker disappears after user submits a response to agent message', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            addResponse(db, q, 'agent', 'Agent question here');

            const { lastFrame, stdin } = setup(db, q);
            await tick();

            // Initially shows unread marker
            expect(lastFrame()).toContain(UNREAD);

            // Submit a response
            stdin.write('i');
            await tick();
            stdin.write('My reply');
            await tick();
            stdin.write(ENTER);
            await tick();

            // Unread marker should be gone
            const frame = lastFrame()!;
            const lines = frame.split('\n');
            const markerLines = lines.filter(l => l.includes(UNREAD));
            expect(markerLines).toHaveLength(0);
        });
    });

    // ---- Status change actions (command mode) ----

    describe('status change actions', () => {
        it('"d" on Awaiting → User_Deferred', async () => {
            createQuestion(db, 'q1', 'desc'); // Awaiting by default
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('User_Deferred');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'User_Deferred' }));
        });

        it('"d" on Active → User_Deferred', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('User_Deferred');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'User_Deferred' }));
        });

        it('"d" on already-Deferred → no-op', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Deferred');
        });

        it('"d" on Resolved → no-op', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
        });

        it('"r" on Active → Resolved', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'Resolved' }));
        });

        it('"r" on Awaiting → Resolved', async () => {
            createQuestion(db, 'q1', 'desc');
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'Resolved' }));
        });

        it('"r" on already-Resolved → no-op', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Resolved');
        });

        it('"a" on Deferred → Awaiting', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Deferred');
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Awaiting');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'Awaiting' }));
        });

        it('"a" on Resolved → Awaiting', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Resolved');
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Awaiting');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'Awaiting' }));
        });

        it('"a" on Active → no-op', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
        });

        it('"a" on Awaiting → Active', async () => {
            createQuestion(db, 'q1', 'desc');
            // Awaiting is the default status
            const { onHeaderUpdate, stdin } = setup(db, 1);
            await tick();

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
            expect(onHeaderUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'Active' }));
        });
    });

    // ---- Input mode isolation ----

    describe('input mode isolation', () => {
        it('d, r, a keys are captured as text, NOT status actions, in input mode', async () => {
            createQuestion(db, 'q1', 'desc');
            updateStatus(db, 1, 'Active');
            const { stdin } = setup(db, 1);
            await tick();

            // Enter input mode
            stdin.write('i');
            await tick();

            // Press status keys — should be text input, not actions
            stdin.write('d');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');

            stdin.write('r');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');

            stdin.write('a');
            await tick();
            expect(getQuestion(db, 1)!.status).toBe('Active');
        });

        it('Esc in input mode does NOT call onBack', async () => {
            const q = createQuestion(db, 'q1', 'desc');
            const { stdin, onBack } = setup(db, q);
            await tick();

            // Enter input mode
            stdin.write('i');
            await tick();

            // Esc should exit input mode, not call onBack
            stdin.write(ESC);
            await tick();
            expect(onBack).not.toHaveBeenCalled();
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

        it('Esc on not-found screen calls onBack', async () => {
            const { stdin, onBack } = setup(db, 999);
            await tick();

            stdin.write(ESC);
            await tick();
            expect(onBack).toHaveBeenCalled();
        });
    });

    // ---- Refresh after response ----

    describe('auto-refresh polling (Fix N)', () => {
        it('external response appears after polling interval without user input', async () => {
            vi.useFakeTimers();
            const q = createQuestion(db, 'q1', 'desc');
            const { lastFrame } = setup(db, q);
            await vi.advanceTimersByTimeAsync(0); // initial render tick

            // Initially no responses
            expect(lastFrame()).toContain('No responses yet.');

            // External change (simulating agent response via daemon)
            addResponse(db, q, 'agent', 'external agent reply');

            // Before poll — not visible yet
            expect(lastFrame()).toContain('No responses yet.');

            // Advance past 3-second poll interval
            await vi.advanceTimersByTimeAsync(3100);

            // Now the agent's response should appear
            expect(lastFrame()).toContain('external agent reply');

            vi.useRealTimers();
        });
    });

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
