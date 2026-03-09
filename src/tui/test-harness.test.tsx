import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render } from 'ink-testing-library';
import { useInput } from 'ink';
import { TEST_KEYS } from './test-keys.js';
import { tick, settle, createTestApp, type TestApp } from './test-app.js';

vi.mock('./mock-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./mock-store.js')>();
    return {
        ...actual,
        saveMockData: vi.fn(),
        resetMockData: vi.fn(),
    };
});

function KeyCapture() {
    const [captured, setCaptured] = useState('');
    useInput((input, key) => {
        const parts: string[] = [];
        if (key.ctrl) parts.push('ctrl');
        if (key.meta) parts.push('meta');
        if (key.shift) parts.push('shift');
        if (key.leftArrow) parts.push('leftArrow');
        if (key.rightArrow) parts.push('rightArrow');
        if (key.upArrow) parts.push('upArrow');
        if (key.downArrow) parts.push('downArrow');
        parts.push(`input=${input}`);
        setCaptured(parts.join(','));
    });
    return <>{captured}</>;
}

describe('test-keys — key map verification', () => {
    it('key map: CTRL_R produces key.ctrl=true, input=\'r\'', async () => {
        const { lastFrame, stdin } = render(<KeyCapture />);
        await tick();
        stdin.write(TEST_KEYS.CTRL_R);
        await tick();
        const frame = lastFrame()!;
        expect(frame).toContain('ctrl');
        expect(frame).toContain('input=r');
    });

    it('key map: ALT_Q produces key.meta=true, input=\'q\'', async () => {
        const { lastFrame, stdin } = render(<KeyCapture />);
        await tick();
        stdin.write(TEST_KEYS.ALT_Q);
        await tick();
        const frame = lastFrame()!;
        expect(frame).toContain('meta');
        expect(frame).toContain('input=q');
    });

    it('key map: CTRL_SHIFT_RIGHT produces ctrl+shift+rightArrow', async () => {
        const { lastFrame, stdin } = render(<KeyCapture />);
        await tick();
        stdin.write(TEST_KEYS.CTRL_SHIFT_RIGHT);
        await tick();
        const frame = lastFrame()!;
        expect(frame).toContain('ctrl');
        expect(frame).toContain('shift');
        expect(frame).toContain('rightArrow');
    });

    it('key map: CTRL_ALT_Q produces ctrl+meta, input=\'q\'', async () => {
        const { lastFrame, stdin } = render(<KeyCapture />);
        await tick();
        stdin.write(TEST_KEYS.CTRL_ALT_Q);
        await tick();
        const frame = lastFrame()!;
        expect(frame).toContain('ctrl');
        expect(frame).toContain('meta');
        expect(frame).toContain('input=q');
    });
});

describe('test-app — createTestApp verification', () => {
    let app: TestApp;

    afterEach(() => {
        app?.cleanup();
    });

    it('createTestApp renders and returns frame with mock data', async () => {
        app = createTestApp();
        await settle();
        const frame = app.frame();
        expect(frame).toContain('Review Agent Orchestrator');
        expect(frame).toContain('I-1');
    });

    it('press(\'down\') changes the rendered frame', async () => {
        app = createTestApp();
        await settle();
        const before = app.frame();
        await app.press('down');
        await settle();
        const after = app.frame();
        expect(before).not.toBe(after);
        // Cursor should have moved from I-1 to I-2
        const cursorLine = after.split('\n').find(l => l.includes('\u25B8'));
        expect(cursorLine).toContain('I-2');
    });
});

function cursorLine(frame: string): string | undefined {
    return frame.split('\n').find(l => l.includes('\u25B8'));
}

function issueLine(frame: string, inum: number): string | undefined {
    return frame.split('\n').find(l => l.includes(`I-${inum}`));
}

function isFlashing(frame: string, inum: number): boolean {
    const line = issueLine(frame, inum);
    return line !== undefined && line.includes('>') && line.includes('<');
}

describe('test-app — blocked flash sequence', () => {
    let app: TestApp;

    afterEach(() => {
        app?.cleanup();
    });

    it('navigate to I-6, press e to flash blockers, press down to clear flash', async () => {
        app = createTestApp();
        await settle();

        // Navigate down 5 times: I-1 → I-2 → I-3 → I-4 → I-5 → I-6
        await app.press('down', 'down', 'down', 'down', 'down');
        await settle();
        expect(cursorLine(app.frame())).toContain('I-6');

        // I-6 is Blocked — press 'e' to trigger flash on its blockers (I-3, I-5)
        await app.press('e');
        await settle();
        expect(isFlashing(app.frame(), 3)).toBe(true);
        expect(isFlashing(app.frame(), 5)).toBe(true);
        expect(isFlashing(app.frame(), 1)).toBe(false);

        // Move cursor down — flash should clear
        await app.press('down');
        await settle();
        expect(cursorLine(app.frame())).toContain('I-7');
        expect(isFlashing(app.frame(), 3)).toBe(false);
        expect(isFlashing(app.frame(), 5)).toBe(false);
    });
});
