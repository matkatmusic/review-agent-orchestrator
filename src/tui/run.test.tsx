import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { AppWrapper, processResetFlag } from './run.js';

vi.mock('./mock-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./mock-store.js')>();
    return {
        ...actual,
        saveMockData: vi.fn(),
        resetMockData: vi.fn(),
    };
});

describe('run.tsx — AppWrapper', () => {

    it('app renders without crashing', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('Review Agent Orchestrator');
        expect(plain).toContain('Home');
    });

    it('renders header, content area, and footer in vertical order', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('Review Agent Orchestrator');
        expect(plain).toContain('Quit');
        const titlePos = plain.indexOf('Review Agent Orchestrator');
        const quitPos = plain.indexOf('Quit');
        expect(titlePos).toBeLessThan(quitPos);
    });

    it('falls back to 80x24 when stdout has no dimensions', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const lines = output.split('\n');
        expect(lines).toHaveLength(24);
    });

    it('content area shows issue list', () => {
        const { lastFrame } = render(<AppWrapper />);
        const output = lastFrame()!;
        const plain = stripAnsi(output);
        expect(plain).toContain('I-1');
        expect(plain).toContain('migrate_ServerDerivedFields');
    });

    // q → exit() verified manually in tmux; ESM prevents mocking useApp in tests.
});

describe('run.tsx — --resetMockData flag', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = process.argv;
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('--resetMockData flag is processed before render', async () => {
        const { resetMockData } = await import('./mock-store.js');
        const resetMock = vi.mocked(resetMockData);
        resetMock.mockClear();
        process.argv = ['node', 'run.js', '--resetMockData'];
        processResetFlag();
        expect(resetMock).toHaveBeenCalledOnce();
    });

    it('resetMockData is NOT called when flag is absent', async () => {
        const { resetMockData } = await import('./mock-store.js');
        const resetMock = vi.mocked(resetMockData);
        resetMock.mockClear();
        process.argv = ['node', 'run.js'];
        processResetFlag();
        expect(resetMock).not.toHaveBeenCalled();
    });
});

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = () => new Promise(r => setTimeout(r, 50));

describe('run.tsx — cascading unblock on resolve', () => {
    it('resolving all blockers transitions blocked issue to In Queue', async () => {
        // I-6 is Blocked (status 2), blocked by I-3 and I-5 per mock-data.default.json
        const { lastFrame, stdin } = render(<AppWrapper />);
        await settle();

        // Verify I-6 starts as Blocked
        let plain = stripAnsi(lastFrame()!);
        const i6Line = plain.split('\n').find(l => l.includes('I-6'));
        expect(i6Line).toContain('Blocked');

        // Navigate cursor down to I-3 (index 2: I-1=0, I-2=1, I-3=2)
        // Each arrow that crosses a status boundary triggers setFooterShortcuts → AppShell re-render
        stdin.write('\x1b[B'); await tick();
        stdin.write('\x1b[B'); await settle();
        // Press 'r' to resolve I-3
        stdin.write('r'); await settle();

        plain = stripAnsi(lastFrame()!);
        // I-6 should still be Blocked (I-5 is not yet resolved)
        const i6StillBlocked = plain.split('\n').find(l => l.includes('I-6'));
        expect(i6StillBlocked).toContain('Blocked');

        // Navigate cursor down to I-5 (index 4: currently at 2, need 2 more)
        stdin.write('\x1b[B'); await tick(); // down to index 3
        stdin.write('\x1b[B'); await settle(); // down to index 4
        // Press 'r' to resolve I-5
        stdin.write('r'); await settle();

        plain = stripAnsi(lastFrame()!);
        // I-6 should now be In Queue (all blockers resolved)
        const i6Now = plain.split('\n').find(l => l.includes('I-6'));
        expect(i6Now).toContain('In Queue');
        expect(i6Now).not.toContain('Blocked');
    });
});
