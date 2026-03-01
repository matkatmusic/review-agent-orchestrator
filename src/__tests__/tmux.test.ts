import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import {
    isTmuxAvailable,
    hasSession,
    createSession,
    splitWindow,
    killPane,
    sendKeys,
    capturePaneTail,
    listPanes,
    isPaneAlive,
    killSession,
} from '../tmux.js';

const TEST_SESSION = 'qr-tmux-test';

// Skip all tests if tmux is not available
const tmuxAvailable = isTmuxAvailable();
const describeIfTmux = tmuxAvailable ? describe : describe.skip;

describeIfTmux('tmux', () => {
    beforeEach(() => {
        // Clean up any leftover test session
        killSession(TEST_SESSION);
    });

    afterEach(() => {
        killSession(TEST_SESSION);
    });

    it('hasSession returns false for nonexistent session', () => {
        expect(hasSession('qr-nonexistent-session-xyz')).toBe(false);
    });

    it('create session → exists', () => {
        createSession(TEST_SESSION);
        expect(hasSession(TEST_SESSION)).toBe(true);
    });

    it('create session returns pane ID', () => {
        const paneId = createSession(TEST_SESSION);
        expect(paneId).toMatch(/^%\d+$/);
    });

    it('split window → new pane ID returned', () => {
        createSession(TEST_SESSION);
        const paneId = splitWindow(TEST_SESSION);
        expect(paneId).toMatch(/^%\d+$/);
    });

    it('listPanes returns all panes in session', () => {
        const pane0 = createSession(TEST_SESSION);
        const pane1 = splitWindow(TEST_SESSION);

        const panes = listPanes(TEST_SESSION);
        expect(panes).toContain(pane0);
        expect(panes).toContain(pane1);
        expect(panes.length).toBeGreaterThanOrEqual(2);
    });

    it('send keys → captured in pane output', async () => {
        const paneId = createSession(TEST_SESSION);
        sendKeys(paneId, 'echo QR_TEST_MARKER_12345');

        // Small delay for the shell to process
        await new Promise(r => setTimeout(r, 200));

        const output = capturePaneTail(paneId, 10);
        expect(output).toContain('QR_TEST_MARKER_12345');
    });

    it('kill pane → no longer listed', () => {
        createSession(TEST_SESSION);
        const paneToKill = splitWindow(TEST_SESSION);

        expect(isPaneAlive(paneToKill, TEST_SESSION)).toBe(true);
        killPane(paneToKill);
        expect(isPaneAlive(paneToKill, TEST_SESSION)).toBe(false);
    });

    it('killPane is safe on already-dead pane', () => {
        // Should not throw
        killPane('%99999');
    });

    it('capturePaneTail returns empty for dead pane', () => {
        expect(capturePaneTail('%99999')).toBe('');
    });

    it('listPanes returns empty for nonexistent session', () => {
        expect(listPanes('qr-nonexistent-session-xyz')).toEqual([]);
    });

    it('isPaneAlive returns false for nonexistent pane', () => {
        expect(isPaneAlive('%99999')).toBe(false);
    });

    it('isPaneAlive scoped to session does not see panes from other sessions', () => {
        const OTHER_SESSION = 'qr-tmux-other-test';
        killSession(OTHER_SESSION);
        try {
            const otherPane = createSession(OTHER_SESSION);
            // The pane exists in OTHER_SESSION but not TEST_SESSION
            createSession(TEST_SESSION); // ensure TEST_SESSION exists
            expect(isPaneAlive(otherPane, OTHER_SESSION)).toBe(true);
            expect(isPaneAlive(otherPane, TEST_SESSION)).toBe(false);
        } finally {
            killSession(OTHER_SESSION);
        }
    });
});
